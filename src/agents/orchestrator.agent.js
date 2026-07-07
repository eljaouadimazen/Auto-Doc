const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');

const BaseAgent               = require('./base.agent');
const RepoAnalyzerAgent       = require('./repo-analyzer.agent');
const CodeIntelligenceAgent   = require('./code-intelligence.agent');
const SecurityAgent           = require('./security.agent');
const WriterAgent             = require('./writer.agent');
const DiagramAgent            = require('./diagram.agent');
const diagramService          = require('../services/diagram.service');
const protocol                = require('./protocol');
const GraphService            = require('../services/graph.service');

const execAsync = util.promisify(exec);
const CODE_INTEL_LIMIT = 10;

const GRAPHIFY_BIN = (() => {
  const envBin = process.env.GRAPHFIY_BIN;
  if (envBin) return envBin;
  const candidates = [
    'graphify',
    path.join(os.homedir(), '.local', 'bin', 'graphify'),
    '/usr/local/bin/graphify',
  ];
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}
  }
  return 'graphify';
})();

function selectTemplate(projectNature) {
  const mapping = {
    BACKEND:       { templateId: 'FULL_SOFTWARE', diagramType: 'CLASS',       forbiddenSections: [] },
    FRONTEND:      { templateId: 'FULL_SOFTWARE', diagramType: 'COMPONENT',   forbiddenSections: [] },
    FULLSTACK:     { templateId: 'FULL_SOFTWARE', diagramType: 'CLASS',       forbiddenSections: [] },
    MOBILE:        { templateId: 'FULL_SOFTWARE', diagramType: 'COMPONENT',   forbiddenSections: [] },
    DEVOPS:        { templateId: 'FULL_SOFTWARE', diagramType: 'PIPELINE',    forbiddenSections: ['api', 'entities', 'error_handling', 'data_flow', 'configuration'] },
    LIBRARY:       { templateId: 'LIBRARY',       diagramType: 'CLASS',       forbiddenSections: ['api', 'entities', 'deployment', 'data_flow', 'error_handling', 'configuration'] },
    RESOURCE_LIST: { templateId: 'RESOURCE_LIST',  diagramType: 'NONE',       forbiddenSections: [] },
  };
  return mapping[projectNature] || { templateId: 'FULL_SOFTWARE', diagramType: 'NONE', forbiddenSections: [] };
}

class EnforcedOrchestrator extends BaseAgent {
  constructor(options = {}) {
    super('Orchestrator', 'Coordinateur du pipeline de documentation certifié.');
    this.analyzer           = new RepoAnalyzerAgent();
    this.codeAgent          = new CodeIntelligenceAgent();
    this.securityAgent      = new SecurityAgent();
    this.writer             = new WriterAgent();
    this.diagramAgent       = new DiagramAgent();
    this.onProgress       = options.onProgress || (() => {});
    this.session          = options.session || null;
  }

  async execute(agentInput) {
    const {
      files, provider,
      targetAudience    = 'DEVELOPER',
      docType           = 'README',
      forbiddenSections: clientForbiddenSections,
      businessModel     = '',
      projectProgress   = '',
      githubUrl,
    } = agentInput.input;
    const repository = agentInput.context.repository;
    const apiKey = agentInput.context.apiKey || null;

    // ── Stage 1: Filter high-signal files ──────────────────────────────
    const contextFiles = this.filterHighSignalFiles(files);
    this.onProgress({ stage: 1, message: `${contextFiles.length} files selected after filtering` });

    // ── Stage 2: Security gate ─────────────────────────────────────────
    const safeFiles = await this.runSecurityGate(contextFiles, agentInput.context, apiKey);
    this.onProgress({ stage: 2, message: `${safeFiles.length} files cleared security gate` });

    // ── Graphify: Clone repo and build knowledge graph ─────────────────
    let graphService = null;
    if (githubUrl) {
      graphService = await this.runGraphify(githubUrl);
    }

    // ── Stage 3: Repo Analyzer ─────────────────────────────────────────
    const userNature = agentInput.input.projectNature;
    let projectNature, logicSignals, hasExecutableCode, techStack;

    if (userNature) {
      projectNature     = userNature;
      logicSignals      = agentInput.input.logicSignals || [];
      techStack         = agentInput.input.techStack || [];
      hasExecutableCode = agentInput.input.hasExecutableCode !== undefined
        ? agentInput.input.hasExecutableCode
        : safeFiles.some(f =>
            ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.kt', '.dart', '.swift', '.rb', '.php', '.rs', '.vue', '.svelte'].some(ext =>
              f.path.endsWith(ext)
            )
          );
      this.onProgress({ stage: 3, message: `Project nature set by user: ${projectNature}` });
    } else {
      const graphContext = graphService ? graphService.getCommunitySummary() : null;
      const analyzerInput = protocol.buildInput(
        'Analyze codebase logic and nature',
        { ...agentInput.context, apiKey },
        {
          repository,
          files: safeFiles.map(f => ({
            path:    f.path,
            snippet: (f.content || '').slice(0, 300),
            size:    (f.content || '').length
          })),
          graphContext
        }
      );
      const analysis = await this.analyzer.run(analyzerInput);
      if (analysis.status === 'failed') throw new Error(`RepoAnalyzer failed: ${analysis.error}`);

      projectNature     = analysis.result.projectNature;
      logicSignals      = analysis.result.logicSignals;
      hasExecutableCode = analysis.result.hasExecutableCode;
      techStack         = analysis.result.techStack || [];
      this.onProgress({ stage: 3, message: `Project classified as ${projectNature}` });
    }

    // ── Stage 4: Template + Diagram Selection (deterministic) ─────────
    const template = selectTemplate(projectNature);
    const { templateId, diagramType } = template;
    const forbiddenSections = clientForbiddenSections || template.forbiddenSections;
    this.onProgress({ stage: 4, message: `Template: ${templateId}, Diagram: ${diagramType}` });

    // ── Stage 7: Diagram Generation ──────────────────────────────────────
    let architectureDiagram = null;
    if (diagramType && diagramType !== 'NONE' && hasExecutableCode) {
      this.onProgress({ stage: 7, message: `Synthesizing ${diagramType} diagram...` });

      const diagramFiles = diagramService.filterHighSignalFiles(safeFiles, diagramType);
      let retrievalFiles = [];
      if (graphService) {
        const diagramPaths = diagramFiles.map(f => f.path);
        const seen = new Set();
        for (const dp of diagramPaths) {
          const related = graphService.getRelatedFiles(dp, { filterAmbiguous: true });
          for (const r of related) {
            if (!seen.has(r.path)) {
              seen.add(r.path);
              retrievalFiles.push(r);
            }
          }
        }
      }
      const diagramInput = protocol.buildInput(
        'Generate architectural visualization',
        { ...agentInput.context, apiKey },
        {
          diagramType,
          projectNature,
          files: diagramFiles.map(f => ({ path: f.path, content: f.content })),
          retrievalFiles: retrievalFiles.map(f => ({ path: f.path, relationType: f.relationType }))
        }
      );

      const diagramResult = await this.diagramAgent.run(diagramInput);
      if (diagramResult.status === 'success') {
        architectureDiagram = diagramResult.result;
      }
    }

    // ── Stage 5: Code Intelligence ──────────────────────────────────────
    let fileAnalyses = [];
    if (hasExecutableCode) {
      const codeIntelFiles = graphService
        ? this.selectFilesByGraph(safeFiles, graphService, CODE_INTEL_LIMIT)
        : safeFiles.slice(0, CODE_INTEL_LIMIT);
      fileAnalyses = await this.runCodeIntelligence(
        codeIntelFiles,
        { ...agentInput.context, apiKey },
        apiKey,
        graphService
      );
      this.onProgress({ stage: 5, message: `Code intelligence done on ${fileAnalyses.length} files` });
    }

    // ── Overview: God nodes for landing page ─────────────────────────
    const godNodes = graphService ? graphService.getGodNodes(5) : [];

    // ── Stage 6: Writer ─────────────────────────────────────────────────
    const writerInput = protocol.buildInput(
      'Write final documentation',
      { ...agentInput.context, apiKey },
      {
        projectNature,
        docStrategy: templateId,
        logicSignals,
        techStack,
        forbiddenSections,
        architectureDiagram,
        targetAudience,
        businessModel,
        projectProgress,
        godNodes,
        fileAnalyses: fileAnalyses.length > 0
          ? fileAnalyses
          : safeFiles.map(f => ({
              path: f.path,
              type: this.inferFileType(f.path),
              snippet: (f.content || '').slice(0, 500)
            }))
      }
    );
    const writerResult = await this.writer.run(writerInput);
    if (writerResult.status === 'failed') throw new Error(`WriterAgent failed: ${writerResult.error}`);
    this.onProgress({ stage: 6, message: 'Documentation generated' });

    return {
      step: 'AnalysisComplete',
      projectNature,
      selectedTemplate: templateId,
      documentation: writerResult.result.documentation,
      architectureDiagram,
      godNodes,
      stats: {
        filesAnalyzed: fileAnalyses.length,
        diagramGenerated: !!architectureDiagram,
        graphEnabled: !!graphService,
      }
    };
  }

  async runGraphify(githubUrl) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-'));
    try {
      this.onProgress({ stage: 'graphify', message: 'Cloning repository for graph analysis...' });
      await execAsync(`git clone --depth 1 ${githubUrl} ${tmpDir}/repo`, { timeout: 120000 });

      this.onProgress({ stage: 'graphify', message: 'Running graphify to build knowledge graph...' });
      const graphifyTimeout = parseInt(process.env.GRAPHFIY_TIMEOUT, 10) || 300000;
      await execAsync(`${GRAPHIFY_BIN} .`, { cwd: `${tmpDir}/repo`, timeout: graphifyTimeout });

      const graphPath = path.join(tmpDir, 'repo', 'graphify-out', 'graph.json');
      if (!fs.existsSync(graphPath)) {
        console.warn(`[Orchestrator] graph.json not found at ${graphPath} — continuing without graph`);
        return null;
      }

      const raw = fs.readFileSync(graphPath, 'utf-8');
      const graphData = JSON.parse(raw);
      const gs = new GraphService();
      gs.loadGraph(graphData);
      this.onProgress({ stage: 'graphify', message: `Graph loaded: ${gs.nodes.size} nodes, ${gs.edges.length} edges` });
      return gs;

    } catch (e) {
      this.onProgress({ stage: 'graphify', message: `Graph unavailable — ${e.message}` });
      console.warn(`[Orchestrator] Graphify failed (pipeline continues without graph): ${e.message}`);
      return null;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // ── Helper Methods (Must be inside the class) ────────────────────────

  async runSecurityGate(files, context, apiKey) {
    const safe    = [];
    const flagged = [];
    const session = this.session;

    for (const file of files) {
      const findings = session ? session.audit(file.content || '') : [];
      if (findings.length === 0) {
        safe.push(file);
      } else {
        flagged.push({ file, findings });
      }
    }

    if (flagged.length > 0) {
      const securityChecks = await Promise.allSettled(
        flagged.map(({ file, findings }) => {
          const input = protocol.buildInput(
            'Confirm security findings',
            { ...context, apiKey },
            { path: file.path, content: file.content, regexFindings: findings }
          );
          return this.securityAgent.run(input);
        })
      );

      securityChecks.forEach((result, i) => {
        const { file } = flagged[i];
        if (result.status === 'fulfilled' && result.value.status === 'success') {
          const rec = result.value.result?.recommendation;
          if (rec === 'safe_to_send' || rec === 'redact_and_send') safe.push(file);
        }
      });
    }
    return safe;
  }

  async runCodeIntelligence(files, context, apiKey, graphService = null) {
    this.onProgress({ stage: 5, message: `Analyzing ${files.length} files with code intelligence...` });
    let completed = 0;
    const results = await Promise.allSettled(
      files.map(async file => {
        let relatedFiles = [];
        if (graphService) {
          try {
            relatedFiles = graphService.getRelatedFiles(file.path, { filterAmbiguous: true });
          } catch (e) {
            console.warn(`[Orchestrator] Graph query failed for ${file.path}: ${e.message}`);
          }
        }
        const input = protocol.buildInput(
          'Analyze file structure',
          { ...context, apiKey },
          { path: file.path, content: file.content, relatedFiles }
        );
        const result = await this.codeAgent.run(input);
        completed++;
        this.onProgress({ stage: 5, message: `Code intelligence: ${completed}/${files.length}` });
        return result;
      })
    );

    this.onProgress({ stage: 5, message: `Code intelligence complete: ${results.length} files analyzed` });
    return results.map((r, i) => {
      if (r.status === 'fulfilled' && r.value.status === 'success') return r.value.result;
      return {
        path: files[i].path,
        type: this.inferFileType(files[i].path),
        snippet: (files[i].content || '').slice(0, 500)
      };
    });
  }

  filterHighSignalFiles(files) {
    const CRITICAL_EXT = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.kt', '.dart', '.swift', '.rb', '.php', '.rs', '.vue', '.svelte', '.tf', '.gradle', '.properties', '.yml', '.yaml', '.env'];
    const SKIP         = /node_modules|\/dist\/|\/build\/|\.git\//;

    return files
      .filter(f => !SKIP.test(f.path))
      .filter(f => CRITICAL_EXT.some(ext => f.path.endsWith(ext)))
      .filter(f => f.content && f.content.trim().length > 10)
      .sort((a, b) => this.fileScore(a.path) - this.fileScore(b.path))
      .slice(0, 25);
  }

  selectFilesByGraph(files, graphService, limit) {
    const withMeta = files.map(f => ({
      file: f,
      degree: graphService.degrees.get(f.path) || 0,
      community: graphService.nodes.get(f.path)?.community,
      heuristic: this.fileScore(f.path),
    }));

    const byCommunity = new Map();
    for (const s of withMeta) {
      const c = s.community ?? 'unknown';
      if (!byCommunity.has(c)) byCommunity.set(c, []);
      byCommunity.get(c).push(s);
    }

    for (const [, members] of byCommunity) {
      members.sort((a, b) => b.degree - a.degree || a.heuristic - b.heuristic);
    }

    const entries = [...byCommunity.entries()];
    const selected = new Set();
    const result = [];

    let exhausted = false;
    while (result.length < limit && !exhausted) {
      exhausted = true;
      for (const [, members] of entries) {
        if (members.length === 0) continue;
        const next = members.shift();
        if (!selected.has(next.file.path)) {
          selected.add(next.file.path);
          result.push(next.file);
          exhausted = false;
        }
        if (result.length >= limit) break;
      }
    }

    if (result.length < limit) {
      for (const s of withMeta.sort((a, b) => b.degree - a.degree || a.heuristic - b.heuristic)) {
        if (result.length >= limit) break;
        if (!selected.has(s.file.path)) {
          selected.add(s.file.path);
          result.push(s.file);
        }
      }
    }

    return result;
  }

  fileScore(p) {
    if (/app\.(js|ts|java|py|dart|kt)$/i.test(p)) return 0;
    if (/main\.(js|ts|java|py|dart|kt)$/i.test(p)) return 0;
    if (/controller/i.test(p)) return 2;
    if (/service/i.test(p)) return 3;
    if (/component|screen|page/i.test(p)) return 2;
    if (/main\.dart|AppDelegate|MainActivity/i.test(p)) return 0;
    if (/main\.tf|provider\.tf|variables\.tf/i.test(p)) return 1;
    if (/\.github\/workflows/i.test(p)) return 1;
    if (/Dockerfile|docker-compose/i.test(p)) return 2;
    if (/build\.gradle|Podfile/i.test(p)) return 3;
    return 7;
  }

  inferFileType(path) {
    if (/controller/i.test(path)) return 'controller';
    if (/service/i.test(path))    return 'service';
    if (/repository|repo/i.test(path)) return 'repository';
    return 'source';
  }
}

module.exports = EnforcedOrchestrator;
