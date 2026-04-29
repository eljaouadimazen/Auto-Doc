/**
 * sanitizer.service.js
 *
 * Stage 1 of the Automated Sanitization Pipeline.
 *
 * DESIGN: Vault-based anonymization instead of destructive redaction.
 *
 * OLD approach:  SECRET_KEY=abc123  →  SECRET_KEY=[REDACTED_SECRET]
 * NEW approach:  SECRET_KEY=abc123  →  SECRET_KEY=[TOKEN_SECRET_KEY_a7b2]
 *                                       vault: { a7b2 → "abc123" }
 *
 * Why this matters:
 *   - The LLM sees the token placeholder and can write meaningful documentation
 *     ("The app authenticates using [TOKEN_AWS_KEY_x9q1]") instead of dead text.
 *   - After the LLM responds, call reintegrate(llmOutput) to swap tokens back to
 *     real values — entirely locally, the mapping never leaves the server.
 *   - audit() and clean() are kept for backwards compatibility with LLMInputBuilder.
 */

const crypto = require('crypto');

class SanitizerService {
  constructor() {
    // ── Vault ─────────────────────────────────────────────────────────────────
    // Maps tokenId → original value. Cleared per-session via resetVault().
    this._vault = new Map();

    // ── Built-in patterns ─────────────────────────────────────────────────────
    this.builtinPatterns = [
      { name: 'api_key',          regex: /api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9\-_.]{8,}["']?/gi },
      { name: 'secret_key',       regex: /secret[_-]?key\s*[:=]\s*["']?[A-Za-z0-9\-_.]{8,}["']?/gi },
      { name: 'access_token',     regex: /access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9\-_.]{8,}["']?/gi },
      { name: 'token',            regex: /\btoken\s*[:=]\s*["']?[A-Za-z0-9\-_.]{16,}["']?/gi },
      { name: 'password',         regex: /password\s*[:=]\s*["'][^"']{4,}["']/gi },
      { name: 'passwd',           regex: /passwd\s*[:=]\s*["'][^"']{4,}["']/gi },
      { name: 'github_pat',       regex: /ghp_[A-Za-z0-9]{20,}/g },
      { name: 'github_actions',   regex: /ghs_[A-Za-z0-9]{20,}/g },
      { name: 'openai_key',       regex: /sk-[A-Za-z0-9]{20,}/g },
      { name: 'slack_token',      regex: /xox[baprs]-[A-Za-z0-9\-]{10,}/g },
      { name: 'aws_key',          regex: /AKIA[A-Z0-9]{16}/g },
      { name: 'mailchimp_key',    regex: /[0-9a-f]{32}-us[0-9]+/g },
      { name: 'google_api_key',   regex: /AIza[0-9A-Za-z\-_]{35}/g },
      { name: 'groq_key',         regex: /gsk_[A-Za-z0-9]{20,}/g },
      { name: 'mongodb_uri',      regex: /mongodb(?:\+srv)?:\/\/[^\s"']+/gi },
      { name: 'postgres_uri',     regex: /postgres(?:ql)?:\/\/[^\s"']+/gi },
      { name: 'mysql_uri',        regex: /mysql:\/\/[^\s"']+/gi },
      { name: 'redis_uri',        regex: /redis:\/\/[^\s"']+/gi },
      { name: 'private_key_block',regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
      { name: 'ssh_private_key',  regex: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g },
      { name: 'certificate',      regex: /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g },
      // dotenv: KEY=VALUE lines — captured as group so we keep the key name visible
      { name: 'dotenv_value',     regex: /^([A-Z][A-Z0-9_]{2,})\s*=\s*["']?([^\s"'\n]{8,})["']?$/gm },
      // PII
      { name: 'email',            regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
      { name: 'phone_us',         regex: /(\+1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g },
      { name: 'phone_intl',       regex: /\+(?:[0-9][\s\-.]?){6,14}[0-9]/g },
      { name: 'ssn',              regex: /\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g },
      { name: 'credit_card',      regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g },
      { name: 'ip_address',       regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },
      { name: 'ipv6',             regex: /([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g },
      { name: 'mac_address',      regex: /([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}/g },
      { name: 'iban',             regex: /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}\b/g },
      { name: 'date_of_birth',    regex: /\b(?:dob|date.of.birth|birthdate)\s*[:=]\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/gi },
      { name: 'passport',         regex: /\b[A-Z]{1,2}[0-9]{6,9}\b/g },
      { name: 'national_id',      regex: /\b(?:national.id|nid|cin)\s*[:=]\s*[A-Z0-9\-]{6,20}/gi },
      // Additional secrets
      { name: 'stripe_key',       regex: /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}/g },
      { name: 'twilio_sid',       regex: /AC[a-z0-9]{32}/g },
      { name: 'twilio_token',     regex: /SK[a-z0-9]{32}/g },
      { name: 'firebase_key',     regex: /AAAA[A-Za-z0-9_\-]{7}:[A-Za-z0-9_\-]{140}/g },
      { name: 'jwt_token',        regex: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]*/g },
      { name: 'basic_auth_url',   regex: /https?:\/\/[^:]+:[^@]+@[^\s"']+/gi },
      { name: 'heroku_api_key',   regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g },
      { name: 'npm_token',        regex: /npm_[A-Za-z0-9]{36}/g },
      { name: 'cloudinary_url',   regex: /cloudinary:\/\/[0-9]+:[A-Za-z0-9_\-]+@[a-z0-9]+/g },
      { name: 'sendgrid_key',     regex: /SG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}/g },
    ];

    this.customRules     = [];
    this._customPatterns = [];
  }

  // ─── Vault helpers ────────────────────────────────────────────────────────────

  /**
   * Clear the vault between requests so tokens from one repo
   * cannot leak into another session.
   */
  resetVault() {
    this._vault.clear();
  }

  /**
   * Store a secret value in the vault and return a stable token.
   * If the same value appears multiple times in the same session,
   * it gets the same token (deduplication).
   *
   * Token format: [TOKEN_<TYPE>_<4-char-hex>]
   * e.g.          [TOKEN_AWS_KEY_a7b2]
   */
  _storeInVault(typeName, value) {
    // Deduplicate: same value → same token
    for (const [token, stored] of this._vault.entries()) {
      if (stored === value) return token;
    }
    const shortId = crypto.randomBytes(2).toString('hex');           // e.g. "a7b2"
    const key     = typeName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const token   = `[TOKEN_${key}_${shortId}]`;
    this._vault.set(token, value);
    return token;
  }

  /**
   * Replace all vault tokens in `text` with their original values.
   * Call this on the LLM's output — runs entirely locally.
   */
  reintegrate(text) {
    if (!text || typeof text !== 'string') return text;
    let result = text;
    for (const [token, value] of this._vault.entries()) {
      // Escape the token string for use in a regex (brackets are special)
      const escaped = token.replace(/[[\]]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), value);
    }
    return result;
  }

  /**
   * Return a read-only snapshot of the vault for audit/logging.
   * The caller decides whether to persist or discard this.
   */
  getVaultSnapshot() {
    return Object.fromEntries(
      [...this._vault.entries()].map(([token, value]) => [
        token,
        value.length > 40 ? value.slice(0, 40) + '…' : value   // truncate for logs
      ])
    );
  }

  // ─── Core: anonymize (replaces destructive clean) ─────────────────────────────

  /**
   * Scan `text`, replace each secret with a vault token, return anonymized text.
   * The vault is updated in place — call resetVault() between unrelated requests.
   *
   * This replaces the old `clean()` method. `clean()` is kept as an alias for
   * backwards compatibility with LLMInputBuilder's sanitizeFiles() call.
   */
  anonymize(text) {
    if (!text || typeof text !== 'string') return text;

    let result = text;
    const all  = [...this.builtinPatterns, ...this._customPatterns];

    all.forEach(({ name, regex }) => {
      regex.lastIndex = 0;
      result = result.replace(regex, (match, p1, p2) => {
        if (name === 'dotenv_value' && p1) {
          // Keep the key name visible: "DB_PASSWORD=[TOKEN_DOTENV_VALUE_c3d4]"
          const token = this._storeInVault('dotenv_value', p2 ?? match);
          return `${p1}=${token}`;
        }
        const token = this._storeInVault(name, match);
        return token;
      });
    });

    // High-entropy pass (catches secrets no regex matched)
    const entropyHits = this.detectHighEntropyStrings(result);
    entropyHits.forEach(hit => {
      const token = this._storeInVault('high_entropy', hit.value);
      // Replace every occurrence of this exact string
      result = result.split(hit.value).join(token);
    });

    return result;
  }

  /**
   * Backwards-compatible alias — LLMInputBuilder calls clean(), repository.model.js
   * calls sanitizerService.clean(). Both now route through anonymize() so the vault
   * is populated regardless of which entry point is used.
   */
  clean(text) {
    return this.anonymize(text);
  }

  cleanFiles(files) {
    return files.map(file => ({ ...file, content: this.anonymize(file.content) }));
  }

  // ─── audit() — unchanged API, used by LLMInputBuilder.sanitizeFiles ───────────

  audit(text) {
    if (!text || typeof text !== 'string') return [];
    const detected = [];
    const all = [...this.builtinPatterns, ...this._customPatterns];

    all.forEach(({ name, regex }) => {
      regex.lastIndex = 0;
      if (regex.test(text)) detected.push(name);
    });

    const entropyHits = this.detectHighEntropyStrings(text);
    if (entropyHits.length > 0) {
      detected.push(...entropyHits.map(h => `high_entropy (score: ${h.entropy})`));
    }

    return detected;
  }

  auditFiles(files) {
    return files.map(file => ({
      path:             file.path,
      detectedPatterns: this.audit(file.content)
    }));
  }

  // ─── Entropy detection ────────────────────────────────────────────────────────

  shannonEntropy(str) {
    const map = {};
    for (const char of str) map[char] = (map[char] || 0) + 1;
    return Object.values(map).reduce((acc, freq) => {
      const p = freq / str.length;
      return acc - p * Math.log2(p);
    }, 0);
  }

  detectHighEntropyStrings(text) {
    const SAFE_CONTEXTS = [
      /data:image\/[a-z]+;base64,/i,
      /\b[0-9a-f]{40}\b/i,    // git SHA
      /\b[0-9a-f]{64}\b/i,    // SHA-256
    ];

    const findings = [];
    text.split('\n').forEach((line, lineNum) => {
      if (SAFE_CONTEXTS.some(p => p.test(line))) return;
      const m = line.match(/[:=]\s*["']?([A-Za-z0-9+/=_\-]{20,})["']?/);
      if (!m) return;
      const candidate = m[1];
      const entropy   = this.shannonEntropy(candidate);
      if (entropy > 4.2) {
        findings.push({ value: candidate, entropy: entropy.toFixed(2), line: lineNum + 1 });
      }
    });
    return findings;
  }

  // ─── report() ─────────────────────────────────────────────────────────────────

  report(text, filePath = 'unknown') {
    const piiTypes    = ['email', 'phone_us', 'phone_intl', 'ssn', 'credit_card', 'ip_address', 'iban'];
    const secretTypes = ['api_key', 'jwt_token', 'aws_key', 'github_pat', 'password'];
    const detected    = this.audit(text);
    const highEntropy = this.detectHighEntropyStrings(text);

    return {
      filePath,
      timestamp:        new Date().toISOString(),
      hasSensitiveData: detected.length > 0 || highEntropy.length > 0,
      summary: {
        secrets:         detected.filter(d => secretTypes.includes(d)),
        pii:             detected.filter(d => piiTypes.includes(d)),
        highEntropyHits: highEntropy.length,
      },
      details: {
        matchedPatterns:    detected,
        highEntropyStrings: highEntropy,
      },
      anonymizedContent: this.anonymize(text),
    };
  }

  // ─── Custom rules API ─────────────────────────────────────────────────────────

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
}

module.exports = new SanitizerService();