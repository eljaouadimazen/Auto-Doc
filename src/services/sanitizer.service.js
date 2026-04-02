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
      // PII Patterns
      { name: 'email',         regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
      { name: 'phone_us',      regex: /(\+1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g },
      { name: 'phone_intl',    regex: /\+(?:[0-9][\s\-.]?){6,14}[0-9]/g },
      { name: 'ssn',           regex: /\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g },
      { name: 'credit_card',   regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g },
      { name: 'ip_address',    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },
      { name: 'ipv6',          regex: /([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g },
      { name: 'mac_address',   regex: /([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}/g },
      { name: 'iban',          regex: /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}\b/g },
      { name: 'date_of_birth', regex: /\b(?:dob|date.of.birth|birthdate)\s*[:=]\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/gi },
      { name: 'passport',      regex: /\b[A-Z]{1,2}[0-9]{6,9}\b/g },
      { name: 'national_id',   regex: /\b(?:national.id|nid|cin)\s*[:=]\s*[A-Z0-9\-]{6,20}/gi },
      // Additional secrets
      { name: 'stripe_key',      regex: /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}/g },
      { name: 'twilio_sid',      regex: /AC[a-z0-9]{32}/g },
      { name: 'twilio_token',    regex: /SK[a-z0-9]{32}/g },
      { name: 'firebase_key',    regex: /AAAA[A-Za-z0-9_\-]{7}:[A-Za-z0-9_\-]{140}/g },
      { name: 'jwt_token',       regex: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]*/g },
      { name: 'basic_auth_url',  regex: /https?:\/\/[^:]+:[^@]+@[^\s"']+/gi },
      { name: 'ssh_private_key', regex: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g },
      { name: 'heroku_api_key',  regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g }, // UUID-shaped keys
      { name: 'npm_token',       regex: /npm_[A-Za-z0-9]{36}/g },
      { name: 'cloudinary_url',  regex: /cloudinary:\/\/[0-9]+:[A-Za-z0-9_\-]+@[a-z0-9]+/g },
      { name: 'sendgrid_key',    regex: /SG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}/g },
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
  // ─── Entropy Detection ─────────────────────────────────────────

shannonEntropy(str) {
  const map = {};
  for (const char of str) {
    map[char] = (map[char] || 0) + 1;
  }

  return Object.values(map).reduce((acc, freq) => {
    const p = freq / str.length;
    return acc - p * Math.log2(p);
  }, 0);
}

 detectHighEntropyStrings(text) {
  // Skip known safe high-entropy patterns (base64 images, hashes in comments, etc.)
  const SAFE_CONTEXTS = [
    /data:image\/[a-z]+;base64,/i,     // inline images
    /\b[0-9a-f]{40}\b/i,               // git SHA hashes (safe, public)
    /\b[0-9a-f]{64}\b/i,               // SHA256 hashes
  ];

  const lines = text.split('\n');
  const findings = [];

  lines.forEach((line, lineNum) => {
    const isSafeContext = SAFE_CONTEXTS.some(p => p.test(line));
    if (isSafeContext) return;

    // Only flag if it looks like an assignment (key = value)
    const assignmentMatch = line.match(/[:=]\s*["']?([A-Za-z0-9+/=_\-]{20,})["']?/);
    if (!assignmentMatch) return;

    const candidate = assignmentMatch[1];
    const entropy = this.shannonEntropy(candidate);

    if (entropy > 4.2) {
      findings.push({
        value:   candidate,
        entropy: entropy.toFixed(2),
        line:    lineNum + 1,
      });
    }
  });

  return findings;
}
report(text, filePath = 'unknown') {
  const piiTypes    = ['email', 'phone_us', 'phone_intl', 'ssn', 'credit_card', 'ip_address', 'iban'];
  const secretTypes = ['api_key', 'jwt_token', 'aws_key', 'github_pat', 'password']; // etc.

  const detected   = this.audit(text);
  const highEntropy = this.detectHighEntropyStrings(text);

  return {
    filePath,
    timestamp:    new Date().toISOString(),
    hasSensitiveData: detected.length > 0 || highEntropy.length > 0,
    summary: {
      secrets:         detected.filter(d => secretTypes.includes(d)),
      pii:             detected.filter(d => piiTypes.includes(d)),
      highEntropyHits: highEntropy.length,
    },
    details: {
      matchedPatterns: detected,
      highEntropyStrings: highEntropy,
    },
    sanitizedContent: this.clean(text),
  };
}
  
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