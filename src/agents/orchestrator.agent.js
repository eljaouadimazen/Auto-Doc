const BaseAgent               = require('./base.agent');
const RepoAnalyzerAgent       = require('./repo-analyzer.agent');
const CodeIntelligenceAgent   = require('./code-intelligence.agent');
const SecurityAgent           = require('./security.agent');
const WriterAgent             = require('./writer.agent');
const DiagramAgent            = require('./diagram.agent');
const GraphifyService         = require('../services/graphify.service');
const factExtractor           = require('../services/fact-extractor.service');
const diagramService          = require('../services/diagram.service');
const protocol                = require('./protocol');
const manifestParserService   = require('../services/manifest-parser.service');

const CODE_INTEL_LIMIT = 10;

function selectTemplate(projectNature, targetAudience) {
  const templateMap = {
    BACKEND:       { templateId: 'FULL_SOFTWARE', forbiddenSections: [] },
    FRONTEND:      { templateId: 'FULL_SOFTWARE', forbiddenSections: [] },
    FULLSTACK:     { templateId: 'FULL_SOFTWARE', forbiddenSections: [] },
    MOBILE:        { templateId: 'FULL_SOFTWARE', forbiddenSections: [] },
    DEVOPS:        { templateId: 'FULL_SOFTWARE', forbiddenSections: ['api', 'entities', 'error_handling', 'data_flow', 'configuration'] },
    LIBRARY:       { templateId: 'LIBRARY',       forbiddenSections: ['api', 'entities', 'deployment', 'data_flow', 'error_handling', 'configuration'] },
    RESOURCE_LIST: { templateId: 'RESOURCE_LIST', forbiddenSections: [] },
  };
  const base = templateMap[projectNature] || { templateId: 'FULL_SOFTWARE', forbiddenSections: [] };

  const isStakeholder = targetAudience === 'PROJECT_MANAGER' || targetAudience === 'PRODUCT_OWNER';
  const diagramType = isStakeholder ? 'C4_CONTAINER' : (() => {
    const natureMap = {
      BACKEND: 'CLASS', FRONTEND: 'COMPONENT', FULLSTACK: 'CLASS',
      MOBILE: 'COMPONENT', DEVOPS: 'PIPELINE', LIBRARY: 'CLASS',
      RESOURCE_LIST: 'NONE',
    };
    return natureMap[projectNature] || 'NONE';
  })();

  return { ...base, diagramType };
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
    console.info(`[Orchestrator] Stage 1: ${contextFiles.length} files selected (from ${files.length} total)`);
    if (contextFiles.length > 0) {
      console.info(`[Orchestrator]   contextFiles[0..4]:`, contextFiles.slice(0, 5).map(f => `${f.path} (${(f.content || '').length}c)`));
    }
    this.onProgress({ stage: 1, message: `${contextFiles.length} files selected after filtering` });

    // ── Stage 2: Security gate ─────────────────────────────────────────
    const safeFiles = await this.runSecurityGate(contextFiles, agentInput.context, apiKey);
    console.info(`[Orchestrator] Stage 2: ${safeFiles.length} files cleared security gate (from ${contextFiles.length})`);
    if (safeFiles.length > 0) {
      console.info(`[Orchestrator]   safeFiles[0..4]:`, safeFiles.slice(0, 5).map(f => `${f.path} (${(f.content || '').length}c)`));
    } else {
      console.warn(`[Orchestrator]   ALL files filtered by security gate!`);
    }
    this.onProgress({ stage: 2, message: `${safeFiles.length} files cleared security gate` });

    // ── Manifest parsing (deterministic, no LLM) ────────────────────────
    const manifestDependencies = manifestParserService.extract(safeFiles);

    // ── Graphify: Clone repo and build knowledge graph ─────────────────
    let graphService = null;
    let graphStats = null;
    if (githubUrl) {
      const result = await new GraphifyService().extract(githubUrl, { onProgress: this.onProgress });
      graphService = result.graphService;
      graphStats = result.stats;
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
    const template = selectTemplate(projectNature, targetAudience);
    const { templateId, diagramType } = template;
    const forbiddenSections = clientForbiddenSections || template.forbiddenSections;
    this.onProgress({ stage: 4, message: `Template: ${templateId}, Diagram: ${diagramType}` });

    let architectureDiagram = null;

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

    // ── Stage 7: Diagram Generation (after code intel for richer facts) ─
    if (diagramType && diagramType !== 'NONE' && hasExecutableCode) {
      this.onProgress({ stage: 7, message: `Synthesizing ${diagramType} diagram...` });

      let diagramFiles;
      if (diagramType === 'CLASS') {
        diagramFiles = diagramService.filterHighSignalFiles(files, 'CLASS', graphService);
        console.info(`[Orchestrator] Stage 7 (CLASS, bypass filter+gate): diagramFiles=${diagramFiles.length} (allFiles=${files.length})`);
      } else {
        diagramFiles = diagramService.filterHighSignalFiles(safeFiles, diagramType, graphService);
        console.info(`[Orchestrator] Stage 7: diagramFiles=${diagramFiles.length} (safeFiles=${safeFiles.length}, diagramType=${diagramType})`);
      }
      if (diagramFiles.length === 0 && (safeFiles.length > 0 || files.length > 0)) {
        console.warn(`[Orchestrator]   CRITICAL: All files scored ≤ 0!`);
      }

      const facts = factExtractor.extract(diagramFiles, diagramType, {
        graphService,
        manifestDependencies,
        techStack,
        businessModel,
      });
      console.info(`[Orchestrator] Facts: ${facts.stats.regexNames} names, ${facts.stats.totalEdges} edges`);

      const diagramInput = protocol.buildInput(
        'Generate architectural visualization',
        { ...agentInput.context, apiKey },
        { diagramType, facts }
      );

      const diagramResult = await this.diagramAgent.run(diagramInput);
      if (diagramResult.status === 'success') {
        architectureDiagram = diagramResult.result;
      }
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
        manifestDependencies,
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
    const CRITICAL_EXT = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.kt', '.dart', '.swift', '.rb', '.php', '.rs', '.vue', '.svelte', '.tf', '.gradle', '.properties', '.yml', '.yaml', '.env', '.xml', '.mod', '.toml', '.txt'];
    const SKIP         = /node_modules|\/dist\/|\/build\/|\.git\//;

    const filtered = files
      .filter(f => !SKIP.test(f.path))
      .filter(f => CRITICAL_EXT.some(ext => f.path.endsWith(ext)))
      .filter(f => f.content && f.content.trim().length > 10);

    const scored = filtered.map(f => ({ ...f, _fs: this.fileScore(f.path) }));
    const sorted = scored.sort((a, b) => a._fs - b._fs);
    const top80 = sorted.slice(0, 80);

    console.info(`[Orchestrator] filterHighSignalFiles: ${files.length}→${filtered.length}→${top80.length} | first 5 scores:`, top80.slice(0, 5).map(f => `${f.path} (score=${f._fs})`));
    console.info(`[Orchestrator]   last 5 of 80:`, top80.slice(-5).map(f => `${f.path} (score=${f._fs})`));

    // Strip debug field before returning
    return top80.map(({ _fs, ...rest }) => rest);
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
    if (/entity|model|domain|schema|value-object|persist/i.test(p)) return 0;
    if (/component|screen|page|view|widget|store|service|api|http|controller|repository|dao/i.test(p)) return 1;
    if (/(^|\/)(pom\.xml|build\.gradle(\.kts)?|package\.json|requirements\.txt|go\.mod|Cargo\.toml|pyproject\.toml)$/i.test(p)) return 3;
    if (/app\.(js|ts|java|py|dart|kt)$/i.test(p)) return 3;
    if (/main\.(js|ts|java|py|dart|kt)$/i.test(p)) return 3;
    if (/main\.dart|AppDelegate|MainActivity/i.test(p)) return 3;
    if (/build\.gradle|Podfile/i.test(p)) return 3;
    if (/Dockerfile|docker-compose/i.test(p)) return 3;
    if (/\.github\/workflows|main\.tf|provider\.tf|variables\.tf/i.test(p)) return 5;
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
