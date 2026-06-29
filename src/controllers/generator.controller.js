const User             = require('../models/user.model');
const Repository       = require('../models/repository.model');
const Documentation    = require('../models/documentation.model');
const llmInputBuilder  = require('../services/llm-input-builder.service');
const llmService       = require('../services/llm.service');
const sanitizerService = require('../services/sanitizer.service');
const sessionStore     = require('../services/sanitizer-session-store');
const { sanitizeLog }  = require('../services/log-sanitizer');
const auditStore       = require('../services/audit-store.service');
const PdfGeneratorService = require('../services/pdf-generator.service');

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

      const auditSummary = repository.auditLog.GetSummary();
      const fetchSessionId = `fetch_${repository.name}_${Date.now()}`;
      auditStore.store(fetchSessionId, auditSummary);

      res.json({
        step:         'fetch',
        files:        safeFiles,
        rawMarkdown,
        repoName:     repository.name,
        size:         rawMarkdown.length,
        preview:      rawMarkdown.substring(0, 1000),
        auditSummary,
        auditSessionId: fetchSessionId
      });
    } catch (err) {
      console.error('[fetchRepo]', sanitizeLog(err.message));
      res.status(500).json({ error: err.message });
    }
  }

  // --- STEP 2: BUILD INPUT ---
  async buildInput(req, res) {
    try {
      const { files, rawMarkdown, useAST } = req.body;
      const provider = getProvider(req);

      const context = rawMarkdown || filesToMarkdown(files || []);

      if (!context) {
        return res.status(400).json({ error: 'No content to build from — run Fetch Repo first' });
      }

      const session = sanitizerService.createSession();
      const result = await llmInputBuilder.build(context, { useAST, provider, session });

      const sessionId = sessionStore.create(session);
      if (result.audit) {
        auditStore.store(sessionId, result.audit);
      }

      res.json({
        step:         'build',
        chunks:       result.chunks,
        totalChunks:  result.chunks.length,
        mode:         result.mode,
        vaultSize:    result.vaultSize,
        sessionId,
        auditSummary: result.audit
      });
    } catch (err) {
      console.error('[buildInput]', sanitizeLog(err.message));
      res.status(500).json({ error: err.message });
    }
  }

  // --- STEP 3: GENERATE DOCS ---
  async generateDocs(req, res) {
    try {
      const mode     = getMode(req);
      const provider = getProvider(req);
      const apiKey   = req.headers['x-api-key'] || null;
      const { chunks, messages, files, repoName } = req.body;

      const docType         = req.body.docType         || 'README';
      const targetAudience  = req.body.targetAudience  || 'DEVELOPER';
      const businessModel   = req.body.businessModel   || '';
      const projectProgress = req.body.projectProgress || '';

      // ── AGENTIC MODE ──────────────────────────────────────────────────
      if (mode === 'agentic') {
        if (!files || !Array.isArray(files)) {
          return res.status(400).json({
            error: 'Structured files array required for agentic mode'
          });
        }

        const repository = Repository.fromDTO(repoName, files);
        const docs       = await repository.GenerateDocumentation(mode, provider, apiKey, {
          projectNature:     req.body.projectNature,
          logicSignals:      req.body.logicSignals,
          hasExecutableCode: req.body.hasExecutableCode,
          techStack:         req.body.techStack,
          docType,
          targetAudience,
          businessModel,
          projectProgress
        });

        const response = {
          step:          'generate',
          documentation: docs.content,
          mode:          'agentic',
          stats:         docs.stats,
          targetAudience
        };

        if (docType === 'PDF') {
          try {
            const pdfBuffer = await PdfGeneratorService.generatePdf(
              docs.content,
              repoName,
              { ...docs.stats, generatedAt: docs.generatedAt }
            );
            response.pdfBase64 = pdfBuffer.toString('base64');
          } catch (pdfErr) {
            console.error('[generateDocs] PDF generation failed:', sanitizeLog(pdfErr.message));
            response.pdfError = pdfErr.message;
          }
        }

        return res.json(response);
      }

      // ── CLASSIC MODE — chunk iteration ────────────────────────────────
      // ── (A) New chunk-based flow — from buildInput ────────────────────
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

        const sessionId = req.body.sessionId;
        const session = sessionId ? sessionStore.get(sessionId) : null;

        if (!session) {
          return res.status(400).json({
            error: 'Session expired or not found — run Build Input again'
          });
        }

        try {
          const chunkResults = [];

          for (const chunk of chunks) {
            const chunkDoc     = await llmService.generate(chunk.messages, apiKey, provider);
            const reintegrated = session.reintegrate(chunkDoc);
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
        } finally {
          sessionStore.destroy(sessionId);
        }
      }

      // ── (B) Legacy single-messages flow ──────────────────────────────
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

      const session = sanitizerService.createSession();
      try {
        const rawDoc        = await llmService.generate(messages, apiKey, provider);
        const documentation = session.reintegrate(rawDoc);

        return res.json({
          step:          'generate',
          documentation,
          mode:          'classic',
          warning:       'Legacy messages path used — run Build Input first for full vault protection.'
        });
      } finally {
        session.destroy();
      }

    } catch (err) {
      console.error('[generateDocs]', sanitizeLog(err.message));
      res.status(500).json({ error: err.message });
    }
  }

  // --- PUBLISH TO GITHUB PAGES ---
  async publishDocs(req, res) {
    try {
      const { documentation, repoName, targetRepo, githubToken } = req.body;

      if (!documentation) {
        return res.status(400).json({ error: 'No documentation content provided' });
      }
      if (!targetRepo || !targetRepo.includes('/')) {
        return res.status(400).json({
          error: 'Target repository required — use format "owner/repo"'
        });
      }

      const token = githubToken || process.env.GITHUB_TOKEN;
      if (!token) {
        return res.status(400).json({
          error: 'GitHub token required. Provide one in the request body or set GITHUB_TOKEN in server environment.'
        });
      }

      const doc = new Documentation(documentation, {});
      const result = await doc.PublishToPages(targetRepo, token, repoName || targetRepo);

      return res.json(result);
    } catch (err) {
      console.error('[publishDocs]', sanitizeLog(err.message));
      return res.status(500).json({ error: err.message });
    }
  }

  // --- ANALYZE PROJECT NATURE ---
  async analyzeNature(req, res) {
    try {
      const { files, repoName } = req.body;
      if (!files || !Array.isArray(files)) {
        return res.status(400).json({ error: 'Files array required' });
      }

      const RepoAnalyzerAgent = require('../agents/repo-analyzer.agent');
      const protocol = require('../agents/protocol');

      const analyzer = new RepoAnalyzerAgent();
      const input = protocol.buildInput(
        'Analyze project nature',
        { repository: repoName || 'unknown' },
        {
          repository: repoName || 'unknown',
          files: files.map(f => ({
            path: f.path,
            snippet: (f.content || '').slice(0, 300),
            size: f.size || (f.content || '').length
          }))
        }
      );

      const output = await analyzer.run(input);
      if (output.status === 'failed') {
        return res.status(500).json({ error: output.error });
      }

      res.json(output.result);
    } catch (err) {
      console.error('[analyzeNature]', sanitizeLog(err.message));
      res.status(500).json({ error: err.message });
    }
  }

  // --- KEY VALIDATION ---
  async validateKey(req, res) {
  try {
    const provider = getProvider(req);

    // For Ollama (local), no API key needed — always valid
    if (provider === 'ollama') {
      return res.json({ valid: true, reason: 'Ollama (local) — no key required' });
    }

    // Extract the API key from the request header directly
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.json({ valid: false, reason: 'No API key provided' });
    }

    const result = await llmService.validateKey(apiKey, provider);
    return res.json(result);

  } catch (err) {
    res.status(500).json({ valid: false, reason: err.message });
  }
}

  // --- AUDIT LOGS ---
  getAuditLogs(req, res) {
    const sessionId = req.query.sessionId;
    if (sessionId) {
      const audit = auditStore.getBySessionId(sessionId);
      return res.json({ log: audit, found: !!audit });
    }
    res.json({ logs: auditStore.getAll() });
  }

  // --- RULES MANAGEMENT ---
  listRules(req, res) {
    const builtins = sanitizerService.builtinPatterns.map((p, idx) => ({
      id:      `builtin_${idx}`,
      name:    p.name,
      pattern: p.regex.source,
      flags:   p.regex.flags
    }));
    res.json({
      rules: [...builtins, ...sanitizerService.listCustomRules()]
    });
  }

  addRule(req, res) {
    try {
      const rule = sanitizerService.addCustomRule(req.body.name, req.body.pattern, req.body.flags);
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
      const regex = new RegExp(pattern, flags);
      const count = (sample.match(regex) || []).length;
      const matched = regex.test(sample);

      res.json({
        matched,
        count,
        preview: sample.replace(regex, '[REDACTED_SECRET]')
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

module.exports = new GeneratorController();
