const { Octokit } = require('@octokit/rest');
const path = require('path');
const ProjectFile = require('./project-file.model');
const AuditLog = require('./audit-log.model');
const Documentation = require('./documentation.model');

const EnforcedOrchestrator = require('../agents/enforced-orchestrator.agent');
const protocol = require('../agents/protocol');
const llmService = require('../services/llm.service');
const llmInputBuilder = require('../services/llm-input-builder.service');
const sanitizerService = require('../services/sanitizer.service');

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb',
  '.json', '.md', '.html', '.css', '.env', '.pem', '.key',
  '.txt', '.conf', '.yml', '.yaml'
]);
const SKIP_DIRS    = new Set(['node_modules', 'dist', 'build', '.git', '.github', 'vendor']);
const MAX_FILE_SIZE = 100_000;

class Repository {
  #url;
  #name;
  #owner;
  #files;
  #documentation;
  #auditLog;
  #octokit;

  constructor(url) {
    this.#url = url;
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/i);
    if (!match) throw new Error('Invalid GitHub URL');
    this.#owner = match[1];
    this.#name  = match[2].replace(/\.git$/, '');

    this.#files         = [];
    this.#documentation = null;
    this.#auditLog      = new AuditLog();

    this.#octokit = new Octokit({
      auth:    process.env.GITHUB_TOKEN || '',
      headers: { 'user-agent': 'Auto-Doc-PFE-App' }
    });
  }

  static fromDTO(name, serializedFiles) {
    const repo = new Repository(`https://github.com/reconstruct/${name}`);
    repo.#files = serializedFiles.map(f => {
      const pf = new ProjectFile(f.path, f.content, f.extension, f.size);
      if (f.isSanitized) pf.Sanitize([]);
      return pf;
    });
    return repo;
  }

  get url()           { return this.#url; }
  get name()          { return this.#name; }
  get owner()         { return this.#owner; }
  get files()         { return this.#files; }
  get documentation() { return this.#documentation; }
  get auditLog()      { return this.#auditLog; }

  async FetchFiles() {
    this.#files = [];
    await this._recursiveFetchFiles(this.#owner, this.#name, '');
    return this.#files;
  }

  async _recursiveFetchFiles(owner, repo, currentPath = '') {
    try {
      const { data } = await this.#octokit.repos.getContent({ owner, repo, path: currentPath });

      if (Array.isArray(data)) {
        for (const item of data) {
          if (SKIP_DIRS.has(item.name)) continue;

          if (item.type === 'dir') {
            await this._recursiveFetchFiles(owner, repo, item.path);
          } else if (item.type === 'file') {
            const ext = path.extname(item.name).toLowerCase();

            const isAllowedExt         = ALLOWED_EXTENSIONS.has(ext);
            const hasNoExtension       = ext === '' && !item.name.startsWith('.');
            const isExplicitSecretFile = item.name.startsWith('.env');

            if ((isAllowedExt || hasNoExtension || isExplicitSecretFile) && item.size <= MAX_FILE_SIZE) {
              const content = await this._fetchFileContent(owner, repo, item.path);
              if (content) {
                this.#files.push(new ProjectFile(item.path, content, ext, item.size));
              }
            } else {
              console.log(`Skipping file: ${item.path} (Ext: "${ext}")`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to fetch ${currentPath}: ${error.message}`);
    }
  }

  async _fetchFileContent(owner, repo, filePath) {
    try {
      const { data } = await this.#octokit.repos.getContent({ owner, repo, path: filePath });
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (err) { return null; }
  }

  async GenerateDocumentation(mode, provider) {
    const rawFiles = this.#files.map(f => f.toJSON());

    // Sanitize all files before any LLM path sees them.
    // anonymize() populates the vault so reintegrate() can restore values after.
    sanitizerService.resetVault();
    const sanitizedFiles = rawFiles.map(f => ({
      ...f,
      content: sanitizerService.anonymize(f.content)
    }));

    let docContent = '';
    let stats      = {};

    if (mode === 'agentic') {
      const orchestrator = new EnforcedOrchestrator({
        onProgress: (p) => console.info(`[Pipeline Stage ${p.stage}]`, p.message)
      });
      const runId = protocol.generateRunId();
      const input = protocol.buildInput(
        `Generate Enforced Documentation for ${this.#name}`,
        { repository: this.#name, runId },
        { files: sanitizedFiles, provider }   // sanitized, not raw
      );

      const output = await orchestrator.run(input);
      if (output.status === 'failed') throw new Error(output.error || 'Pipeline failed');

      // Reintegrate vault tokens in the orchestrator's output
      docContent = sanitizerService.reintegrate(output.result.documentation);
      stats      = output.result.stats || {};

    } else {
      // FIX: use sentinel format so parseMarkdown() can parse every file,
      // including those with PEM blocks or other multiline content.
      // FIX: use result.chunks[0].messages — build() no longer returns result.messages.
      const rawMarkdown = sanitizedFiles
        .map(f => `## File: ${f.path}\n<<<CONTENT>>>\n${f.content}\n<<<END>>>`)
        .join('\n\n');

      const result = await llmInputBuilder.build(rawMarkdown, { useAST: true, provider });

      // Iterate chunks (usually just one for agentic-classic path)
      const parts = [];
      for (const chunk of result.chunks) {
        const chunkDoc     = await llmService.generate(chunk.messages, null, provider);
        const reintegrated = sanitizerService.reintegrate(chunkDoc);
        parts.push(reintegrated);
      }

      docContent = parts.join('\n\n---\n\n');
      stats      = { mode: 'classic', chunksUsed: parts.length };
    }

    this.#documentation = new Documentation(docContent, stats);
    return this.#documentation;
  }
}

module.exports = Repository;