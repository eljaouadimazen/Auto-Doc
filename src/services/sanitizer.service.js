/**
 * sanitizer.service.js
 *
 * Shared pattern registry + session factory.
 *
 * DESIGN: The singleton holds shared state (builtin patterns, custom rules).
 * Per-request vault state lives in SanitizerSession instances created via
 * createSession(). This eliminates race conditions between concurrent requests.
 *
 * Vault-based anonymization lifecycle:
 *   1. const session = sanitizerService.createSession()
 *   2. session.anonymize(text) → secrets → tokens, vault populated
 *   3. session.reintegrate(llmOutput) → tokens → secrets (local only)
 *   4. session.destroy() → clear vault, free memory
 */

const crypto = require('crypto');
const SanitizerSession = require('./sanitizer-session');

class SanitizerService {
  constructor() {
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

  // ─── Session factory ─────────────────────────────────────────────────────────

  /**
   * Create a new isolated sanitization session.
   * Each request should call this to get its own vault.
   */
  createSession() {
    const rules = [...this.builtinPatterns, ...this._customPatterns];
    return new SanitizerSession(rules);
  }

  // ─── Shared getters (for User model, legacy code) ────────────────────────────

  getAllPatterns() {
    return [...this.builtinPatterns, ...this._customPatterns];
  }

  // ─── Custom rules API (singleton — shared across all sessions) ────────────────

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

  // ─── Legacy helpers (backwards compatibility) ────────────────────────────────
  // These create a temporary session, run the operation, and return results.
  // New code should use createSession() directly.

  resetVault() {
    // No-op — vault is now per-session, not singleton.
    // Kept for backwards compatibility so existing callers don't break.
  }

  get _vault() {
    // Return an empty Map — singleton vault no longer exists.
    // Kept for backwards compatibility (LLMInputBuilder reads _vault.size).
    return new Map();
  }

  getVaultSnapshot() {
    // Returns empty — use session.getVaultSnapshot() instead.
    return {};
  }
}

module.exports = new SanitizerService();
