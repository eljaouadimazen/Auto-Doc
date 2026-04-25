/**
 * enforced-orchestrator.agent.js
 */

const BaseAgent               = require('./base.agent');
const RepoAnalyzerAgent       = require('./repo-analyzer.agent');
const TemplateSelectorAgent   = require('./template-selector.agent');
const CodeIntelligenceAgent   = require('./code-intelligence.agent');
const SecurityAgent           = require('./security.agent');
const WriterAgent             = require('./writer.agent');
const DiagramAgent            = require('./diagram.agent'); 
const sanitizerService        = require('../services/sanitizer.service');
const diagramService          = require('../services/diagram.service'); 
const protocol                = require('./protocol');

const CODE_INTEL_LIMIT = 10;

class EnforcedOrchestrator extends BaseAgent {
  constructor(options = {}) {
    super('Orchestrator', 'Coordinateur du pipeline de documentation certifié.');
    this.analyzer         = new RepoAnalyzerAgent();
    this.templateSelector  = new TemplateSelectorAgent();
    this.codeAgent        = new CodeIntelligenceAgent();
    this.securityAgent    = new SecurityAgent();
    this.writer           = new WriterAgent();
    this.diagramAgent     = new DiagramAgent(); 
    this.onProgress       = options.onProgress || (() => {});
  }

  async execute(agentInput) {
    const { files }  = agentInput.input;
    const repository = agentInput.context.repository;

    // ── Stage 1: Filter high-signal files ──────────────────────────────
    const contextFiles = this.filterHighSignalFiles(files);
    this.onProgress({ stage: 1, message: `${contextFiles.length} files selected after filtering` });

    // ── Stage 2: Security gate ─────────────────────────────────────────
    const safeFiles = await this.runSecurityGate(contextFiles, agentInput.context);
    this.onProgress({ stage: 2, message: `${safeFiles.length} files cleared security gate` });

    // ── Stage 3: Repo Analyzer ─────────────────────────────────────────
    const analyzerInput = protocol.buildInput(
      'Analyze codebase logic and nature',
      agentInput.context,
      {
        repository,
        files: safeFiles.map(f => ({
          path:    f.path,
          snippet: (f.content || '').slice(0, 300),
          size:    (f.content || '').length
        }))
      }
    );
    const analysis = await this.analyzer.run(analyzerInput);
    if (analysis.status === 'failed') throw new Error(`RepoAnalyzer failed: ${analysis.error}`);
    
    const { projectNature, logicSignals, hasExecutableCode } = analysis.result;
    this.onProgress({ stage: 3, message: `Project classified as ${projectNature}` });

    // ── Stage 4: Template Selector ──────────────────────────────────────
    const templateInput = protocol.buildInput(
      'Select best documentation template',
      agentInput.context,
      { projectNature, logicSignals, hasExecutableCode }
    );
    const templateSelection = await this.templateSelector.run(templateInput);
    if (templateSelection.status === 'failed') throw new Error(`TemplateSelector failed: ${templateSelection.error}`);
    
    const { templateId, diagramType } = templateSelection.result; 
    this.onProgress({ stage: 4, message: `Template: ${templateId}, Diagram Mode: ${diagramType || 'NONE'}` });

    // ── Stage 7: Diagram Generation ──────────────────────────────────────
    let architectureDiagram = null;
    if (diagramType && diagramType !== 'NONE' && hasExecutableCode) {
      this.onProgress({ stage: 7, message: `Synthesizing ${diagramType} diagram...` });
      
      const diagramFiles = diagramService.filterHighSignalFiles(safeFiles, diagramType);
      const diagramInput = protocol.buildInput(
        'Generate architectural visualization',
        agentInput.context,
        {
          diagramType,
          projectNature,
          files: diagramFiles.map(f => ({ path: f.path, content: f.content }))
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
      fileAnalyses = await this.runCodeIntelligence(
        safeFiles.slice(0, CODE_INTEL_LIMIT),
        agentInput.context
      );
      this.onProgress({ stage: 5, message: `Code intelligence done on ${fileAnalyses.length} files` });
    }

    // ── Stage 6: Writer ─────────────────────────────────────────────────
    const writerInput = protocol.buildInput(
      'Write final documentation',
      agentInput.context,
      {
        projectNature,
        docStrategy: templateId,
        logicSignals,
        architectureDiagram, 
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
      stats: {
        filesAnalyzed: fileAnalyses.length,
        diagramGenerated: !!architectureDiagram
      }
    };
  }

  // ── Helper Methods (Must be inside the class) ────────────────────────

  async runSecurityGate(files, context) {
    const safe    = [];
    const flagged = [];

    for (const file of files) {
      const findings = sanitizerService.audit(file.content || '');
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
            context,
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

  async runCodeIntelligence(files, context) {
    const results = await Promise.allSettled(
      files.map(file => {
        const input = protocol.buildInput(
          'Analyze file structure',
          context,
          { path: file.path, content: file.content }
        );
        return this.codeAgent.run(input);
      })
    );

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
    const CRITICAL_EXT = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.yml', '.yaml'];
    const SKIP         = /node_modules|\/dist\/|\/build\/|\.git\//;

    return files
      .filter(f => !SKIP.test(f.path))
      .filter(f => CRITICAL_EXT.some(ext => f.path.endsWith(ext)))
      .filter(f => f.content && f.content.trim().length > 10)
      .sort((a, b) => this.fileScore(a.path) - this.fileScore(b.path))
      .slice(0, 25);
  }

  fileScore(p) {
    if (/app\.(js|ts|java|py)$/i.test(p)) return 0;
    if (/main\.(js|ts|java|py)$/i.test(p)) return 0;
    if (/controller/i.test(p)) return 2;
    if (/service/i.test(p)) return 3;
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