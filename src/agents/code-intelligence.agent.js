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

    this.SUPPORTED = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.py', '.java', '.go'];
  }

  /**
   * Execute analysis on a single file
   * @param {Object} agentInput
   * @param {string} agentInput.input.path    - File path
   * @param {string} agentInput.input.content - File content
   */
  async execute(agentInput) {
    const { path, content } = agentInput.input;

    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();

    // Skip unsupported or empty files
    if (!this.SUPPORTED.includes(ext)) {
      return this.buildFallback(path, content, 'Unsupported file type');
    }
    if (!content || content.trim().length < 10) {
      return this.buildFallback(path, content, 'File too small');
    }

    const truncated = this.truncate(content, 2500);
    const prompt    = this.buildPrompt(path, truncated);
    const fallback  = this.buildFallback(path, content, 'JSON parse failed');
    const result    = await this.callLLMJSON(prompt, fallback);

    return this.normalize(result, path);
  }

  buildPrompt(filePath, content) {
    return `Analyze this source code file and return a JSON object.

File: ${filePath}

\`\`\`
${content}
\`\`\`

Return ONLY this JSON (no markdown, no explanation):
{
  "path": "${filePath}",
  "language": "JavaScript | TypeScript | Python | etc",
  "purpose": "One sentence — what this file does",
  "type": "controller | service | middleware | utility | config | test | other",
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
      keyDecisions:         [],
      complexity:           'low',
      summary:              reason
    };
  }
}

module.exports = CodeIntelligenceAgent;