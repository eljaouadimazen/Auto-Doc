/**
 * repo-analyzer.agent.js
 *
 * Fix 1: Uses actual file content snippets for classification
 * instead of the AST parser, which only works on JS/TS.
 * This makes classification work correctly for Java, Python, Go, etc.
 */

const BaseAgent = require('./base.agent');

class RepoAnalyzerAgent extends BaseAgent {
  constructor() {
    super('RepoAnalyzer', 'Expert en classification de codebase et détection de patterns logiques.');
  }

  async execute(agentInput) {
    const { files = [], repository } = agentInput.input;

    // Detect executable code from extensions directly — no AST needed
    const hasExecutableCode = files.some(f =>
      ['.js', '.ts', '.py', '.java', '.go', '.rb', '.php', '.cpp'].some(ext =>
        f.path.endsWith(ext)
      ) && f.size > 100
    );

    // Build a compact but real picture of the codebase for the LLM
    // Each entry has path + first 300 chars of actual code
    const fileContext = files
      .slice(0, 20) // Keep prompt size reasonable
      .map(f => `[${f.path}]\n${f.snippet || '(no content)'}`)
      .join('\n---\n');

    const prompt = `
You are analyzing the following repository: "${repository}"

Below are the file paths and code snippets from the most important files:

${fileContext}

Has executable code files: ${hasExecutableCode}

Based on the actual file contents above, determine:
1. What kind of project this is
2. What technology stack is being used (framework, language, DB, etc.)
3. What the key logic signals are (e.g. "express routes", "spring controllers", "JWT auth", "REST API", "WebSocket", "database ORM")

Classification rules:
- If you see Spring/Java controllers, services, repositories → "BACKEND"
- If you see Express/Fastify routes or NestJS → "BACKEND"  
- If you see React/Vue/Angular components → "FRONTEND"
- If you see Dockerfile, terraform, k8s yamls → "DEVOPS"
- If mostly .md files with no real code → "RESOURCE_LIST"
- If it exports reusable functions/classes with no server → "LIBRARY"

Return ONLY this JSON object:
{
  "projectNature": "BACKEND | FRONTEND | DEVOPS | RESOURCE_LIST | LIBRARY",
  "hasExecutableCode": boolean,
  "techStack": ["list of detected technologies, frameworks, languages"],
  "logicSignals": ["specific signals found e.g. JWT authentication, REST controllers, WebSocket, Spring Security"],
  "summary": "One precise sentence describing what this project actually does"
}`;

    return this.callLLMJSON(prompt, {
      projectNature:    'BACKEND',
      hasExecutableCode,
      techStack:        [],
      logicSignals:     [],
      summary:          'Could not analyze repository'
    });
  }
}

module.exports = RepoAnalyzerAgent;