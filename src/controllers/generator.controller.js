const githubService    = require('../services/github.service');
const llmInputBuilder  = require('../services/llm-input-builder.service');
const llmService       = require('../services/llm.service');
const sanitizerService = require('../services/sanitizer.service');
const auditLog         = require('../services/audit-log.service');

function getApiKey(req) {
  return req.headers['x-api-key'] || null;
}

class GeneratorController {

  // STEP 1 — fetch + sanitize
  async fetchRepo(req, res) {
    try {
      const { githubUrl } = req.body;
      if (!githubUrl || !githubUrl.includes('github.com')) {
        return res.status(400).json({ error: 'Invalid GitHub URL' });
      }
      const rawMarkdown  = await githubService.generateFromUrl(githubUrl);
      const safeMarkdown = sanitizerService.clean(rawMarkdown);
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
  async buildInput(req, res) {
    try {
      const { rawMarkdown, useAST = true } = req.body;
      if (!rawMarkdown) return res.status(400).json({ error: 'rawMarkdown is required' });

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

      const llmInput = await llmInputBuilder.build(rawMarkdown, { useAST });

      res.json({
        step:         'build',
        mode:         llmInput.mode,
        messages:     llmInput.messages,
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

  // STEP 3 — call LLM
  async generateDocs(req, res) {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array is required' });
      }
      const apiKey        = getApiKey(req);
      const documentation = await llmService.generate(messages, apiKey);
      res.json({ step: 'generate', documentation });
    } catch (err) {
      console.error('[generateDocs]', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // FULL PIPELINE
  async generate(req, res) {
    try {
      const { githubUrl, useAST = true } = req.body;
      if (!githubUrl) return res.status(400).json({ error: 'githubUrl is required' });

      const apiKey        = getApiKey(req);
      const rawMarkdown   = await githubService.generateFromUrl(githubUrl);
      const safeMarkdown  = sanitizerService.clean(rawMarkdown);
      const llmInput      = await llmInputBuilder.build(safeMarkdown, { useAST });
      const documentation = await llmService.generate(llmInput.messages, apiKey);

      res.json({ step: 'complete', mode: llmInput.mode, documentation });
    } catch (err) {
      console.error('[generate]', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // ── KEY VALIDATION ───────────────────────────────────────────────
  // Real Groq validation via /models endpoint — zero tokens consumed
  async validateKey(req, res) {
    try {
      const apiKey = getApiKey(req);

      if (!apiKey) {
        return res.json({ valid: false, reason: 'No key provided' });
      }

      // Call llmService.validateKey — hits Groq /models, not /chat/completions
      const result = await llmService.validateKey(apiKey);
      return res.json(result);

    } catch (err) {
      console.error('[validateKey]', err.message);
      return res.status(500).json({ valid: false, reason: err.message });
    }
  }

  // ── AUDIT ────────────────────────────────────────────────────────
  getAuditLogs(req, res) {
    const { limit = 50, onlyIssues = 'false' } = req.query;
    const logs = auditLog.getLogs({
      limit:            parseInt(limit),
      onlyWithFindings: onlyIssues === 'true'
    });
    res.json({ logs, stats: auditLog.getStats() });
  }

  // ── CUSTOM RULES ─────────────────────────────────────────────────
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
}

module.exports = new GeneratorController();