const User             = require('../models/user.model');
const Repository       = require('../models/repository.model');
const llmInputBuilder  = require('../services/llm-input-builder.service');
const llmService       = require('../services/llm.service');
const sanitizerService = require('../services/sanitizer.service');
const SanitizationRule = require('../models/sanitization-rule.model');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUserContext(req) {
  const ip     = req.ip || 'unknown';
  const apiKey = req.headers['x-api-key'] || null;
  return new User(ip, apiKey);
}

function getProvider(req) { return req.headers['x-provider'] || 'groq'; }
function getMode(req)     { return req.headers['x-mode']     || 'classic'; }

/**
 * Serialize files into the sentinel-delimited format that parseMarkdown() expects.
 *
 * Format per file:
 *   ## File: path/to/file
 *   <<<CONTENT>>>
 *   <raw content>
 *   <<<END>>>
 *
 * WHY THIS FORMAT:
 * The previous backtick-fence format (```content```) silently dropped files
 * whose content contained triple-backticks or multiline blobs like PEM private
 * keys and .env files — the exact files most likely to contain secrets.
 * The sentinel strings <<<CONTENT>>> and <<<END>>> cannot appear in any real
 * source file, so every file is guaranteed to parse correctly.
 *
 * This function and parseMarkdown() in llm-input-builder.service.js must
 * always stay in sync — if you change the format here, change it there too.
 */
function filesToMarkdown(files) {
  return files
    .map(f => `## File: ${f.path}\n<<<CONTENT>>>\n${f.content}\n<<<END>>>`)
    .join('\n\n');
}

// ─── Controller ───────────────────────────────────────────────────────────────

class GeneratorController {

  // --- STEP 1: FETCH ---
  async fetchRepo(req, res) {
    try {
      const { githubUrl } = req.body;
      if (!githubUrl || !githubUrl.includes('github.com')) {
        return res.status(400).json({ error: 'Invalid GitHub URL' });
      }

      const user        = getUserContext(req);
      const repository  = await user.SubmitRepository(githubUrl);
      const safeFiles   = repository.files.map(f => f.toJSON());
      const rawMarkdown = filesToMarkdown(safeFiles);

      res.json({
        step:         'fetch',
        files:        safeFiles,
        rawMarkdown,
        repoName:     repository.name,
        size:         rawMarkdown.length,
        preview:      rawMarkdown.substring(0, 1000),
        auditSummary: repository.auditLog.GetSummary()
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
      const provider = getProvider(req);

      // Prefer the rawMarkdown sent by the client (already in sentinel format
      // from fetchRepo). Fall back to rebuilding it from files if needed.
      const context = rawMarkdown || filesToMarkdown(files || []);

      if (!context) {
        return res.status(400).json({ error: 'No content to build from — run Fetch Repo first' });
      }

      const result = await llmInputBuilder.build(context, { useAST, provider });

      res.json({
        step:         'build',
        chunks:       result.chunks,       // array of { messages, chunkIndex, totalChunks, fileCount, charCount }
        totalChunks:  result.chunks.length,
        mode:         result.mode,
        vaultSize:    result.vaultSize,
        auditSummary: result.audit         // vault snapshot excluded — server-side only
      });
    } catch (err) {
      console.error('[buildInput]', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // --- STEP 3: GENERATE DOCS ---
  async generateDocs(req, res) {
    try {
      const mode     = getMode(req);
      const provider = getProvider(req);
      const { chunks, messages, files, repoName } = req.body;

      // ── AGENTIC MODE ──────────────────────────────────────────────────────────
      if (mode === 'agentic') {
        if (!files || !Array.isArray(files)) {
          return res.status(400).json({
            error: 'Structured files array required for agentic mode'
          });
        }

        const repository = Repository.fromDTO(repoName, files);
        const docs       = await repository.GenerateDocumentation(mode, provider);

        return res.json({
          step:          'generate',
          documentation: docs.content,
          mode:          'agentic',
          stats:         docs.stats
        });
      }

      // ── CLASSIC MODE — chunk iteration ────────────────────────────────────────
      const apiKey = req.headers['x-api-key'] || null;

      // ── (A) New chunk-based flow — from buildInput ────────────────────────────
      if (chunks && Array.isArray(chunks) && chunks.length > 0) {
        const isValid = chunks.every(
          c => Array.isArray(c.messages) &&
               c.messages.every(m => m.role && typeof m.content === 'string')
        );
        if (!isValid) {
          return res.status(400).json({
            error: 'Each chunk must have messages: [{ role, content }] — run Build Input first'
          });
        }

        const chunkResults = [];

        for (const chunk of chunks) {
          const chunkDoc     = await llmService.generate(chunk.messages, apiKey, provider);
          // Swap vault tokens back to real values — runs entirely locally
          const reintegrated = sanitizerService.reintegrate(chunkDoc);
          chunkResults.push({
            chunkIndex: chunk.chunkIndex,
            content:    reintegrated,
            fileCount:  chunk.fileCount
          });
        }

        const documentation = chunkResults.length === 1
          ? chunkResults[0].content
          : chunkResults
              .map((r, i) => i === 0
                ? r.content
                : `---\n\n## Continued (files batch ${i + 1})\n\n${r.content}`)
              .join('\n\n');

        return res.json({
          step:          'generate',
          documentation,
          mode:          'classic',
          chunksUsed:    chunkResults.length
        });
      }

      // ── (B) Legacy single-messages flow ──────────────────────────────────────
      // Kept for backwards compatibility. Sanitization cannot be guaranteed here
      // because messages were constructed outside the pipeline.
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
          error: "Provide either 'chunks' (from Build Input) or a legacy 'messages' array"
        });
      }

      const isValid = messages.every(
        m => m.role && m.content && typeof m.content === 'string'
      );
      if (!isValid) {
        return res.status(400).json({ error: 'Each message must have { role, content }' });
      }

      const rawDoc        = await llmService.generate(messages, apiKey, provider);
      const documentation = sanitizerService.reintegrate(rawDoc);

      return res.json({
        step:          'generate',
        documentation,
        mode:          'classic',
        warning:       'Legacy messages path used — run Build Input first for full vault protection.'
      });

    } catch (err) {
      console.error('[generateDocs]', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // --- KEY VALIDATION ---
  async validateKey(req, res) {
    try {
      const user   = getUserContext(req);
      const result = await user.ValidateKey(llmService);
      return res.json(result);
    } catch (err) {
      res.status(500).json({ valid: false, reason: err.message });
    }
  }

  // --- AUDIT LOGS ---
  getAuditLogs(req, res) {
    res.json({
      logs: [],
      auditSummary: {
        filesScanned:  0,
        filesAffected: 0,
        totalRedacted: 0,
        findings:      [],
        message:       'Audit logs are per-session — read from the fetch or build response.'
      }
    });
  }

  // --- RULES MANAGEMENT ---
  listRules(req, res) {
    const user = getUserContext(req);
    res.json({
      rules: user.rules.map(r => ({
        id:      r.id,
        name:    r.name,
        pattern: r.pattern,
        flags:   r.flags
      }))
    });
  }

  addRule(req, res) {
    try {
      const user = getUserContext(req);
      const rule = user.ManageRules('add', req.body);
      res.status(201).json({ message: 'Rule added', rule });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  removeRule(req, res) {
    try {
      const user = getUserContext(req);
      user.ManageRules('remove', { id: req.params.id });
      res.json({ message: 'Rule removed' });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  }

  testRule(req, res) {
    try {
      const { pattern, flags = 'gi', sample } = req.body;
      const rule  = new SanitizationRule('test', 'test', pattern, flags);
      const count = (sample.match(new RegExp(pattern, flags)) || []).length;

      res.json({
        matched: rule.TestMatch(sample),
        count,
        preview: rule.Apply(sample)
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

module.exports = new GeneratorController();