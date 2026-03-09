/**
 * sanitizer.service.js
 *
 * Detects and redacts sensitive data from code before it reaches the LLM.
 * Supports built-in patterns + user-defined custom rules.
 * Integrates with audit-log.service for tracking.
 */

class SanitizerService {
  constructor() {
    this.builtinPatterns = [
      { name: 'api_key',        regex: /api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9\-_.]{8,}["']?/gi },
      { name: 'secret_key',     regex: /secret[_-]?key\s*[:=]\s*["']?[A-Za-z0-9\-_.]{8,}["']?/gi },
      { name: 'access_token',   regex: /access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9\-_.]{8,}["']?/gi },
      { name: 'token',          regex: /\btoken\s*[:=]\s*["']?[A-Za-z0-9\-_.]{16,}["']?/gi },
      { name: 'password',       regex: /password\s*[:=]\s*["'][^"']{4,}["']/gi },
      { name: 'passwd',         regex: /passwd\s*[:=]\s*["'][^"']{4,}["']/gi },
      { name: 'github_pat',     regex: /ghp_[A-Za-z0-9]{20,}/g },
      { name: 'github_actions', regex: /ghs_[A-Za-z0-9]{20,}/g },
      { name: 'openai_key',     regex: /sk-[A-Za-z0-9]{20,}/g },
      { name: 'slack_token',    regex: /xox[baprs]-[A-Za-z0-9\-]{10,}/g },
      { name: 'aws_key',        regex: /AKIA[A-Z0-9]{16}/g },
      { name: 'mailchimp_key',  regex: /[0-9a-f]{32}-us[0-9]+/g },
      { name: 'google_api_key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
      { name: 'groq_key',       regex: /gsk_[A-Za-z0-9]{20,}/g },
      { name: 'mongodb_uri',    regex: /mongodb(\+srv)?:\/\/[^\s"']+/gi },
      { name: 'postgres_uri',   regex: /postgres(?:ql)?:\/\/[^\s"']+/gi },
      { name: 'mysql_uri',      regex: /mysql:\/\/[^\s"']+/gi },
      { name: 'redis_uri',      regex: /redis:\/\/[^\s"']+/gi },
      { name: 'private_key',    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
      { name: 'certificate',    regex: /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g },
      { name: 'dotenv_value',   regex: /^([A-Z][A-Z0-9_]{2,})\s*=\s*["']?([^\s"'\n]{8,})["']?$/gm },
    ];

    this.customRules    = [];
    this._customPatterns = [];
  }

  // ─── Custom Rules API ─────────────────────────────────────────

  addCustomRule(name, pattern, flags = 'gi') {
    try { new RegExp(pattern, flags); }
    catch (e) { throw new Error(`Invalid regex: ${e.message}`); }

    const rule = {
      id:      Date.now().toString(36),
      name:    name.trim(),
      pattern,
      flags,
      addedAt: new Date().toISOString()
    };

    this.customRules.push(rule);
    this._customPatterns.push({ name: rule.name, regex: new RegExp(pattern, flags) });
    console.info(`[sanitizer] Custom rule added: "${rule.name}" (${rule.id})`);
    return rule;
  }

  removeCustomRule(id) {
    const idx = this.customRules.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`Rule ${id} not found`);
    this.customRules.splice(idx, 1);
    this._customPatterns.splice(idx, 1);
    return true;
  }

  listCustomRules() {
    return this.customRules.map(({ id, name, pattern, flags, addedAt }) => ({
      id, name, pattern, flags, addedAt
    }));
  }

  // ─── Core ─────────────────────────────────────────────────────

  clean(text) {
    if (!text || typeof text !== 'string') return text;
    let sanitized = text;
    const all = [...this.builtinPatterns, ...this._customPatterns];

    all.forEach(({ name, regex }) => {
      regex.lastIndex = 0;
      sanitized = sanitized.replace(regex, (match, p1) => {
        if (name === 'dotenv_value' && p1 && /^[A-Z][A-Z0-9_]{2,}$/.test(p1)) {
          return `${p1}=[REDACTED]`;
        }
        return '[REDACTED_SECRET]';
      });
      regex.lastIndex = 0;
    });

    return sanitized;
  }

  cleanFiles(files) {
    return files.map(file => ({ ...file, content: this.clean(file.content) }));
  }

  audit(text) {
    if (!text || typeof text !== 'string') return [];
    const detected = [];
    const all = [...this.builtinPatterns, ...this._customPatterns];
    all.forEach(({ name, regex }) => {
      regex.lastIndex = 0;
      if (regex.test(text)) detected.push(name);
      regex.lastIndex = 0;
    });
    return detected;
  }

  auditFiles(files) {
    return files.map(file => ({
      path:             file.path,
      detectedPatterns: this.audit(file.content)
    }));
  }
}

module.exports = new SanitizerService();