/**
 * orchestrator.agent.js
 *
 * Sub-issue 7 — Orchestrator Agent
 *
 * The brain of the agentic pipeline. Coordinates all agents:
 *   1. Receives raw repo content from github.service
 *   2. Runs Security Agent on all files (parallel)
 *   3. Runs Code Intelligence Agent on safe files (parallel, with rate limit awareness)
 *   4. Runs Architecture Agent on all results
 *   5. Runs Writer Agent to generate final documentation
 *
 * Handles:
 *   - Token rate limit management (batching with delays)
 *   - Parallel execution where safe
 *   - Fallback to regex AST parser if agents fail
 *   - Progress reporting via callbacks
 *   - LangSmith tracing of the full pipeline
 */

require('dotenv').config();
const BaseAgent            = require('./base.agent');
const CodeIntelligenceAgent = require('./code-intelligence.agent');
const SecurityAgent         = require('./security.agent');
const ArchitectureAgent     = require('./architecture.agent');
const WriterAgent           = require('./writer.agent');
const protocol              = require('./protocol');

// Fallback to existing regex parser if agents fail
const astParser        = require('../services/ast-parser.service');
const sanitizerService = require('../services/sanitizer.service');
const llmInputBuilder  = require('../services/llm-input-builder.service');

class OrchestratorAgent extends BaseAgent {
  constructor(options = {}) {
    super(
      'OrchestratorAgent',
      'You are an orchestrator coordinating a multi-agent documentation pipeline.',
      { maxRetries: 1, maxTokens: 100 }
    );

    // Agent instances
    this.codeAgent     = new CodeIntelligenceAgent();
    this.securityAgent = new SecurityAgent();
    this.archAgent     = new ArchitectureAgent();
    this.writerAgent   = new WriterAgent();

    // Rate limit config — Groq free tier: ~6000 TPM
    // Each Code Intelligence call uses ~800 tokens
    // So max ~7 files/minute safely
    this.BATCH_SIZE      = options.batchSize      ?? 3;   // files per batch
    this.BATCH_DELAY_MS  = options.batchDelayMs   ?? 12000; // 12s between batches
    this.MAX_FILES       = options.maxFiles        ?? 15;  // max files to analyze with agents

    // Progress callback — called after each major step
    this.onProgress = options.onProgress || (() => {});
  }

  /**
   * Main pipeline — replaces the entire AST + LLM Input Builder flow
   *
   * @param {Object} agentInput
   * @param {string} agentInput.context.repository - Repo name
   * @param {Array}  agentInput.input.files        - Array of {path, content} from github.service
   * @param {string} agentInput.input.provider     - 'groq' | 'ollama'
   * @returns {Object} { documentation, mode, stats }
   */
  async execute(agentInput) {
    const { files = [], provider = 'groq' } = agentInput.input;
    const { repository, runId } = agentInput.context;

    console.info(`[Orchestrator] Starting pipeline — ${files.length} files, repo: ${repository}`);
    this.onProgress({ step: 'start', total: files.length });

    // ── Phase 1: Filter and prioritize files ──────────────────
    const eligibleFiles = this.prioritizeFiles(files);
    console.info(`[Orchestrator] ${eligibleFiles.length} files selected for analysis`);
    this.onProgress({ step: 'filtered', count: eligibleFiles.length });

    // ── Phase 2: Security scan (parallel — fast) ──────────────
    console.info(`[Orchestrator] Phase 2 — Security scan`);
    const securityResults = await this.runSecurityPhase(
      eligibleFiles, repository, runId
    );
    this.onProgress({ step: 'security_done', findings: securityResults.filter(s => s.result?.riskLevel !== 'clean').length });

    // ── Phase 3: Code Intelligence (batched — rate limit aware) ─
    console.info(`[Orchestrator] Phase 3 — Code intelligence`);
    const safeFiles    = this.filterSafeFiles(eligibleFiles, securityResults);
    const fileAnalyses = await this.runCodeIntelligencePhase(
      safeFiles, repository, runId
    );
    this.onProgress({ step: 'code_done', analyzed: fileAnalyses.length });

    // ── Phase 4: Architecture analysis ───────────────────────
    console.info(`[Orchestrator] Phase 4 — Architecture analysis`);
    const archResult = await this.runArchitecturePhase(
      repository, runId, fileAnalyses,
      securityResults.map(s => s.result).filter(Boolean)
    );
    this.onProgress({ step: 'arch_done' });

    // ── Phase 5: Write documentation ─────────────────────────
    console.info(`[Orchestrator] Phase 5 — Writing documentation`);
    const docResult = await this.runWriterPhase(
      repository, runId,
      archResult?.result,
      fileAnalyses.map(f => f.result).filter(Boolean),
      securityResults.map(s => s.result).filter(Boolean)
    );
    this.onProgress({ step: 'done' });

    // ── Assemble final output ─────────────────────────────────
    const documentation = docResult?.result?.documentation
      || '# Documentation generation failed\n\nPlease try again.';

    const stats = {
      filesTotal:     files.length,
      filesAnalyzed:  fileAnalyses.length,
      securityIssues: securityResults.filter(s => s.result?.riskLevel !== 'clean').length,
      mode:           'agentic',
      runId
    };

    console.info(`[Orchestrator] Pipeline complete — ${stats.filesAnalyzed} files analyzed`);
    return { documentation, stats };
  }

  // ── Phase runners ──────────────────────────────────────────────

  async runSecurityPhase(files, repository, runId) {
    // Run all security scans in parallel — they are fast and lightweight
    const promises = files.map(file => {
      const regexFindings = sanitizerService.audit(file.content);
      const input = protocol.buildInput(
        'Scan for secrets',
        { repository, runId, previous: {} },
        { path: file.path, content: file.content, rawContent: file.content, regexFindings }
      );
      return this.securityAgent.run(input);
    });

    const results = await Promise.allSettled(promises);
    return results.map((r, i) => ({
      file:   files[i].path,
      result: r.status === 'fulfilled' ? r.value.result : null
    }));
  }

  async runCodeIntelligencePhase(files, repository, runId) {
    // Limit files to avoid excessive token usage
    const limited = files.slice(0, this.MAX_FILES);

    if (limited.length < files.length) {
      console.warn(`[Orchestrator] Limiting code analysis to ${this.MAX_FILES} files (${files.length} total)`);
    }

    const results = [];

    // Process in batches to respect rate limits
    for (let i = 0; i < limited.length; i += this.BATCH_SIZE) {
      const batch = limited.slice(i, i + this.BATCH_SIZE);
      console.info(`[Orchestrator] Code batch ${Math.floor(i/this.BATCH_SIZE) + 1} — ${batch.length} files`);

      const batchPromises = batch.map(file => {
        const input = protocol.buildInput(
          'Analyze this file',
          { repository, runId, previous: {} },
          { path: file.path, content: file.content }
        );
        return this.codeAgent.run(input);
      });

      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach((r, j) => {
        results.push({
          file:   batch[j].path,
          result: r.status === 'fulfilled' ? r.value.result : null
        });
      });

      // Wait between batches to avoid hitting rate limits
      if (i + this.BATCH_SIZE < limited.length) {
        console.info(`[Orchestrator] Waiting ${this.BATCH_DELAY_MS/1000}s before next batch...`);
        await this.sleep(this.BATCH_DELAY_MS);
      }
    }

    return results;
  }

  async runArchitecturePhase(repository, runId, fileAnalyses, securityResults) {
    const input = protocol.buildInput(
      'Build architecture map',
      { repository, runId, previous: {} },
      {
        fileAnalyses:    fileAnalyses.map(f => f.result).filter(Boolean),
        securityResults: securityResults
      }
    );
    return this.archAgent.run(input);
  }

  async runWriterPhase(repository, runId, archResult, fileAnalyses, securityResults) {
    const input = protocol.buildInput(
      'Generate documentation',
      { repository, runId, previous: {} },
      { architectureResult: archResult, fileAnalyses, securityResults }
    );
    return this.writerAgent.run(input);
  }

  // ── Helpers ───────────────────────────────────────────────────

  /**
   * Prioritize files for analysis
   * Entry points, services, and controllers first
   * Skip node_modules, dist, test files, binary files
   */
  prioritizeFiles(files) {
    const SKIP = /node_modules|\/dist\/|\/build\/|\.git\/|vendor\//;
    const SKIP_EXT = ['.png','.jpg','.gif','.svg','.ico','.woff','.ttf','.pdf','.zip','.lock'];
    const SENSITIVE = ['.env', 'secrets', 'credentials', 'id_rsa'];

    const eligible = files.filter(f => {
      if (SKIP.test(f.path)) return false;
      if (SKIP_EXT.some(e => f.path.endsWith(e))) return false;
      if (SENSITIVE.some(s => f.path.includes(s))) return false;
      if (!f.content || f.content.trim().length < 10) return false;
      return true;
    });

    // Sort by importance
    const priority = f => {
      if (/app\.(js|ts)$/.test(f.path))            return 0;
      if (/index\.(js|ts)$/.test(f.path))           return 1;
      if (/controller/i.test(f.path))               return 2;
      if (/service/i.test(f.path))                  return 3;
      if (/middleware/i.test(f.path))               return 4;
      if (/package\.json$/.test(f.path))            return 5;
      return 6;
    };

    return eligible.sort((a, b) => priority(a) - priority(b));
  }

  /**
   * Filter out files the Security Agent flagged as do_not_send
   */
  filterSafeFiles(files, securityResults) {
    const blocked = new Set(
      securityResults
        .filter(s => s.result?.recommendation === 'do_not_send')
        .map(s => s.file)
    );

    if (blocked.size > 0) {
      console.warn(`[Orchestrator] Blocking ${blocked.size} file(s) flagged by Security Agent`);
    }

    return files.filter(f => !blocked.has(f.path));
  }
}

module.exports = OrchestratorAgent;