/**
 * llm-input-builder.service.js
 *
 * Stage 2 of the Automated Sanitization Pipeline.
 *
 * Pipeline:
 *   parseMarkdown → filterFiles → sanitizeFiles (vault anonymization)
 *     → applyASTParsing / applyTokenBudget
 *       → createChunks (rate-limit-safe batches)
 *         → formatChunksForLLM
 *
 * KEY FIX — sentinel delimiter replaces backtick fence:
 *
 *   OLD (broken):  ## File: path\n```\n<content>\n```
 *   NEW (correct): ## File: path\n<<<CONTENT>>>\n<content>\n<<<END>>>
 *
 * The backtick fence silently dropped any file whose content contained
 * triple-backticks or large multiline blobs (PEM private keys, certificates,
 * .env files). The sentinel string <<<CONTENT>>> / <<<END>>> cannot appear
 * in any real source file, so parseMarkdown() now captures every file reliably.
 *
 * filesToMarkdown() in generator.controller.js produces this format.
 * parseMarkdown() here consumes it. Both must stay in sync.
 */

const crypto           = require('crypto');
const sanitizerService = require('./sanitizer.service');
const astParser        = require('./ast-parser.service');

class LLMInputBuilder {
  constructor() {
    this.MAX_FILE_CHARS       = 3000;
    this.MAX_FILE_CHARS_LOCAL = 800;

    this.CHUNK_SIZE       = 8_000;
    this.CHUNK_SIZE_LOCAL = 3_000;

    this.IGNORED_EXT = [
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp',
      '.lock', '.map', '.min.js', '.min.css',
      '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
      '.woff', '.woff2', '.ttf', '.eot',
      '.mp4', '.mp3', '.wav', '.avi',
      '.exe', '.dll', '.so', '.dylib'
    ];

    // SENSITIVE_FILENAMES intentionally absent — .env, id_rsa, keys etc. must
    // reach sanitizeFiles() for vault anonymization, not be silently dropped.
  }

  // ─── Public entry point ───────────────────────────────────────────────────────

  /**
   * @param   {string} markdownContent   Output of filesToMarkdown() — sentinel format
   * @param   {object} options
   * @param   {boolean} options.useAST   true = AST summaries (default), false = raw
   * @param   {string}  options.provider 'groq' | 'ollama'
   * @returns {{ chunks, mode, audit, vaultSize }}
   */
  async build(markdownContent, options = {}) {
    const useAST  = options.useAST !== false;
    const isLocal = options.provider === 'ollama';

    // Reset vault so tokens from a previous request never bleed into this one
    sanitizerService.resetVault();

    const parsed   = this.parseMarkdown(markdownContent);
    const filtered = this.filterFiles(parsed);
    const secured  = this.sanitizeFiles(filtered);           // vault populated here

    const prepared = useAST
      ? this.applyASTParsing(secured, isLocal)
      : this.applyTokenBudget(secured, isLocal);

    const enhanced  = this.addMetadata(prepared, options);
    const chunks    = this.createChunks(enhanced, isLocal);

    const formatted = useAST
      ? this.formatChunksForLLM_AST(chunks, enhanced, isLocal)
      : this.formatChunksForLLM_raw(chunks, enhanced);

    return {
      chunks:    formatted,
      mode:      useAST ? 'ast' : 'raw',
      vaultSize: sanitizerService._vault.size,
      audit: {
        filesScanned:  secured.files.length,
        filesAffected: secured.auditEntries?.length || 0,
        totalRedacted: secured.auditEntries?.reduce((n, e) => n + e.patterns.length, 0) || 0,
        findings:      secured.auditEntries || []
        // vault snapshot intentionally NOT returned to client — server-side logs only
      }
    };
  }

  // ─── Parsing ──────────────────────────────────────────────────────────────────

  /**
   * Parse the sentinel-delimited format produced by filesToMarkdown().
   *
   * Matches blocks of the form:
   *   ## File: path/to/file
   *   <<<CONTENT>>>
   *   <raw file content — any characters, any length>
   *   <<<END>>>
   */
  parseMarkdown(content) {
    const fileRegex = /^## File: (.+?)\n<<<CONTENT>>>\n([\s\S]*?)\n<<<END>>>/gm;
    const files = [];
    let match;

    while ((match = fileRegex.exec(content)) !== null) {
      const filePath = match[1].trim();
      const code     = match[2];
      files.push({
        path:      filePath,
        extension: this.getExtension(filePath),
        filename:  filePath.split('/').pop(),
        size:      code.length,
        hash:      crypto.createHash('sha1').update(code).digest('hex'),
        content:   code
      });
    }

    return { repository: this.extractRepoName(content), files };
  }

  extractRepoName(content) {
    const match = content.match(/^# (.+)$/m);
    return match ? match[1].trim() : 'unknown-repo';
  }

  getExtension(filePath) {
    const idx = filePath.lastIndexOf('.');
    return idx === -1 ? '' : filePath.slice(idx).toLowerCase();
  }

  // ─── Filtering ────────────────────────────────────────────────────────────────

  filterFiles(parsed) {
    const filtered = parsed.files.filter(f => {
      if (!f.content || f.size === 0)                                       return false;
      if (this.IGNORED_EXT.includes(f.extension))                           return false;
      if (/node_modules|vendor\/|\/dist\/|\/build\/|\.git\//.test(f.path))  return false;
      return true;
    });
    return { ...parsed, files: filtered };
  }

  // ─── Sanitization + audit ────────────────────────────────────────────────────

  sanitizeFiles(parsed) {
    const auditEntries = [];
    const files = parsed.files.map(file => {
      const findings = sanitizerService.audit(file.content);
      if (findings.length > 0) {
        auditEntries.push({ path: file.path, patterns: findings });
      }
      // anonymize() stores secrets in vault and replaces with tokens
      return { ...file, content: sanitizerService.anonymize(file.content) };
    });
    return { ...parsed, files, auditEntries };
  }

  // ─── Token budget (raw mode) ──────────────────────────────────────────────────

  applyTokenBudget(parsed, isLocal = false) {
    const MAX_FILE = isLocal ? this.MAX_FILE_CHARS_LOCAL : this.MAX_FILE_CHARS;

    const prioritized = [...parsed.files].sort((a, b) => {
      const p = f => /readme/i.test(f.filename)                    ? 0
        : /package\.json|requirements\.txt/.test(f.filename)       ? 1 : 2;
      return p(a) - p(b);
    });

    const kept = prioritized.map(file => {
      let content = file.content;
      if (content.length > MAX_FILE) {
        content = content.slice(0, MAX_FILE) + '\n/* FILE TRUNCATED */';
      }
      return { ...file, content };
    });

    return { ...parsed, files: kept, stats: { fileCount: kept.length, mode: 'raw' } };
  }

  // ─── AST mode ─────────────────────────────────────────────────────────────────

  applyASTParsing(parsed, isLocal = false) {
    const parsedFiles = astParser.parseFiles(parsed.files);

    const prioritized = [...parsedFiles].sort((a, b) => {
      const p = f => /readme/i.test(f.filename)                              ? 0
        : /package\.json|requirements\.txt|setup\.py/.test(f.filename)       ? 1
        : /\.(ts|js|py)$/.test(f.extension)                                  ? 2
        : 3;
      return p(a) - p(b);
    });

    const kept = prioritized.map(file => ({
      ...file,
      summary: astParser.toSummary(file)
    }));

    return {
      ...parsed,
      files: kept,
      stats: {
        fileCount:   kept.length,
        parsedCount: kept.filter(f => f.ast !== null).length,
        mode:        'ast'
      }
    };
  }

  // ─── Chunking ─────────────────────────────────────────────────────────────────

  createChunks(parsed, isLocal = false) {
    const CAP = isLocal ? this.CHUNK_SIZE_LOCAL : this.CHUNK_SIZE;

    const chunks  = [];
    let current   = [];
    let charCount = 0;

    for (const file of parsed.files) {
      const text = file.summary ?? file.content ?? '';
      const len  = text.length;

      if (current.length > 0 && charCount + len > CAP) {
        chunks.push({ files: current, totalChars: charCount, oversized: false });
        current   = [];
        charCount = 0;
      }

      current.push(file);
      charCount += len;
    }

    if (current.length > 0) {
      chunks.push({ files: current, totalChars: charCount, oversized: charCount > CAP });
    }

    return chunks;
  }

  // ─── Format: raw mode ─────────────────────────────────────────────────────────

  formatChunksForLLM_raw(chunks, parsedContent) {
    const { repository, stats } = parsedContent;
    const total = chunks.length;

    return chunks.map((chunk, idx) => {
      const fileList  = chunk.files.map(f => `- ${f.path} (${f.size} chars)`).join('\n');
      const filesText = chunk.files
        .map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
        .join('\n\n');

      const prompt = `You are a senior software architect and technical writer.

Repository: ${repository}
Chunk ${idx + 1} of ${total} — files in this batch:
${fileList}

${filesText}

Analyze these files and produce:
1. Project Overview (if chunk 1)
2. Architecture observations for this batch
3. Technologies & Dependencies
4. Key Files & Modules in this batch
5. Security Considerations
6. Setup & Usage hints (if relevant)
7. Uncertainties

Note: Tokens like [TOKEN_AWS_KEY_a7b2] represent secrets anonymized before this request.
Reference them by their token name in your documentation.`;

      return {
        messages:    [{ role: 'user', content: prompt }],
        chunkIndex:  idx,
        totalChunks: total,
        fileCount:   chunk.files.length,
        charCount:   chunk.totalChars
      };
    });
  }

  // ─── Format: AST mode ─────────────────────────────────────────────────────────

  formatChunksForLLM_AST(chunks, parsedContent, isLocal = false) {
    const { repository, stats, files } = parsedContent;
    const total = chunks.length;

    const allRoutes  = files.flatMap(f => f.ast?.expressRoutes || []);
    const allEnvVars = [...new Set(files.flatMap(f => f.ast?.envAccess || []))];
    const allDeps    = [...new Set(
      files.flatMap(f => (f.ast?.imports || [])
        .map(i => i.specifier || i.module)
        .filter(s => s && !s.startsWith('.'))
      )
    )];

    const crossFile = [
      allDeps.length    ? `**External dependencies:** ${allDeps.join(', ')}` : '',
      allRoutes.length  ? `**API routes:** ${allRoutes.map(r => `${r.method} ${r.path}`).join(', ')}` : '',
      allEnvVars.length ? `**Required env vars:** ${allEnvVars.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    return chunks.map((chunk, idx) => {
      const summaries = chunk.files.map(f => f.summary).join('\n\n');

      const prompt = isLocal
        ? `You are a technical writer. Analyze this code batch and write concise documentation.

Repository: ${repository} — Chunk ${idx + 1}/${total}
Dependencies: ${allDeps.slice(0, 10).join(', ')}
Routes: ${allRoutes.map(r => `${r.method} ${r.path}`).join(', ')}

Files:
${summaries}

Write: Architecture observations, API routes (if present), Setup hints.`

        : `You are a senior software architect and technical writer.

Analyze the structured code intelligence below and produce professional documentation for this batch.

## Repository: ${repository}  |  Chunk ${idx + 1} of ${total}
## Files in batch: ${chunk.files.length} of ${stats.fileCount} total

${idx === 0 ? `## Cross-File Intelligence (full repo)\n${crossFile || 'None detected.'}\n` : ''}
## File Summaries (this batch)
${summaries}

---

Produce documentation covering:
1. **Architecture** — layers, services, data flow visible in this batch
2. **Technologies & Dependencies** — inferred from imports
3. **API Reference** — routes and their likely purpose
4. **Key Modules** — purpose of each file/class/function in this batch
5. **Environment Configuration** — env vars and their purpose
6. **Security Notes** — observations from the code
${idx === 0 ? '7. **Project Overview** — what it does, who it\'s for\n8. **Setup & Usage** — install and run instructions\n' : ''}
9. **Uncertainties** — what cannot be determined from code alone

Tokens like [TOKEN_AWS_KEY_a7b2] are anonymized secrets. Reference them by token name.
Be precise. Do not invent functionality. Flag gaps explicitly.`;

      return {
        messages:    [{ role: 'user', content: prompt }],
        chunkIndex:  idx,
        totalChunks: total,
        fileCount:   chunk.files.length,
        charCount:   chunk.totalChars
      };
    });
  }

  // ─── Metadata ─────────────────────────────────────────────────────────────────

  addMetadata(parsedContent, options) {
    return {
      ...parsedContent,
      metadata: {
        timestamp:     new Date().toISOString(),
        source:        'github',
        schemaVersion: '2.0',
        mode:          parsedContent.stats?.mode || 'unknown',
        ...options.metadata
      }
    };
  }
}

module.exports = new LLMInputBuilder();