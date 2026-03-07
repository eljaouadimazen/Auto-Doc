class SanitizerService {
  constructor() {
    this.patterns = [
      // Generic key=value secrets
      /api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9\-_.]{8,}["']?/gi,
      /secret[_-]?key\s*[:=]\s*["']?[A-Za-z0-9\-_.]{8,}["']?/gi,
      /access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9\-_.]{8,}["']?/gi,
      /token\s*[:=]\s*["']?[A-Za-z0-9\-_.]{16,}["']?/gi,
      /password\s*[:=]\s*["'][^"']{4,}["']/gi,
      /passwd\s*[:=]\s*["'][^"']{4,}["']/gi,

      // Provider-specific tokens
      /ghp_[A-Za-z0-9]{20,}/g,                        // GitHub PAT
      /ghs_[A-Za-z0-9]{20,}/g,                        // GitHub Actions token
      /sk-[A-Za-z0-9]{20,}/g,                         // OpenAI key
      /xox[baprs]-[A-Za-z0-9\-]{10,}/g,               // Slack token
      /AKIA[A-Z0-9]{16}/g,                             // AWS access key
      /[0-9a-f]{32}-us[0-9]+/g,                       // Mailchimp key
      /AIza[0-9A-Za-z\-_]{35}/g,                      // Google API key
      /grok-[A-Za-z0-9]{20,}/g,                       // Groq key

      // Connection strings
      /mongodb(\+srv)?:\/\/[^\s"']+/gi,
      /postgres(?:ql)?:\/\/[^\s"']+/gi,
      /mysql:\/\/[^\s"']+/gi,
      /redis:\/\/[^\s"']+/gi,

      // Private keys / certificates
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,

      // .env variable assignments with values
      /^([A-Z][A-Z0-9_]{2,})\s*=\s*["']?([^\s"'\n]{8,})["']?$/gm
    ];
  }

  /**
   * Cleans a single text string
   * @param {string} text
   * @returns {string} sanitized text
   */
  clean(text) {
    if (!text || typeof text !== 'string') return text;

    let sanitized = text;
    this.patterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, (match, p1) => {
        // For .env lines, keep the KEY name but redact the value
        if (p1 && /^[A-Z][A-Z0-9_]{2,}$/.test(p1)) {
          return `${p1}=[REDACTED]`;
        }
        return '[REDACTED_SECRET]';
      });
    });

    return sanitized;
  }

  /**
   * FIX #2: Also sanitize structured file objects before they reach the LLM
   * Call this on parsed file arrays inside LLMInputBuilder
   * @param {Array} files - array of {path, content, ...}
   * @returns {Array} sanitized files
   */
  cleanFiles(files) {
    return files.map(file => ({
      ...file,
      content: this.clean(file.content)
    }));
  }

  /**
   * Audit: returns list of what was detected (without exposing values)
   * @param {string} text
   * @returns {string[]} list of pattern names that matched
   */
  audit(text) {
    const names = [
      'api_key', 'secret_key', 'access_token', 'token', 'password', 'passwd',
      'github_pat', 'github_actions', 'openai_key', 'slack_token',
      'aws_key', 'mailchimp_key', 'google_api_key', 'groq_key',
      'mongodb_uri', 'postgres_uri', 'mysql_uri', 'redis_uri',
      'private_key', 'certificate', 'dotenv_value'
    ];
    const detected = [];
    this.patterns.forEach((pattern, i) => {
      if (pattern.test(text)) detected.push(names[i] || `pattern_${i}`);
      pattern.lastIndex = 0; // reset stateful regex
    });
    return detected;
  }
}

module.exports = new SanitizerService();