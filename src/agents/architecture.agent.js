/**
 * architecture.agent.js
 *
 * Sub-issue 4 — Architecture Agent
 *
 * Receives ALL Code Intelligence Agent results and builds a
 * cross-file architecture map. This agent answers questions like:
 *   - What are the entry points of this application?
 *   - How do services depend on each other?
 *   - What is the data flow from request to response?
 *   - What architectural patterns were used?
 *   - What layers exist in this codebase?
 *
 * This agent does NOT analyze individual files — it synthesizes
 * the results from all previous agents into a holistic view.
 */

const BaseAgent = require('./base.agent');

class ArchitectureAgent extends BaseAgent {
  constructor() {
    super(
      'ArchitectureAgent',
      `You are a senior software architect building a high-level understanding of a codebase.
You receive structured summaries of individual files and synthesize them into an architectural overview.
You identify patterns, layers, dependencies, and data flows across the entire codebase.
You always respond with valid JSON only — no markdown, no explanation, just the JSON object.`,
      {
        temperature: 0.1,
        maxTokens:   2000,
        maxRetries:  2
      }
    );
  }

  /**
   * Execute architecture analysis
   * @param {Object} agentInput
   * @param {string} agentInput.context.repository      - Repo name
   * @param {Array}  agentInput.input.fileAnalyses      - Array of Code Intelligence Agent results
   * @param {Array}  agentInput.input.securityResults   - Array of Security Agent results
   */
  async execute(agentInput) {
    const { fileAnalyses = [], securityResults = [] } = agentInput.input;
    const { repository } = agentInput.context;

    if (fileAnalyses.length === 0) {
      return this.buildFallback(repository, 'No file analyses provided');
    }

    const prompt = this.buildPrompt(repository, fileAnalyses, securityResults);
    const fallback = this.buildFallback(repository, 'JSON parse failed');
    const result = await this.callLLMJSON(prompt, fallback);

    return this.normalize(result, repository, fileAnalyses);
  }

  buildPrompt(repository, fileAnalyses, securityResults) {
    // Build compact summaries of each file to fit in context
    const fileSummaries = fileAnalyses.map(f => ({
      path:         f.path,
      type:         f.type,
      purpose:      f.purpose,
      dependencies: f.dependencies,
      routes:       f.routes?.map(r => `${r.method} ${r.path}`),
      envVars:      f.envVars,
      complexity:   f.complexity
    }));

    // Build security summary
    const securitySummary = securityResults
      .filter(s => s.riskLevel !== 'clean')
      .map(s => ({
        path:       s.path,
        riskLevel:  s.riskLevel,
        recommendation: s.recommendation
      }));

    // Extract all routes across all files
    const allRoutes = fileAnalyses
      .flatMap(f => (f.routes || []).map(r => ({
        ...r,
        file: f.path
      })));

    // Extract all dependencies
    const allDeps = [...new Set(
      fileAnalyses.flatMap(f => f.dependencies || [])
    )];

    // Extract all env vars
    const allEnvVars = [...new Set(
      fileAnalyses.flatMap(f => f.envVars || [])
    )];

    return `Analyze this repository's architecture based on the file summaries below.

Repository: ${repository}
Total files analyzed: ${fileAnalyses.length}

All API routes found: ${JSON.stringify(allRoutes)}
All external dependencies: ${JSON.stringify(allDeps)}
All environment variables: ${JSON.stringify(allEnvVars)}
Security concerns: ${JSON.stringify(securitySummary)}

File summaries:
${JSON.stringify(fileSummaries, null, 2)}

Return ONLY this JSON:
{
  "repository": "${repository}",
  "projectType": "web-api | cli | library | fullstack | microservice | other",
  "entryPoints": ["list of main entry files"],
  "layers": {
    "presentation": ["files handling HTTP/UI"],
    "business": ["files containing business logic"],
    "data": ["files handling data/storage"],
    "infrastructure": ["config, middleware, utilities"]
  },
  "serviceMap": [
    {
      "service": "ServiceName",
      "file": "path/to/file",
      "dependsOn": ["OtherService", "ExternalLib"],
      "exposedTo": ["WhoCallsThis"]
    }
  ],
  "dataFlow": "Step by step description of how a request flows through the system",
  "patterns": ["MVC", "Service Layer", "Middleware Chain", "etc"],
  "apiSurface": {
    "totalRoutes": 0,
    "routes": [
      { "method": "GET", "path": "/route", "handler": "file", "purpose": "what it does" }
    ]
  },
  "externalDependencies": {
    "llm": ["AI/LLM related packages"],
    "database": ["DB related packages"],
    "http": ["HTTP client packages"],
    "auth": ["Auth packages"],
    "other": ["everything else"]
  },
  "environmentConfig": [
    { "var": "VAR_NAME", "purpose": "what it configures", "required": true }
  ],
  "securityPosture": "Description of overall security approach",
  "strengths": ["architectural strengths observed"],
  "gaps": ["missing pieces or potential improvements"],
  "summary": "3-4 sentence architectural overview for documentation"
}`;
  }

  normalize(result, repository, fileAnalyses) {
    return {
      repository:           result.repository           || repository,
      projectType:          result.projectType          || 'web-api',
      entryPoints:          result.entryPoints          || [],
      layers:               result.layers               || {},
      serviceMap:           result.serviceMap           || [],
      dataFlow:             result.dataFlow             || '',
      patterns:             result.patterns             || [],
      apiSurface:           result.apiSurface           || { totalRoutes: 0, routes: [] },
      externalDependencies: result.externalDependencies || {},
      environmentConfig:    result.environmentConfig    || [],
      securityPosture:      result.securityPosture      || '',
      strengths:            result.strengths            || [],
      gaps:                 result.gaps                 || [],
      summary:              result.summary              || '',
      filesAnalyzed:        fileAnalyses.length
    };
  }

  buildFallback(repository, reason) {
    return {
      repository,
      projectType:          'unknown',
      entryPoints:          [],
      layers:               {},
      serviceMap:           [],
      dataFlow:             reason,
      patterns:             [],
      apiSurface:           { totalRoutes: 0, routes: [] },
      externalDependencies: {},
      environmentConfig:    [],
      securityPosture:      '',
      strengths:            [],
      gaps:                 [reason],
      summary:              reason,
      filesAnalyzed:        0
    };
  }
}

module.exports = ArchitectureAgent;