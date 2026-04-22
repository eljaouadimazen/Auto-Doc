const User = require('../models/user.model');
const Repository = require('../models/repository.model');
const llmInputBuilder = require('../services/llm-input-builder.service');

// Utility to construct the User domain model per request context
function getUserContext(req) {
  const ip = req.ip || 'unknown';
  const apiKey = req.headers['x-api-key'] || null;
  return new User(ip, apiKey);
}

function getProvider(req) { return req.headers['x-provider'] || 'groq'; }
function getMode(req)     { return req.headers['x-mode'] || 'classic'; }

class GeneratorController {
  
  // --- STEP 1: FETCH & SANITIZE ---
  async fetchRepo(req, res) {
    try {
      const { githubUrl } = req.body;
      if (!githubUrl || !githubUrl.includes('github.com')) {
        return res.status(400).json({ error: 'Invalid GitHub URL' });
      }

      const user = getUserContext(req);
      const repository = await user.SubmitRepository(githubUrl);
      
      // Map domain objects back to simple structs for the UI component
      const safeFiles = repository.files.map(f => f.toJSON());
      const rawMarkdown = safeFiles.map(f => `FILE: ${f.path}\n---\n${f.content}`).join('\n\n');

      res.json({
        step: 'fetch',
        files: safeFiles,
        rawMarkdown: rawMarkdown,
        repoName: repository.name,
        size: rawMarkdown.length,
        preview: rawMarkdown.substring(0, 1000)
      });
    } catch (err) {
      console.error('[fetchRepo]', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // --- STEP 2: BUILD INPUT ---
  async buildInput(req, res) {
    try {
      const { files, rawMarkdown, useAST } = req.body;
      const context = rawMarkdown || (files ? files.map(f => f.content).join('\n') : '');
      const messages = llmInputBuilder.build(context, useAST);

      res.json({
        step: 'build',
        messages,
        mode: useAST ? 'AST' : 'Raw',
        auditSummary: {} // Audit logic is encapsulated in the models per session
      });
    } catch (err) {
      console.error('[buildInput]', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // --- STEP 3: GENERATE ---
  async generateDocs(req, res) {
    try {
      const mode = getMode(req);
      const provider = getProvider(req);

      if (mode === 'agentic') {
        const { files, repoName } = req.body;
        if (!files || !Array.isArray(files)) {
          return res.status(400).json({ error: 'Structured files array required for agentic mode' });
        }
        
        // Reconstruct the Aggregate Root (Repository) from the UI DTO payload
        const repository = Repository.fromDTO(repoName, files);
        
        // Encapsulated generation workflow
        const docs = await repository.GenerateDocumentation(mode, provider);

        return res.json({
          step: 'generate',
          documentation: docs.content,
          mode: 'agentic',
          stats: docs.stats
        });
      }

      // Classic logic routing
      const { messages } = req.body;
      const llmService = require('../services/llm.service');
      const apiKey = req.headers['x-api-key'] || null;
      const documentation = await llmService.generate(messages, apiKey, provider);
      res.json({ step: 'generate', documentation, mode: 'classic' });

    } catch (err) {
      console.error('[generateDocs]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // --- USER AUTHENTICATION ---
  async validateKey(req, res) {
    try {
      const user = getUserContext(req);
      const llmService = require('../services/llm.service');
      const result = await user.ValidateKey(llmService);
      return res.json(result);
    } catch (err) {
      res.status(500).json({ valid: false, reason: err.message });
    }
  }

  // --- AUDIT SYSTEM ---
  getAuditLogs(req, res) {
    // Audit logs strictly tied to their respective repository models in OOP
    // Returning an empty state for global view backwards-compatibility
    res.json({ logs: [], stats: { message: 'Audit logs are encapsulated within individual Repository objects across sessions.' } });
  }

  // --- RULES MANAGEMENT ---
  listRules(req, res) {
    const user = getUserContext(req);
    res.json({ rules: user.rules.map(r => ({ id: r.id, name: r.name, pattern: r.pattern, flags: r.flags })) });
  }

  addRule(req, res) {
    try {
      const user = getUserContext(req);
      const rule = user.ManageRules('add', req.body);
      res.status(201).json({ message: 'Rule added', rule });
    } catch (err) { res.status(400).json({ error: err.message }); }
  }

  removeRule(req, res) {
    try {
      const user = getUserContext(req);
      user.ManageRules('remove', { id: req.params.id });
      res.json({ message: 'Rule removed' });
    } catch (err) { res.status(404).json({ error: err.message }); }
  }

  testRule(req, res) {
    try {
      const SanitizationRule = require('../models/sanitization-rule.model');
      const { pattern, flags = 'gi', sample } = req.body;
      const rule = new SanitizationRule('test', 'test', pattern, flags);
      const count = (sample.match(new RegExp(pattern, flags)) || []).length;
      
      res.json({
        matched: rule.TestMatch(sample),
        count,
        preview: rule.Apply(sample)
      });
    } catch (err) { res.status(400).json({ error: err.message }); }
  }
}

module.exports = new GeneratorController();