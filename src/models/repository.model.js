const { Octokit } = require('@octokit/rest');
const path = require('path');
const ProjectFile = require('./project-file.model');
const AuditLog = require('./audit-log.model');
const Documentation = require('./documentation.model');
const { sanitizeLog } = require('../services/log-sanitizer');

const EnforcedOrchestrator = require('../agents/orchestrator.agent');
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
    repo.#files = serializedFiles.map(f =>
      new ProjectFile(f.path, f.content, f.extension, f.size)
    );
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
      console.error(`Failed to fetch ${currentPath}: ${sanitizeLog(error.message)}`);
    }
  }

  async _fetchFileContent(owner, repo, filePath) {
    try {
      const { data } = await this.#octokit.repos.getContent({ owner, repo, path: filePath });
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (err) { return null; }
  }

  async GenerateDocumentation(mode, provider, apiKey = null, options = {}) {
    const rawFiles = this.#files.map(f => f.toJSON());

    // Create an isolated session for this request — no race conditions.
    const session = sanitizerService.createSession();

    const sanitizedFiles = rawFiles.map(f => ({
      ...f,
      content: session.anonymize(f.content)
    }));

    let docContent;
    let stats;

    try {
      if (mode === 'agentic') {
        const orchestrator = new EnforcedOrchestrator({
          onProgress: (p) => console.info(`[Pipeline Stage ${p.stage}]`, p.message),
          session
        });
        const runId = protocol.generateRunId();
        const input = protocol.buildInput(
          `Generate Enforced Documentation for ${this.#name}`,
          { repository: this.#name, runId, apiKey: provider === 'ollama' ? null : apiKey, provider },
          { files: sanitizedFiles, provider, ...options }
        );

        const output = await orchestrator.run(input);
        if (output.status === 'failed') throw new Error(output.error || 'Pipeline failed');

        docContent = session.reintegrate(output.result.documentation);
        stats      = output.result.stats || {};

      } else {
        const rawMarkdown = sanitizedFiles
          .map(f => `## File: ${f.path}\n<<<CONTENT>>>\n${f.content}\n<<<END>>>`)
          .join('\n\n');

        const result = await llmInputBuilder.build(rawMarkdown, { useAST: true, provider, session });

        const parts = [];
        for (const chunk of result.chunks) {
          const chunkDoc     = await llmService.generate(chunk.messages, null, provider);
          const reintegrated = session.reintegrate(chunkDoc);
          parts.push(reintegrated);
        }

        docContent = parts.join('\n\n---\n\n');
        stats      = { mode: 'classic', chunksUsed: parts.length };
      }
    } finally {
      session.destroy();
    }

    this.#documentation = new Documentation(docContent, stats);
    return this.#documentation;
  }
}

module.exports = Repository;
