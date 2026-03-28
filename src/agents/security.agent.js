/**
 * security.agent.js
 *
 * Sub-issue 3 — Security Agent
 *
 * Adds a semantic layer on top of the existing regex sanitizer.
 * The regex sanitizer runs first (fast, reliable, always runs).
 * This agent runs second on files that need deeper inspection:
 *   - Files the regex flagged (confirm + find missed secrets)
 *   - Files with suspicious patterns that regex can't catch
 *   - Config files, .env-like files, credential files
 *
 * The agent understands CONTEXT:
 *   - "const x = 'sk-abc123'" → OpenAI key even if variable isn't named api_key
 *   - "// example: password=test123" → false positive, it's a comment example
 *   - Hardcoded URLs with credentials embedded
 */

const BaseAgent = require('./base.agent');

class SecurityAgent extends BaseAgent {
  constructor() {
    super(
      'SecurityAgent',
      `You are a security expert reviewing source code for sensitive data leaks.
Your job is to find secrets, credentials, and sensitive information that should not reach an external AI service.
You always respond with valid JSON only — no markdown, no explanation, just the JSON object.
Be conservative — when in doubt, flag it. False positives are safer than false negatives.`,
      {
        temperature: 0.0,  // Zero temperature — security decisions must be deterministic
        maxTokens:   1000,
        maxRetries:  2
      }
    );

    // Files that always get security agent review regardless of regex findings
    this.HIGH_RISK_PATTERNS = [
      /\.env/i,
      /config/i,
      /credential/i,
      /secret/i,
      /auth/i,
      /key/i,
      /token/i,
      /password/i,
      /setting/i
    ];

    // Minimum file size to bother analyzing (very small files rarely have secrets)
    this.MIN_SIZE = 20;
  }

  /**
   * Execute security analysis on a file
   * @param {Object} agentInput
   * @param {string} agentInput.input.path           - File path
   * @param {string} agentInput.input.content        - File content (already regex-sanitized)
   * @param {Array}  agentInput.input.regexFindings  - Patterns found by regex sanitizer
   * @param {string} agentInput.input.rawContent     - Original content before sanitization
   */
  async execute(agentInput) {
    const { path, content, regexFindings = [], rawContent = content } = agentInput.input;

    // Skip files that are too small
    if (!rawContent || rawContent.trim().length < this.MIN_SIZE) {
      return this.buildCleanResult(path, 'File too small to contain secrets');
    }

    // Decide if this file needs agent review
    const needsReview = this.shouldReview(path, regexFindings);
    if (!needsReview) {
      return this.buildCleanResult(path, 'Low risk file — regex pass sufficient');
    }

    const truncated = this.truncate(rawContent, 2000);
    const prompt    = this.buildPrompt(path, truncated, regexFindings);
    const fallback  = this.buildCleanResult(path, 'Analysis failed — treat as clean');
    const result    = await this.callLLMJSON(prompt, fallback);

    return this.normalize(result, path, regexFindings);
  }

  /**
   * Decide if this file needs agent review
   * Returns true if:
   *   - Regex found something (agent confirms or finds more)
   *   - File name matches high-risk patterns
   */
  shouldReview(path, regexFindings) {
    if (regexFindings.length > 0) return true;
    return this.HIGH_RISK_PATTERNS.some(pattern => pattern.test(path));
  }

  buildPrompt(filePath, content, regexFindings) {
    const regexContext = regexFindings.length > 0
      ? `\nThe regex scanner already found these pattern types: ${regexFindings.join(', ')}.\nConfirm if they are real secrets or false positives, and look for additional secrets the regex missed.`
      : '\nThe regex scanner found nothing. Look carefully for secrets the regex may have missed.';

    return `Review this source code file for sensitive data that should not be sent to an external AI service.
${regexContext}

File: ${filePath}

\`\`\`
${content}
\`\`\`

Look for:
- API keys, tokens, passwords, secrets (even if variable names are unusual)
- Database connection strings with credentials
- Private keys or certificates
- Hardcoded credentials in any format
- Secrets disguised as "example" or "test" values that look real
- URLs with embedded credentials

Do NOT flag:
- Placeholder values like "your_key_here", "xxx", "changeme", "example"
- Comments explaining what a variable should contain
- Variable names that mention keys but contain no actual secret value

Return ONLY this JSON:
{
  "path": "${filePath}",
  "riskLevel": "clean | low | medium | high | critical",
  "confirmedSecrets": [
    {
      "type": "api_key | password | token | database_uri | private_key | other",
      "location": "brief description of where in the file",
      "shouldRedact": true
    }
  ],
  "falsePositives": [
    {
      "regexPattern": "pattern name that triggered",
      "reason": "why this is not actually a secret"
    }
  ],
  "missedByRegex": [
    {
      "type": "type of secret",
      "location": "where in the file",
      "shouldRedact": true
    }
  ],
  "recommendation": "safe_to_send | redact_and_send | do_not_send",
  "notes": "Any additional security observations"
}`;
  }

  normalize(result, path, regexFindings) {
    return {
      path:             result.path             || path,
      riskLevel:        result.riskLevel        || 'clean',
      confirmedSecrets: result.confirmedSecrets || [],
      falsePositives:   result.falsePositives   || [],
      missedByRegex:    result.missedByRegex    || [],
      recommendation:   result.recommendation   || 'safe_to_send',
      notes:            result.notes            || '',
      regexFindings,
      agentReviewed:    true
    };
  }

  buildCleanResult(path, reason) {
    return {
      path,
      riskLevel:        'clean',
      confirmedSecrets: [],
      falsePositives:   [],
      missedByRegex:    [],
      recommendation:   'safe_to_send',
      notes:            reason,
      regexFindings:    [],
      agentReviewed:    false
    };
  }
}

module.exports = SecurityAgent;