/**
 * code-intelligence.agent.js
 *
 * Replaces the regex-based AST parser with LLM-powered code understanding.
 * Instead of extracting syntax, this agent understands MEANING:
 * - What does this file actually do?
 * - What is the purpose of each class/function?
 * - What architectural decisions were made?
 *
 * Extends BaseAgent — gets retry, tracing, and protocol compliance for free.
 */

const BaseAgent = require('./base.agent');

class CodeIntelligenceAgent extends BaseAgent {
  constructor() {
    super(
      'CodeIntelligenceAgent',
      `You are an expert software architect analyzing source code files.
Your job is to understand what code DOES, not just what syntax it contains.
You always respond with valid JSON only — no markdown, no explanation, just the JSON object.
Be precise and concise. If something is unclear from the code, say so explicitly.`,
      {
        temperature: 0.1,
        maxTokens:   1500,
        maxRetries:  2
      }
    );

    this.SUPPORTED = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.java', '.go', '.kt', '.rb', '.php', '.rs', '.dart', '.swift', '.scala', '.vue', '.svelte', '.html', '.css', '.scss', '.xml', '.yaml', '.yml', '.properties', '.gradle', '.sql', '.prisma', '.tf', '.kt', '.gradle.kts'];
  }

  /**
   * Execute analysis on a single file
   * @param {Object} agentInput
   * @param {string} agentInput.input.path    - File path
   * @param {string} agentInput.input.content - File content
   */
  async execute(agentInput) {
    const { path, content, relatedFiles } = agentInput.input;

    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();

    // Skip unsupported or empty files
    if (!this.SUPPORTED.includes(ext)) {
      return this.buildFallback(path, content, 'Unsupported file type');
    }
    if (!content || content.trim().length < 10) {
      return this.buildFallback(path, content, 'File too small');
    }

    const truncated  = this.truncate(content, 2500);
    const relatedCtx = this.buildRelatedContext(relatedFiles);
    const prompt     = this.buildPrompt(path, truncated, relatedCtx);
    const fallback   = this.buildFallback(path, content, 'JSON parse failed');
    const result     = await this.callLLMJSON(prompt, fallback);

    return this.normalize(result, path);
  }

  buildRelatedContext(relatedFiles) {
    if (!relatedFiles || relatedFiles.length === 0) return '';
    const entries = relatedFiles.map(r => {
      const type = r.relationType ? ` — ${r.relationType}` : '';
      return `  ${r.path}${type}`;
    }).join('\n');
    return `\nRelated files (connected via knowledge graph):\n${entries}\n`;
  }

  buildPrompt(filePath, content, relatedCtx = '') {
    return `Analyze this source code file and return a JSON object.

File: ${filePath}

\`\`\`
${content}
\`\`\`
${relatedCtx}
Return ONLY this JSON (no markdown, no explanation):
{
  "path": "${filePath}",
  "language": "JavaScript | TypeScript | Python | Java | Go | etc",
  "purpose": "One sentence — what this file does",
  "type": "controller | service | middleware | utility | config | test | component | guard | interceptor | pipe | directive | module | model | repository | other",
  "responsibilities": ["what", "this", "file", "handles"],
  "classes": [
    {
      "name": "ClassName",
      "role": "What this class is responsible for",
      "methods": [
        { "name": "methodName", "purpose": "What it does", "async": true }
      ]
    }
  ],
  "functions": [
    { "name": "functionName", "purpose": "What it does", "async": false }
  ],
  "dependencies": ["external imports only"],
  "internalDependencies": ["local relative imports only"],
  "routes": [
    { "method": "GET", "path": "/route", "purpose": "What this route does" }
  ],
  "envVars": ["ENV_VAR_NAMES"],
  "securityRelevant": false,
  "securityNotes": "Any security observations or empty string",
  "authMechanisms": ["jwt | oauth | session | apiKey | basic | none"],
  "authLibraries": ["jsonwebtoken | passport | bcrypt | argon2 | spring-security | none"],
  "apiCalls": [
    { "method": "GET", "url": "/api/resource", "source": "fetch | axios | httpClient" }
  ],
  "configVars": ["CONFIG_KEY"],
  "framework": "express | spring | django | react | angular | vue | none",
  "frontendFramework": "react | angular | vue | svelte | null",
  "componentType": "page | component | service | guard | interceptor | pipe | directive | module | null",
  "hasAuthGuard": false,
  "hasInterceptor": false,
  "parentComponent": "ParentComponentName or null",
  "childComponents": ["ChildComponentName"],
  "testFiles": ["related test file paths"],
  "dbEntities": [
    { "name": "EntityName", "fields": ["field1", "field2"] }
  ],
  "dbTechnology": "postgresql | mongodb | mysql | sqlite | null",
  "ormLibrary": "prisma | mongoose | typeorm | sequelize | hibernate | spring-data | null",
  "deploymentConfig": ["Dockerfile | docker-compose.yml | .github/workflows"],
  "webSocketPaths": ["/ws/path"],
  "keyDecisions": ["design decisions visible in code"],
  "complexity": "low | medium | high",
  "summary": "2-3 sentences describing this file for documentation purposes"
}`;
  }

  normalize(result, path) {
    return {
      path:                 result.path                || path,
      language:             result.language            || 'Unknown',
      purpose:              result.purpose             || 'Purpose unclear',
      type:                 result.type                || 'other',
      responsibilities:     result.responsibilities    || [],
      classes:              result.classes             || [],
      functions:            result.functions           || [],
      dependencies:         result.dependencies        || [],
      internalDependencies: result.internalDependencies|| [],
      routes:               result.routes              || [],
      envVars:              result.envVars             || [],
      securityRelevant:     result.securityRelevant    ?? false,
      securityNotes:        result.securityNotes       || '',
      authMechanisms:       result.authMechanisms      || [],
      authLibraries:        result.authLibraries       || [],
      apiCalls:             result.apiCalls            || [],
      configVars:           result.configVars          || [],
      framework:            result.framework           || 'unknown',
      frontendFramework:    result.frontendFramework   || null,
      componentType:        result.componentType       || null,
      hasAuthGuard:         result.hasAuthGuard        ?? false,
      hasInterceptor:       result.hasInterceptor      ?? false,
      parentComponent:      result.parentComponent     || null,
      childComponents:      result.childComponents     || [],
      testFiles:            result.testFiles           || [],
      dbEntities:           result.dbEntities           || [],
      dbTechnology:         result.dbTechnology        || null,
      ormLibrary:           result.ormLibrary          || null,
      deploymentConfig:     result.deploymentConfig    || [],
      webSocketPaths:       result.webSocketPaths      || [],
      keyDecisions:         result.keyDecisions        || [],
      complexity:           result.complexity          || 'medium',
      summary:              result.summary             || ''
    };
  }

  buildFallback(path, content, reason) {
    return {
      path,
      language:             'Unknown',
      purpose:              reason,
      type:                 'other',
      responsibilities:     [],
      classes:              [],
      functions:            [],
      dependencies:         [],
      internalDependencies: [],
      routes:               [],
      envVars:              [],
      securityRelevant:     false,
      securityNotes:        '',
      authMechanisms:       [],
      authLibraries:        [],
      apiCalls:             [],
      configVars:           [],
      framework:            'unknown',
      frontendFramework:    null,
      componentType:        null,
      hasAuthGuard:         false,
      hasInterceptor:       false,
      parentComponent:      null,
      childComponents:      [],
      testFiles:            [],
      dbEntities:           [],
      dbTechnology:         null,
      ormLibrary:           null,
      deploymentConfig:     [],
      webSocketPaths:       [],
      keyDecisions:         [],
      complexity:           'low',
      summary:              reason
    };
  }
}

module.exports = CodeIntelligenceAgent;