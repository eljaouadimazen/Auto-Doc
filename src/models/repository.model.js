const { Octokit } = require('@octokit/rest');
const path = require('path');
const ProjectFile = require('./project-file.model');
const AuditLog = require('./audit-log.model');
const Documentation = require('./documentation.model');

// Dependency injection proxy objects for doc generation
const EnforcedOrchestrator = require('../agents/enforced-orchestrator.agent');
const protocol = require('../agents/protocol');
const llmService = require('../services/llm.service');
const llmInputBuilder = require('../services/llm-input-builder.service');

const ALLOWED_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.json', '.md', '.html', '.css']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.github', 'vendor']);
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
    this.#name = match[2].replace(/\.git$/, '');
    
    this.#files = [];
    this.#documentation = null;
    this.#auditLog = new AuditLog();
    
    this.#octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN || '',
      headers: { 'user-agent': 'Auto-Doc-PFE-App' }
    });
  }

  static fromDTO(name, serializedFiles) {
    // Construct repository state from client DTO payload across stateless HTTP boundaries
    const repo = new Repository(`https://github.com/reconstruct/${name}`);
    repo.#files = serializedFiles.map(f => {
      const pf = new ProjectFile(f.path, f.content, f.extension, f.size);
      if (f.isSanitized) pf.Sanitize([]); // Mark sanitized
      return pf;
    });
    return repo;
  }

  get url() { return this.#url; }
  get name() { return this.#name; }
  get owner() { return this.#owner; }
  get files() { return this.#files; }
  get documentation() { return this.#documentation; }
  get auditLog() { return this.#auditLog; }

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
                if (item.name.startsWith('.') || SKIP_DIRS.has(item.name)) continue;
                if (item.type === 'dir') {
                    await this._recursiveFetchFiles(owner, repo, item.path);
                } else if (item.type === 'file') {
                    const ext = path.extname(item.name).toLowerCase();
                    if (!ALLOWED_EXTENSIONS.has(ext) || item.size > MAX_FILE_SIZE) continue;
                    
                    const content = await this._fetchFileContent(owner, repo, item.path);
                    if (content) {
                      const projectFile = new ProjectFile(item.path, content, ext, item.size);
                      this.#files.push(projectFile);
                    }
                }
            }
        }
    } catch (error) { console.error(`Failed to fetch ${currentPath}`); }
  }

  async _fetchFileContent(owner, repo, filePath) {
    try {
        const { data } = await this.#octokit.repos.getContent({ owner, repo, path: filePath });
        return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (err) { return null; }
  }

  async GenerateDocumentation(mode, provider) {
    const rawFiles = this.#files.map(f => f.toJSON());
    let docContent = '';
    let stats = {};

    if (mode === 'agentic') {
      const orchestrator = new EnforcedOrchestrator({
        onProgress: (p) => console.info(`[Pipeline Stage ${p.stage}]`, p.message)
      });
      const runId = protocol.generateRunId();
      const input = protocol.buildInput(
        `Generate Enforced Documentation for ${this.#name}`, 
        { repository: this.#name, runId },
        { files: rawFiles, provider }
      );
      
      const output = await orchestrator.run(input);
      if (output.status === 'failed') throw new Error(output.error || 'Pipeline failed');
      
      docContent = output.result.documentation;
      stats = output.result.stats || {};
    } else {
      const rawMarkdown = rawFiles.map(f => `FILE: ${f.path}\n---\n${f.content}`).join('\n\n');
      const messages = llmInputBuilder.build(rawMarkdown, { useAST: true, provider });
      docContent = await llmService.generate(messages.messages, null, provider);
      stats = { mode: 'classic' };
    }

    this.#documentation = new Documentation(docContent, stats);
    return {
  content: this.#documentation.content,
  stats:   this.#documentation.stats,
  audit:   this.#auditLog.GetSummary()   // add this
      }   ;
  }
} 
module.exports = Repository;
