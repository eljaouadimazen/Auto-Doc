/**
 * writer.agent.js
 *
 * Sub-issue 5 — Writer Agent
 *
 * Receives all agent results and generates professional documentation
 * section by section. Each section is a separate focused LLM call
 * which produces better quality than one massive prompt.
 *
 * Sections generated:
 *   1. Project Overview
 *   2. Architecture
 *   3. API Reference
 *   4. Security Notes
 *   5. Setup & Usage
 *   6. Key Modules
 */

const BaseAgent = require('./base.agent');

class WriterAgent extends BaseAgent {
  constructor() {
    super(
      'WriterAgent',
      `You are a senior technical writer creating professional software documentation.
You write clear, accurate, and useful documentation based on structured code analysis.
You never invent functionality not evidenced in the data provided.
You write in markdown format. Be precise and professional.`,
      {
        temperature: 0.2,
        maxTokens:   3000,
        maxRetries:  2
      }
    );
  }

  /**
   * Execute documentation generation
   * @param {Object} agentInput
   * @param {Object} agentInput.input.architectureResult - Architecture Agent output
   * @param {Array}  agentInput.input.fileAnalyses       - Code Intelligence Agent outputs
   * @param {Array}  agentInput.input.securityResults    - Security Agent outputs
   * @param {string} agentInput.context.repository       - Repo name
   */
  async execute(agentInput) {
    const {
      architectureResult,
      fileAnalyses    = [],
      securityResults = []
    } = agentInput.input;

    const { repository } = agentInput.context;

    // Generate each section independently for better quality
    const sections = await Promise.allSettled([
      this.writeOverview(repository,   architectureResult),
      this.writeArchitecture(          architectureResult),
      this.writeAPIReference(          architectureResult),
      this.writeSecurityNotes(         securityResults, architectureResult),
      this.writeSetupUsage(repository, architectureResult),
      this.writeKeyModules(            fileAnalyses),
    ]);

    // Assemble sections — use fallback text if a section failed
    const [overview, architecture, api, security, setup, modules] = sections.map(
      (s, i) => s.status === 'fulfilled'
        ? s.value
        : `*Section ${i + 1} could not be generated.*`
    );

    const documentation = [
      overview,
      architecture,
      api,
      security,
      setup,
      modules,
      this.writeFooter(repository)
    ].join('\n\n---\n\n');

    return { documentation, sections: sections.length };
  }

  // ── Section writers ────────────────────────────────────────────

  async writeOverview(repository, arch) {
    const prompt = `Write a "Project Overview" section in markdown for this repository.

Repository: ${repository}
Type: ${arch?.projectType || 'unknown'}
Summary: ${arch?.summary || 'No summary available'}
Patterns: ${(arch?.patterns || []).join(', ')}
Strengths: ${(arch?.strengths || []).join(', ')}

Write 3-5 paragraphs covering:
- What this project does and who it is for
- The main problem it solves
- Key features and capabilities
- Technology choices and why they make sense

Start with: # ${repository}`;

    return this.callLLM(prompt);
  }

  async writeArchitecture(arch) {
    const prompt = `Write an "Architecture" section in markdown.

Project type: ${arch?.projectType}
Layers: ${JSON.stringify(arch?.layers || {})}
Data flow: ${arch?.dataFlow || ''}
Service map: ${JSON.stringify(arch?.serviceMap || [])}
Patterns used: ${(arch?.patterns || []).join(', ')}

Write:
- ## Architecture
- Overview paragraph
- ### Layers subsection describing each layer
- ### Data Flow subsection with step-by-step request flow
- ### Service Dependencies subsection

Use bullet points and code blocks where appropriate.`;

    return this.callLLM(prompt);
  }

  async writeAPIReference(arch) {
    const routes = arch?.apiSurface?.routes || [];
    if (routes.length === 0) return '## API Reference\n\n*No API routes detected.*';

    const prompt = `Write an "API Reference" section in markdown.

Routes: ${JSON.stringify(routes, null, 2)}

For each route write:
- HTTP method and path as heading
- What it does
- Expected request body (inferred from purpose)
- Expected response (inferred from purpose)

Start with: ## API Reference`;

    return this.callLLM(prompt);
  }

  async writeSecurityNotes(securityResults, arch) {
    const issues = securityResults.filter(s => s.riskLevel !== 'clean');
    const posture = arch?.securityPosture || '';

    const prompt = `Write a "Security" section in markdown.

Overall security posture: ${posture}
Files with security findings: ${issues.length}
Security findings: ${JSON.stringify(issues.map(s => ({
  file: s.path,
  risk: s.riskLevel,
  recommendation: s.recommendation,
  notes: s.notes
})), null, 2)}

Write:
- ## Security
- Overall security approach paragraph
- ### Secret Management subsection
- ### Data Sanitization subsection
- ### Recommendations subsection (if there are issues)

Be specific about what was found and what was done about it.`;

    return this.callLLM(prompt);
  }

  async writeSetupUsage(repository, arch) {
    const envVars   = arch?.environmentConfig || [];
    const routes    = arch?.apiSurface?.routes || [];

const prompt = `Write a "Setup & Usage" section in markdown.

Repository: ${repository}
Environment variables required: ${JSON.stringify(envVars)}
Available API routes: ${JSON.stringify(routes.map(r => `${r.method} ${r.path}`))}

Write:
- ## Setup & Usage
- ### Prerequisites
- ### Installation (npm install steps)
- ### Configuration (env vars table with description and required/optional)
- ### Running the application
- ### Basic usage example

Use code blocks for commands.`;

    return this.callLLM(prompt);
  }

  async writeKeyModules(fileAnalyses) {
    if (fileAnalyses.length === 0) return '## Key Modules\n\n*No module analysis available.*';

    // Sort by complexity and type — most important files first
    const priority = { controller: 0, service: 1, middleware: 2, utility: 3, config: 4, other: 5 };
    const sorted   = [...fileAnalyses].sort((a, b) =>
      (priority[a.type] ?? 5) - (priority[b.type] ?? 5)
    );

    const moduleSummaries = sorted.map(f =>
      `File: ${f.path}
Type: ${f.type}
Purpose: ${f.purpose}
Summary: ${f.summary}
Key decisions: ${(f.keyDecisions || []).join(', ')}`
    ).join('\n\n');

    const prompt = `Write a "Key Modules" section in markdown.

${moduleSummaries}

For each module write a subsection with:
- ### filename as heading
- Purpose paragraph
- Key responsibilities as bullet points
- Notable design decisions if any

Start with: ## Key Modules`;

    return this.callLLM(prompt);
  }

  writeFooter(repository) {
    const date = new Date().toISOString().split('T')[0];
    return `---\n\n*Documentation generated by Auto-Doc on ${date} — secure AI-powered repository documentation*`;
  }
}



module.exports = WriterAgent;