const githubService    = require('../services/github.service');
const llmInputBuilder  = require('../services/llm-input-builder.service');
const llmService       = require('../services/llm.service');
const sanitizerService = require('../services/sanitizer.service');

class GeneratorController {

  // STEP 1 — fetch + sanitize repo
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

  // STEP 2 — build LLM input (useAST flag passed from client)
  async buildInput(req, res) {
    try {
      const { rawMarkdown, useAST = true } = req.body;

      if (!rawMarkdown) {
        return res.status(400).json({ error: 'rawMarkdown is required' });
      }

      const llmInput = await llmInputBuilder.build(rawMarkdown, { useAST });

      res.json({
        step:     'build',
        mode:     llmInput.mode,   // 'ast' or 'raw' — shown in UI
        messages: llmInput.messages
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

      const documentation = await llmService.generate(messages);

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

      if (!githubUrl) {
        return res.status(400).json({ error: 'githubUrl is required' });
      }

      const rawMarkdown   = await githubService.generateFromUrl(githubUrl);
      const safeMarkdown  = sanitizerService.clean(rawMarkdown);
      const llmInput      = await llmInputBuilder.build(safeMarkdown, { useAST });
      const documentation = await llmService.generate(llmInput.messages);

      res.json({ step: 'complete', mode: llmInput.mode, documentation });
    } catch (err) {
      console.error('[generate]', err.message);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new GeneratorController();