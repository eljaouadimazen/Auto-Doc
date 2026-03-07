const crypto           = require('crypto');
const sanitizerService = require('./sanitizer.service');
const astParser        = require('./ast-parser.service');

class LLMInputBuilder {
  constructor() {
    this.MAX_FILE_CHARS  = 3000;
    this.MAX_TOTAL_CHARS = 20000;
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
   * @param {boolean} options.useAST - true = AST mode (default), false = raw mode
   */
  async build(markdownContent, options = {}) {
    const useAST = options.useAST !== false; // default ON

    const parsed   = this.parseMarkdown(markdownContent);
    const filtered = this.filterFiles(parsed);
    const secured  = this.sanitizeFiles(filtered);

    const prepared = useAST
      ? this.applyASTParsing(secured)
      : this.applyTokenBudget(secured);

    const enhanced = this.addMetadata(prepared, options);

    return useAST
      ? this.formatForLLM_AST(enhanced)
      : this.formatForLLM_raw(enhanced);
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
      if (/node_modules|\/vendor\/|\/dist\/|\/build\/|\/\.git\//.test(f.path)) return false;
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

  // ─── RAW MODE ────────────────────────────────────────────────

  applyTokenBudget(parsed) {
    let total = 0;
    const kept = [];
    const prioritized = [...parsed.files].sort((a, b) => {
      const p = f => /readme/i.test(f.filename) ? 0
        : /package\.json|requirements\.txt/.test(f.filename) ? 1 : 2;
      return p(a) - p(b);
    });
    for (const file of prioritized) {
      let content = file.content;
      if (content.length > this.MAX_FILE_CHARS) {
        content = content.slice(0, this.MAX_FILE_CHARS) + '\n/* FILE TRUNCATED */';
      }
      if (total + content.length > this.MAX_TOTAL_CHARS) break;
      total += content.length;
      kept.push({ ...file, content });
    }
    return { ...parsed, files: kept, stats: { fileCount: kept.length, totalChars: total, mode: 'raw' } };
  }

  formatForLLM_raw(content) {
    const fileList  = content.files.map(f => `- ${f.path} (${f.size} chars)`).join('\n');
    const filesText = content.files.map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

    const prompt = `You are a senior software architect and technical writer.

Analyze this repository and produce professional documentation with:
1. Project Overview
2. Architecture
3. Technologies & Dependencies
4. Key Files & Modules
5. Security Considerations
6. Setup & Usage
7. Uncertainties

Repository: ${content.repository}
Files (${content.stats.fileCount}): ${fileList}

${filesText}`;

    return { messages: [{ role: 'user', content: prompt }], mode: 'raw' };
  }

  // ─── AST MODE ────────────────────────────────────────────────

  applyASTParsing(parsed) {
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
      if (totalChars + summary.length > this.MAX_TOTAL_CHARS) break;
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

  formatForLLM_AST(content) {
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

    const prompt = `You are a senior software architect and technical writer.

Analyze the structured code intelligence below and produce professional documentation.

## Repository: ${repository}
## ${stats.fileCount} files analyzed, ${stats.parsedCount} parsed with AST

## Cross-File Intelligence
${crossFile || 'None detected.'}

## File Summaries
${summaries}

---

Produce documentation with:
1. **Project Overview** — what it does, who it's for
2. **Architecture** — layers, services, data flow
3. **Technologies & Dependencies** — inferred from imports
4. **API Reference** — routes and their likely purpose
5. **Key Modules** — purpose of each file/class/function
6. **Environment Configuration** — required env vars and their purpose
7. **Security Notes** — observations from the code
8. **Setup & Usage** — how to install and run
9. **Uncertainties** — what cannot be determined from code alone

Be precise. Do not invent functionality not evidenced in the code. Flag gaps explicitly.`;

    return { messages: [{ role: 'user', content: prompt }], mode: 'ast' };
  }

  addMetadata(parsedContent, options) {
    return {
      ...parsedContent,
      metadata: {
        timestamp:     new Date().toISOString(),
        source:        'github',
        schemaVersion: '1.2',
        mode:          parsedContent.stats?.mode || 'unknown',
        ...options.metadata
      }
    };
  }
}

module.exports = new LLMInputBuilder();