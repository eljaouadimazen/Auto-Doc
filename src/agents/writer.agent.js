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

  SECTION_SETS = {
    USER: ['overview', 'setup'],
    DEVELOPER: ['overview', 'architecture', 'api', 'security', 'setup', 'technical', 'business_model'],
    PROJECT_MANAGER: ['overview', 'architecture', 'api', 'security', 'business_model', 'progress'],
    PRODUCT_OWNER: ['overview', 'business_model', 'progress']
  };

  async execute(agentInput) {
    const {
      projectNature       = 'BACKEND',
      docStrategy         = 'FULL_SOFTWARE',
      logicSignals        = [],
      fileAnalyses        = [],
      securityResults     = [],
      architectureDiagram = null,
      targetAudience      = 'DEVELOPER',
      businessModel       = '',
      projectProgress     = '',
    } = agentInput.input;

    const { repository } = agentInput.context;
    const moduleSummary = this.buildModuleSummary(fileAnalyses);

    if (docStrategy === 'RESOURCE_LIST') {
      const doc = await this.writeResourceDoc(repository, fileAnalyses);
      return { documentation: doc, sections: 3 };
    }

    const sections = this.SECTION_SETS[targetAudience] || this.SECTION_SETS.DEVELOPER;

    const tasks = {};
    if (sections.includes('overview')) {
      tasks.overview = this.writeOverview(repository, projectNature, logicSignals, moduleSummary, targetAudience);
    }
    if (sections.includes('architecture')) {
      tasks.architecture = this.writeArchitecture(projectNature, logicSignals, fileAnalyses, architectureDiagram, targetAudience);
    }
    if (sections.includes('api')) {
      tasks.api = this.writeAPIReference(fileAnalyses, projectNature, targetAudience);
    }
    if (sections.includes('security')) {
      tasks.security = this.writeSecuritySection(securityResults, logicSignals, targetAudience);
    }
    if (sections.includes('setup')) {
      tasks.setup = this.writeSetupUsage(repository, projectNature, logicSignals, targetAudience);
    }
    if (sections.includes('technical')) {
      tasks.technical = this.writeTechnicalModules(moduleSummary, projectNature, targetAudience);
    }
    if (sections.includes('business_model')) {
      tasks.business_model = this.writeBusinessModel(businessModel, projectNature, repository);
    }
    if (sections.includes('progress')) {
      tasks.progress = this.writeProgress(projectProgress, repository);
    }

    const results = await Promise.all(Object.values(tasks));
    const keys = Object.keys(tasks);
    const parts = [];
    keys.forEach((key, i) => {
      if (results[i]) parts.push(results[i]);
    });

    parts.push(this.writeFooter(repository, targetAudience));
    const documentation = parts.join('\n\n---\n\n');

    return { documentation, sections: parts.length };
  }

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

  async writeOverview(repository, nature, signals, moduleSummary, audience) {
    const audienceInstruction = audience === 'USER'
      ? 'Write for end users with minimal technical knowledge. Explain what the project does in simple terms. Focus on the problem it solves and the value it provides. Avoid technical jargon, architecture details, and implementation specifics.'
      : audience === 'PROJECT_MANAGER'
      ? 'Write for project managers. Provide a high-level overview of the project scope, business context, objectives, and key deliverables. Emphasize business value and strategic importance.'
      : audience === 'PRODUCT_OWNER'
      ? 'Write for product owners. Focus on features, capabilities, and user-facing value. Describe what the system does from a product perspective.'
      : 'Write for developers. Provide a comprehensive overview including technical context, the problem domain, architecture philosophy, and key technologies.';

    return this.callLLM(`Write a "## Project Overview" section for this repository.

Repository: ${repository}
Project type: ${nature}
Detected signals: ${signals.join(', ')}

Key files:
${moduleSummary.slice(0, 1500)}

${audienceInstruction}

Write 3-5 sentences. Base this ONLY on the data provided.`);
  }

  async writeArchitecture(nature, signals, fileAnalyses, architectureDiagram, audience) {
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

    const depthInstruction = audience === 'PROJECT_MANAGER'
      ? 'Write a high-level architecture summary for project managers. Focus on major system components, how they interact, and technology choices. Skip low-level implementation details.'
      : 'Write a detailed architecture section for developers. Describe the structural organization and roles of all components (controllers, services, models, etc.).';

    return this.callLLM(`Write an "## Architecture" section.

Project type: ${nature}
Detected signals: ${signals.join(', ')}
Detected layers: ${JSON.stringify(layers)}

${depthInstruction}
${architectureDiagram ? "INTEGRATE the Architecture Visualization provided below into your response." : "Note: No diagram was provided."}

${diagramSection}

Base your description ONLY on the provided layer data.`);
  }

  async writeAPIReference(fileAnalyses, nature, audience) {
    if (audience === 'PROJECT_MANAGER') {
      const routes = fileAnalyses.flatMap(f => f.routes || []);
      return this.callLLM(`Write a brief "## API Overview" section for project managers.
Routes detected: ${routes.length > 0 ? JSON.stringify(routes.map(r => `${r.method} ${r.path}`)) : 'none'}
Provide a high-level summary of API capabilities and integration points. One paragraph.`);
    }

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

  async writeSecuritySection(securityResults, signals, audience) {
    if (audience === 'PROJECT_MANAGER') {
      return this.callLLM(`Write a brief "## Security Overview" section for project managers.
Summarize the security approach at a high level. One paragraph.`);
    }

    const hasJwt = signals.some(s => /jwt|auth/i.test(s));
    const hasIssues = securityResults.filter(s => s.riskLevel !== 'clean');

    return this.callLLM(`Write a "## Security" section.
JWT/Auth: ${hasJwt}
Issues found: ${hasIssues.length}
Describe the security approach based on detected signals.`);
  }

  async writeSetupUsage(repository, nature, signals, audience) {
    const instruction = audience === 'USER'
      ? 'Write a detailed walkthrough for end users. Include step-by-step instructions for getting started, running the project, and using its core features. Assume the reader is not a developer. Use simple language and avoid command-line instructions where possible.'
      : 'Write a "## Setup & Usage" section for developers. Include specific commands (npm install, mvn install, etc.) based on the detected stack. Provide environment configuration details.';

    return this.callLLM(`Write a "## Setup & Usage" section.
Repository: ${repository}
Signals: ${signals.join(', ')}

${instruction}`);
  }

  async writeTechnicalModules(moduleSummary, nature, audience) {
    if (audience !== 'DEVELOPER') return null;

    return this.callLLM(`Write a "## Technical Specifications" section.
${moduleSummary.slice(0, 3000)}
Group related files and describe their specific roles in detail.`);
  }

  async writeBusinessModel(businessModel, projectNature, repository) {
    if (!businessModel) {
      return this.callLLM(`Write a "## Business Context" section for this repository.

Repository: ${repository}
Project type: ${projectNature}

Describe the likely business context, target users, and value proposition based on the project type and name. If uncertain, state what the project appears to do and suggest what business problems it might solve.`);
    }

    return this.callLLM(`Write a "## Business Context" section for this repository.

Repository: ${repository}
Project type: ${projectNature}

Based on the following business context provided by the project owner, write a professional Business Context section:

${businessModel}

Include: problem statement, target audience, value proposition, and key business drivers.`);
  }

  async writeProgress(projectProgress, repository) {
    if (!projectProgress) {
      return `## Project Status

*No project progress information was provided.*`;
    }

    return this.callLLM(`Write a "## Project Status" section for this repository.

Repository: ${repository}

Based on the following project progress information provided by the project owner, write a status section covering: current phase, completed milestones, next steps, and timeline.

${projectProgress}`);
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

  writeFooter(repository, audience) {
    return `*Documentation generated automatically for \`${repository}\` using the Multi-Agent Pipeline. Target audience: ${audience.toLowerCase()}.*`;
  }
}

module.exports = WriterAgent;