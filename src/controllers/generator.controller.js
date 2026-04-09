const githubService        = require('../services/github.service');
const llmInputBuilder      = require('../services/llm-input-builder.service');
const llmService           = require('../services/llm.service');
const sanitizerService     = require('../services/sanitizer.service');
const auditLog             = require('../services/audit-log.service');
const OrchestratorAgent    = require('../agents/orchestrator.agent');
const protocol             = require('../agents/protocol');
// ── NEW: nature-aware classifier + templates ──────────────────────────────────
const { detectProjectNature } = require('../services/Nature-Classifier.service');
const { buildNaturePrompt }   = require('../services/Project-Templates.service');

function getApiKey(req) {
  return req.headers['x-api-key'] || null;
}

function getProvider(req) {
  return req.headers['x-provider'] || 'groq';
}

function getMode(req) {
  return req.headers['x-mode'] || 'classic'; // 'classic' | 'agentic'
}

/**
 * Parse markdown string from github.service into array of {path, content}
 * The Orchestrator needs structured files, not a markdown blob
 */
function parseMarkdownToFiles(markdown) {
  const fileRegex = /## File: (.+?)\n```(?:\w+)?\n?([\s\S]*?)```/g;
  const files     = [];
  let match;
  while ((match = fileRegex.exec(markdown)) !== null) {
    files.push({
      path:    match[1].trim(),
      content: match[2]
    });
  }
  return files;
}

class GeneratorController {

  // STEP 1 — fetch + sanitize (unchanged)
  async fetchRepo(req, res) {
    try {
      const { githubUrl } = req.body;
      if (!githubUrl || !githubUrl.includes('github.com')) {
        return res.status(400).json({ error: 'Invalid GitHub URL' });
      }

      const Repository = require('../models/Repository');
      const repo = new Repository(githubUrl);
      const files = await repo.fetchFiles();

      files.forEach(f => f.sanitize());

      const safeMarkdown = files.map(f => `## File: ${f.path}\n\`\`\`\n${f.rawContent}\n\`\`\``).join('\n\n');

      res.json({
        step:        'fetch',
        rawMarkdown: safeMarkdown,
        size:        safeMarkdown.length,
        preview:     safeMarkdown.substring(0, 1000)
      });
    } catch (err) {
      console.error('[fetchRepo]', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // STEP 2 — build LLM input + audit
  // ── MODIFIED: runs nature detection and injects template into llmInputBuilder ─
  async buildInput(req, res) {
    try {
      const { rawMarkdown, useAST = true } = req.body;
      if (!rawMarkdown) return res.status(400).json({ error: 'rawMarkdown is required' });

      const provider = getProvider(req);

      const parsed        = llmInputBuilder.parseMarkdown(rawMarkdown);
      const fileAudits    = sanitizerService.auditFiles(parsed.files);
      const totalRedacted = fileAudits.reduce((sum, f) => sum + f.detectedPatterns.length, 0);

      auditLog.log({
        repository: parsed.repository,
        ip:         req.ip,
        mode:       useAST ? 'ast' : 'raw',
        fileAudits,
        totalRedacted
      });

      // ── NEW: detect nature from the parsed file list ──────────────────────────
      const filePaths                      = parsed.files.map(f => f.path);
      const { nature, confidence, scores } = detectProjectNature(filePaths);
      const naturePrompt                   = buildNaturePrompt(nature);

      console.info(`[buildInput] nature=${nature} | confidence=${confidence}% | scores=`, scores);

      // Pass naturePrompt into the builder so it can inject it into the system message.
      // llmInputBuilder.build() already accepts an options object — we add naturePrompt there.
      const llmInput = await llmInputBuilder.build(rawMarkdown, { useAST, provider, naturePrompt });

      res.json({
        step:     'build',
        mode:     llmInput.mode,
        messages: llmInput.messages,
        // ── NEW: surface detection result to the frontend ─────────────────────
        natureMeta: { nature, confidence, scores },
        auditSummary: {
          filesScanned:  parsed.files.length,
          totalRedacted,
          filesAffected: fileAudits.filter(f => f.detectedPatterns.length > 0).length
        }
      });
    } catch (err) {
      console.error('[buildInput]', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // STEP 3 — generate docs (classic OR agentic, unchanged)
  async generateDocs(req, res) {
    try {
      const mode = getMode(req);

      // ── AGENTIC MODE ──────────────────────────────────────────
      if (mode === 'agentic') {
        const { rawMarkdown } = req.body;
        if (!rawMarkdown) {
          return res.status(400).json({ error: 'rawMarkdown is required for agentic mode' });
        }

        const files      = parseMarkdownToFiles(rawMarkdown);
        const repository = rawMarkdown.match(/^# (.+)$/m)?.[1]?.trim() || 'unknown-repo';

        if (files.length === 0) {
          return res.status(400).json({ error: 'No files found in markdown — run Fetch first' });
        }

        console.info(`[generateDocs] Agentic mode — ${files.length} files, repo: ${repository}`);

        const orchestrator = new OrchestratorAgent({
          batchSize:    2,
          batchDelayMs: 15000,
          maxFiles:     10,
          onProgress:   (p) => console.info('[Orchestrator progress]', p)
        });

        const runId = protocol.generateRunId();
        const input = protocol.buildInput(
          'Generate documentation for this repository',
          { repository, runId, previous: {} },
          { files, provider: getProvider(req) }
        );

        const output = await orchestrator.run(input);

        if (output.status === 'failed') {
          return res.status(500).json({ error: output.error || 'Agentic pipeline failed' });
        }

        return res.json({
          step:          'generate',
          documentation: output.result.documentation,
          mode:          'agentic',
          stats:         output.result.stats
        });
      }

      // ── CLASSIC MODE ──────────────────────────────────────────
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array is required for classic mode' });
      }

      const apiKey        = getApiKey(req);
      const provider      = getProvider(req);
      const documentation = await llmService.generate(messages, apiKey, provider);

      res.json({ step: 'generate', documentation, mode: 'classic' });

    } catch (err) {
      console.error('[generateDocs]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // FULL CLASSIC PIPELINE
  // ── MODIFIED: nature detection added before llmInputBuilder.build() ───────────
  async generate(req, res) {
    try {
      const { githubUrl, useAST = true } = req.body;
      if (!githubUrl) return res.status(400).json({ error: 'githubUrl is required' });

      const apiKey       = getApiKey(req);
      const provider     = getProvider(req);

      const Repository = require('../models/Repository');
      const Documentation = require('../models/Documentation');
      
      const repo = new Repository(githubUrl);
      const files = await repo.fetchFiles();
      files.forEach(f => f.sanitize());
      const safeMarkdown = files.map(f => `## File: ${f.path}\n\`\`\`\n${f.rawContent}\n\`\`\``).join('\n\n');

      // ── NEW ───────────────────────────────────────────────────────────────────
      const filePaths                      = files.map(f => f.path);
      const { nature, confidence }         = detectProjectNature(filePaths);
      const naturePrompt                   = buildNaturePrompt(nature);
      console.info(`[generate] nature=${nature} | confidence=${confidence}%`);
      // ─────────────────────────────────────────────────────────────────────────

      const llmInput      = await llmInputBuilder.build(safeMarkdown, { useAST, provider, naturePrompt });
      const docContent    = await llmService.generate(llmInput.messages, apiKey, provider);
      
      const documentation = new Documentation(docContent, { mode: llmInput.mode, nature, confidence });

      res.json({ step: 'complete', mode: llmInput.mode, documentation: documentation.content, natureMeta: { nature, confidence } });
    } catch (err) {
      console.error('[generate]', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // ── KEY VALIDATION (unchanged) ────────────────────────────────────────────────
  async validateKey(req, res) {
    try {
      const apiKey = getApiKey(req);
      if (!apiKey) return res.json({ valid: false, reason: 'No key provided' });
      const result = await llmService.validateKey(apiKey);
      return res.json(result);
    } catch (err) {
      console.error('[validateKey]', err.message);
      return res.status(500).json({ valid: false, reason: err.message });
    }
  }

  // ── AUDIT (unchanged) ─────────────────────────────────────────────────────────
  getAuditLogs(req, res) {
    const { limit = 50, onlyIssues = 'false' } = req.query;
    const logs = auditLog.getLogs({
      limit:            parseInt(limit),
      onlyWithFindings: onlyIssues === 'true'
    });
    res.json({ logs, stats: auditLog.getStats() });
  }

  // ── CUSTOM RULES (unchanged) ──────────────────────────────────────────────────
  listRules(req, res) {
    res.json({ rules: sanitizerService.listCustomRules() });
  }

  addRule(req, res) {
    try {
      const { name, pattern, flags } = req.body;
      if (!name || !pattern) return res.status(400).json({ error: 'name and pattern are required' });
      const rule = sanitizerService.addCustomRule(name, pattern, flags);
      res.status(201).json({ message: 'Rule added', rule });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  removeRule(req, res) {
    try {
      sanitizerService.removeCustomRule(req.params.id);
      res.json({ message: 'Rule removed' });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  }

  testRule(req, res) {
    try {
      const { pattern, flags = 'gi', sample } = req.body;
      if (!pattern || !sample) return res.status(400).json({ error: 'pattern and sample are required' });
      const regex   = new RegExp(pattern, flags);
      const matches = [...sample.matchAll(regex)].map(m => ({ match: m[0], index: m.index }));
      res.json({
        matched: matches.length > 0,
        count:   matches.length,
        matches: matches.slice(0, 10),
        preview: sample.replace(regex, '[REDACTED_SECRET]')
      });
    } catch (err) {
      res.status(400).json({ error: `Invalid regex: ${err.message}` });
    }
  }

  // ── CLASSIFIER — standalone endpoint for testing/debugging ───────────────────
  // Replaces the old inline detectProjectNature arrow function.
  // Register it in your router as: POST /api/classify
  classifyNature(req, res) {
    try {
      const { fileList } = req.body;
      if (!fileList || !Array.isArray(fileList)) {
        return res.status(400).json({ error: 'fileList array is required' });
      }
      const result = detectProjectNature(fileList);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new GeneratorController();