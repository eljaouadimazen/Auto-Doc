const crypto           = require('crypto');
const sanitizerService = require('./sanitizer.service');
const astParser        = require('./ast-parser.service');

class LLMInputBuilder {
  constructor() {
    this.MAX_FILE_CHARS  = 3000;
    this.MAX_TOTAL_CHARS = 20000;

    this.MAX_TOTAL_CHARS_LOCAL = 4000;
    this.MAX_FILE_CHARS_LOCAL  = 800;

    this.IGNORED_EXT = [
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp',
      '.lock', '.map', '.min.js', '.min.css',
      '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
      '.woff', '.woff2', '.ttf', '.eot',
      '.mp4', '.mp3', '.wav', '.avi',
      '.exe', '.dll', '.so', '.dylib'
    ];
    this.SENSITIVE_FILENAMES = [
      '.env', '.env.local', '.env.production', '.env.development',
      '.npmrc', '.pypirc', 'credentials', 'id_rsa', 'id_ed25519',
      'secrets.yaml', 'secrets.json', 'secrets.yml'
    ];
  }

  /**
   * @param {string} markdownContent
   * @param {Object} options
   * @param {boolean} options.useAST       - true = AST mode (default), false = raw mode
   * @param {string}  options.provider     - 'groq' | 'ollama'
   * @param {string}  options.naturePrompt - injected by GeneratorController after classification
   */
  async build(markdownContent, options = {}) {
    const useAST  = options.useAST !== false;
    const isLocal = options.provider === 'ollama';

    const parsed   = this.parseMarkdown(markdownContent);
    const filtered = this.filterFiles(parsed);
    const secured  = this.sanitizeFiles(filtered);

    const prepared = useAST
      ? this.applyASTParsing(secured, isLocal)
      : this.applyTokenBudget(secured, isLocal);

    const enhanced = this.addMetadata(prepared, options);

    return useAST
      ? this.formatForLLM_AST(enhanced, isLocal, options.naturePrompt)
      : this.formatForLLM_raw(enhanced, options.naturePrompt);
  }

  parseMarkdown(content) {
    const fileRegex = /## File: (.+?)\n```(?:\w+)?\n?([\s\S]*?)```/g;
    const files = [];
    let match;
    while ((match = fileRegex.exec(content)) !== null) {
      const filePath = match[1].trim();
      const code = match[2];
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

  filterFiles(parsed) {
    const filtered = parsed.files.filter(f => {
      if (!f.content || f.size === 0) return false;
      if (this.IGNORED_EXT.includes(f.extension)) return false;
      if (this.SENSITIVE_FILENAMES.includes(f.filename.toLowerCase())) return false;
      if (/node_modules|vendor\/|\/dist\/|\/build\/|\.git\//.test(f.path)) return false;
      return true;
    });
    return { ...parsed, files: filtered };
  }

  sanitizeFiles(parsed) {
    const files = parsed.files.map(file => ({
      ...file,
      content: sanitizerService.clean(file.content)
    }));
    return { ...parsed, files };
  }

  // ─── RAW MODE ────────────────────────────────────────────────────────────────

  applyTokenBudget(parsed, isLocal = false) {
    const MAX_FILE  = isLocal ? this.MAX_FILE_CHARS_LOCAL  : this.MAX_FILE_CHARS;
    const MAX_TOTAL = isLocal ? this.MAX_TOTAL_CHARS_LOCAL : this.MAX_TOTAL_CHARS;

    let total = 0;
    const kept = [];
    const prioritized = [...parsed.files].sort((a, b) => {
      const p = f => /readme/i.test(f.filename) ? 0
        : /package\.json|requirements\.txt/.test(f.filename) ? 1 : 2;
      return p(a) - p(b);
    });
    for (const file of prioritized) {
      let content = file.content;
      if (content.length > MAX_FILE) {
        content = content.slice(0, MAX_FILE) + '\n/* FILE TRUNCATED */';
      }
      if (total + content.length > MAX_TOTAL) break;
      total += content.length;
      kept.push({ ...file, content });
    }
    return { ...parsed, files: kept, stats: { fileCount: kept.length, totalChars: total, mode: 'raw' } };
  }

  formatForLLM_raw(content, naturePrompt = '') {
    const fileList  = content.files.map(f => `- ${f.path} (${f.size} chars)`).join('\n');
    const filesText = content.files.map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

    // Nature-aware structure if available, otherwise hard fallback with mandatory diagram
    const structureBlock = naturePrompt || `
You MUST generate a complete README.md with ALL of the following sections.
Do not skip any section. Do not replace the Architecture diagram with prose.

## 1. Project Overview
## 2. Tech Stack
## 3. Getting Started
   - Prerequisites, installation, environment variables table
## 4. API Reference (table: Method | Route | Description | Auth required)
## 5. Architecture

You MUST output this Mermaid block — replace node names with real ones from the code:

\`\`\`mermaid
flowchart TD
  Input["Entry point"] --> Core
  Core --> ServiceA
  Core --> ServiceB
  ServiceA --> DB["Database"]
  ServiceB --> DB
\`\`\`

> ✏️ [Edit this diagram](https://mermaid.live)

## 6. Environment Variables (table: Variable | Required | Description)
## 7. Security Notes — name the exact algorithm found or omit this section entirely
## 8. Setup & Usage
## 9. Contributing

Do NOT include an "Uncertainties" section.`.trim();

    const prompt = `You are a senior software architect and technical writer producing a professional README.md.

## Repository: ${content.repository}
## Files (${content.stats.fileCount})
${fileList}

---

${structureBlock}

---

## Source files

${filesText}`;

    return { messages: [{ role: 'user', content: prompt }], mode: 'raw' };
  }

  // ─── AST MODE ────────────────────────────────────────────────────────────────

  applyASTParsing(parsed, isLocal = false) {
    const MAX_TOTAL = isLocal ? this.MAX_TOTAL_CHARS_LOCAL : this.MAX_TOTAL_CHARS;

    const parsedFiles = astParser.parseFiles(parsed.files);

    let totalChars = 0;
    const kept = [];

    const prioritized = [...parsedFiles].sort((a, b) => {
      const p = f => /readme/i.test(f.filename) ? 0
        : /package\.json|requirements\.txt|setup\.py/.test(f.filename) ? 1
        : /\.(ts|js|py)$/.test(f.extension) ? 2
        : 3;
      return p(a) - p(b);
    });

    for (const file of prioritized) {
      const summary = astParser.toSummary(file);
      if (totalChars + summary.length > MAX_TOTAL) break;
      totalChars += summary.length;
      kept.push({ ...file, summary });
    }

    return {
      ...parsed,
      files: kept,
      stats: {
        fileCount:   kept.length,
        totalChars,
        parsedCount: kept.filter(f => f.ast !== null).length,
        mode:        'ast'
      }
    };
  }

  formatForLLM_AST(content, isLocal = false, naturePrompt = '') {
    const { files, repository, stats } = content;

    const allRoutes  = files.flatMap(f => f.ast?.expressRoutes || []);
    const allEnvVars = [...new Set(files.flatMap(f => f.ast?.envAccess || []))];
    const allDeps    = [...new Set(
      files.flatMap(f => (f.ast?.imports || [])
        .map(i => i.specifier || i.module)
        .filter(s => s && !s.startsWith('.'))
      )
    )];

    const summaries = files.map(f => f.summary).join('\n\n');

    const crossFile = [
      allDeps.length    ? `**External dependencies:** ${allDeps.join(', ')}` : '',
      allRoutes.length  ? `**API routes:** ${allRoutes.map(r => `${r.method} ${r.path}`).join(', ')}` : '',
      allEnvVars.length ? `**Required env vars:** ${allEnvVars.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    // ── Local model: tight budget, no diagram enforcement ─────────────────────
    if (isLocal) {
      return {
        messages: [{
          role: 'user',
          content: `You are a technical writer. Write concise documentation for this repository.

Repository: ${repository}
Dependencies: ${allDeps.slice(0, 10).join(', ')}
Routes: ${allRoutes.map(r => `${r.method} ${r.path}`).join(', ')}
Env vars: ${allEnvVars.join(', ')}

Files:
${summaries}

Write: Project Overview, Architecture, API Routes, Setup & Usage.`
        }],
        mode: 'ast'
      };
    }

    // ── Cloud model: nature-aware OR hard fallback with mandatory diagram ──────
    const structureBlock = naturePrompt || `
You MUST generate a complete README.md with ALL of the following sections.
Do not skip any section. Do not replace the Architecture diagram with prose.

## 1. Project Overview — what it does, who it's for
## 2. Architecture

You MUST output this Mermaid block — replace participant names with real ones from the code:

\`\`\`mermaid
sequenceDiagram
  participant Client
  participant Controller
  participant Service
  participant Repository
  participant Database

  Client->>Controller: POST /api/resource
  Controller->>Service: processRequest(data)
  Service->>Repository: findOrCreate(data)
  Repository->>Database: SQL query
  Database-->>Repository: result rows
  Repository-->>Service: entity
  Service-->>Controller: response DTO
  Controller-->>Client: 201 Created { id, ... }
\`\`\`

> ✏️ [Edit this diagram](https://mermaid.live)

## 3. Technologies & Dependencies — inferred from imports
## 4. API Reference — table: Method | Route | Description | Auth required
## 5. Key Modules — purpose of each file/class
## 6. Environment Variables — table: Variable | Required | Description
## 7. Security Notes — name the exact algorithm (BCrypt, JWT HS256) or omit entirely
## 8. Setup & Usage — prerequisites, install, run command
## 9. Contributing — branch strategy, PR process

Do NOT include an "Uncertainties" section.`.trim();

    const prompt = `You are a senior software architect and technical writer producing a professional README.md.

## Repository: ${repository}
## ${stats.fileCount} files analyzed, ${stats.parsedCount} parsed with AST

## Cross-file intelligence
${crossFile || 'None detected.'}

---

${structureBlock}

---

## File summaries

${summaries}`;

    return { messages: [{ role: 'user', content: prompt }], mode: 'ast' };
  }

  addMetadata(parsedContent, options) {
    return {
      ...parsedContent,
      metadata: {
        timestamp:     new Date().toISOString(),
        source:        'github',
        schemaVersion: '1.4',
        mode:          parsedContent.stats?.mode || 'unknown',
        ...options.metadata
      }
    };
  }
}

module.exports = new LLMInputBuilder();