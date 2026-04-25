  /**
   * writer.agent.js
   *
   * Integrated with Architecture Diagram rendering.
   */

  const BaseAgent = require('./base.agent');

  class WriterAgent extends BaseAgent {
    constructor() {
      super(
        'WriterAgent',
        `You are a senior technical writer creating professional software documentation.
  You write clear, accurate, and useful documentation based on structured code analysis.
  You NEVER invent functionality not evidenced in the data provided to you.
  If you do not have enough information for a section, say so explicitly rather than hallucinating.
  You write in markdown format. Be precise and professional.`,
        {
          temperature: 0.1,
          maxTokens:   3500,
          maxRetries:  2
        }
      );
    }

    async execute(agentInput) {
      const {
        projectNature       = 'BACKEND',
        docStrategy         = 'FULL_SOFTWARE',
        logicSignals        = [],
        fileAnalyses        = [],
        securityResults     = [],
        architectureDiagram = null, // <--- Received from Stage 7
      } = agentInput.input;

      const { repository } = agentInput.context;

      const moduleSummary = this.buildModuleSummary(fileAnalyses);

      if (docStrategy === 'RESOURCE_LIST') {
        const doc = await this.writeResourceDoc(repository, fileAnalyses);
        return { documentation: doc, sections: 3 };
      }

      // Run all sections in parallel
      const [overview, architecture, api, security, setup, modules] =
        await Promise.all([
          this.writeOverview(repository, projectNature, logicSignals, moduleSummary),
          // Pass diagram here
          this.writeArchitecture(projectNature, logicSignals, fileAnalyses, architectureDiagram),
          this.writeAPIReference(fileAnalyses, projectNature),
          this.writeSecuritySection(securityResults, logicSignals),
          this.writeSetupUsage(repository, projectNature, logicSignals),
          this.writeTechnicalModules(moduleSummary, projectNature),
        ]);

      const documentation = [
        overview, architecture, api, security, setup, modules,
        this.writeFooter(repository)
      ].join('\n\n---\n\n');

      return { documentation, sections: 6 };
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    buildModuleSummary(fileAnalyses) {
      return fileAnalyses.map(f => {
        if (f.purpose && f.responsibilities) {
          return `**${f.path}** (${f.type || 'source'})
  - Purpose: ${f.purpose}
  - Responsibilities: ${(f.responsibilities || []).join(', ')}
  - Dependencies: ${(f.dependencies || []).join(', ') || 'none'}
  - Routes: ${(f.routes || []).map(r => `${r.method} ${r.path}`).join(', ') || 'none'}
  - Complexity: ${f.complexity || 'unknown'}`;
        }
        return `**${f.path}** (${f.type || 'source'})
  ${f.snippet ? `\`\`\`\n${f.snippet.slice(0, 200)}\n\`\`\`` : '(no content)'}`;
      }).join('\n\n');
    }

    async writeOverview(repository, nature, signals, moduleSummary) {
      return this.callLLM(`Write a "## Project Overview" section for this repository.

  Repository: ${repository}
  Project type: ${nature}
  Detected signals: ${signals.join(', ')}

  Key files:
  ${moduleSummary.slice(0, 1500)}

  Write 3-4 sentences explaining what this project does and its main purpose.
  Base this ONLY on the data provided.`);
    }

    /**
     * Updated to handle Mermaid Diagram
     */
    async writeArchitecture(nature, signals, fileAnalyses, architectureDiagram) {
      const layers = this.inferLayers(fileAnalyses);
      
      let diagramSection = "";
      if (architectureDiagram) {
        diagramSection = `
  ### Architecture Visualization
  Include the following Mermaid.js code exactly as provided inside a mermaid code block:
  \`\`\`mermaid
  ${architectureDiagram}
  \`\`\`
  `;
      }

      return this.callLLM(`Write an "## Architecture" section.

  Project type: ${nature}
  Detected signals: ${signals.join(', ')}
  Detected layers: ${JSON.stringify(layers)}

  Instructions:
  1. Describe the structural organization and roles of controllers/services/models.
  2. ${architectureDiagram ? "INTEGRATE the Architecture Visualization provided below into your response." : "Note: No diagram was provided."}

  ${diagramSection}

  Base your description ONLY on the provided layer data.`);
    }

    async writeAPIReference(fileAnalyses, nature) {
      const routes = fileAnalyses.flatMap(f => f.routes || []);
      if (routes.length === 0) {
        const controllers = fileAnalyses.filter(f => /controller/i.test(f.path));
        if (controllers.length === 0) {
          return '## API Reference\n\n*No API routes could be detected.*';
        }
        return this.callLLM(`Write an "## API Reference" section.
  Inferred from: ${controllers.map(c => c.path).join(', ')}
  List likely endpoints based on controller names.`);
      }

      return this.callLLM(`Write an "## API Reference" section.
  Routes: ${JSON.stringify(routes, null, 2)}
  Document each endpoint with method, path, and purpose.`);
    }

    async writeSecuritySection(securityResults, signals) {
      const hasJwt = signals.some(s => /jwt|auth/i.test(s));
      const hasIssues = securityResults.filter(s => s.riskLevel !== 'clean');

      return this.callLLM(`Write a "## Security" section.
  JWT/Auth: ${hasJwt}
  Issues found: ${hasIssues.length}
  Describe the security approach based on detected signals.`);
    }

    async writeSetupUsage(repository, nature, signals) {
      return this.callLLM(`Write a "## Setup & Usage" section.
  Signals: ${signals.join(', ')}
  Provide specific instructions (npm install, mvn install, etc.) based on the stack.`);
    }

    async writeTechnicalModules(moduleSummary, nature) {
      return this.callLLM(`Write a "## Technical Specifications" section.
  ${moduleSummary.slice(0, 3000)}
  Group related files and describe their specific roles.`);
    }

    async writeResourceDoc(repository, fileAnalyses) {
      const fileList = fileAnalyses.map(f => `- ${f.path}`).join('\n');
      return this.callLLM(`Write resource documentation for ${repository}.\nFiles:\n${fileList}`);
    }

    inferLayers(fileAnalyses) {
      const layers = { controllers: [], services: [], repositories: [], models: [], config: [], other: [] };
      fileAnalyses.forEach(f => {
        const p = f.path.toLowerCase();
        if (/controller/i.test(p))        layers.controllers.push(f.path);
        else if (/service/i.test(p))      layers.services.push(f.path);
        else if (/repository|repo/i.test(p)) layers.repositories.push(f.path);
        else if (/entity|model/i.test(p)) layers.models.push(f.path);
        else if (/config/i.test(p))       layers.config.push(f.path);
        else                              layers.other.push(f.path);
      });
      return layers;
    }

    writeFooter(repository) {
      return `*Documentation generated automatically for \`${repository}\` using the Multi-Agent Pipeline.*`;
    }
  }

  module.exports = WriterAgent;