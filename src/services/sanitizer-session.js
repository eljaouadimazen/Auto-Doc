/**
 * sanitizer-session.js
 *
 * Per-request sanitization session — each HTTP request or CI run gets its own
 * isolated vault. This eliminates the race condition where concurrent requests
 * could overwrite each other's vault data via the singleton SanitizerService.
 *
 * Lifecycle:
 *   1. SanitizerService.createSession() → new SanitizerSession(rules)
 *   2. session.anonymize(text)          → populates this session's vault
 *   3. session.reintegrate(llmOutput)   → swaps tokens back (local only)
 *   4. session.destroy()                → clear vault, free memory
 *
 * The vault mapping NEVER leaves the server. The LLM only sees tokens.
 */

const crypto = require('crypto');

class SanitizerSession {
  /**
   * @param {Array} rules - Array of { name, regex } pattern objects
   */
  constructor(rules = []) {
    this._vault = new Map();
    this._rules = rules;
    this._createdAt = Date.now();
    this._destroyed = false;
  }

  get vaultSize() { return this._vault.size; }
  get isDestroyed() { return this._destroyed; }

  // ─── Vault helpers ────────────────────────────────────────────────────────────

  _storeInVault(typeName, value) {
    for (const [token, stored] of this._vault.entries()) {
      if (stored === value) return token;
    }
    const shortId = crypto.randomBytes(2).toString('hex');
    const key     = typeName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const token   = `[TOKEN_${key}_${shortId}]`;
    this._vault.set(token, value);
    return token;
  }

  /**
   * Replace all vault tokens in `text` with their original values.
   * Runs entirely locally — the vault mapping never leaves the server.
   */
  reintegrate(text) {
    if (this._destroyed) return text;
    if (!text || typeof text !== 'string') return text;
    let result = text;
    for (const [token, value] of this._vault.entries()) {
      const escaped = token.replace(/[[\]]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), value);
    }
    return result;
  }

  /**
   * Return a read-only snapshot of the vault for audit/logging.
   * Values longer than 40 chars are clipped for safety.
   */
  getVaultSnapshot() {
    if (this._destroyed) return {};
    return Object.fromEntries(
      [...this._vault.entries()].map(([token, value]) => [
        token,
        value.length > 40 ? value.slice(0, 40) + '\u2026' : value
      ])
    );
  }

  // ─── Core: anonymize ─────────────────────────────────────────────────────────

  /**
   * Scan `text`, replace each secret with a vault token, return anonymized text.
   * This session's vault is updated in place.
   */
  anonymize(text) {
    if (this._destroyed) return text;
    if (!text || typeof text !== 'string') return text;

    let result = text;

    this._rules.forEach(({ name, regex }) => {
      regex.lastIndex = 0;
      result = result.replace(regex, (match, p1, p2) => {
        if (name === 'dotenv_value' && p1) {
          const token = this._storeInVault('dotenv_value', p2 ?? match);
          return `${p1}=${token}`;
        }
        const token = this._storeInVault(name, match);
        return token;
      });
    });

    // High-entropy pass (catches secrets no regex matched)
    const entropyHits = this._detectHighEntropyStrings(result);
    entropyHits.forEach(hit => {
      const token = this._storeInVault('high_entropy', hit.value);
      result = result.split(hit.value).join(token);
    });

    return result;
  }

  /**
   * Backwards-compatible alias.
   */
  clean(text) {
    return this.anonymize(text);
  }

  cleanFiles(files) {
    return files.map(file => ({ ...file, content: this.anonymize(file.content) }));
  }

  // ─── Audit (read-only — does NOT populate vault) ─────────────────────────────

  audit(text) {
    if (!text || typeof text !== 'string') return [];
    const detected = [];

    this._rules.forEach(({ name, regex }) => {
      regex.lastIndex = 0;
      if (regex.test(text)) detected.push(name);
    });

    const entropyHits = this._detectHighEntropyStrings(text);
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

  // ─── Report ───────────────────────────────────────────────────────────────────

  report(text, filePath = 'unknown') {
    const piiTypes    = ['email', 'phone_us', 'phone_intl', 'ssn', 'credit_card', 'ip_address', 'iban'];
    const secretTypes = ['api_key', 'jwt_token', 'aws_key', 'github_pat', 'password'];
    const detected    = this.audit(text);
    const highEntropy = this._detectHighEntropyStrings(text);

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

  // ─── Entropy detection ────────────────────────────────────────────────────────

  _shannonEntropy(str) {
    const map = {};
    for (const char of str) map[char] = (map[char] || 0) + 1;
    return Object.values(map).reduce((acc, freq) => {
      const p = freq / str.length;
      return acc - p * Math.log2(p);
    }, 0);
  }

  _detectHighEntropyStrings(text) {
    const SAFE_CONTEXTS = [
      /data:image\/[a-z]+;base64,/i,
      /\b[0-9a-f]{40}\b/i,
      /\b[0-9a-f]{64}\b/i,
    ];

    const findings = [];
    text.split('\n').forEach((line, lineNum) => {
      if (SAFE_CONTEXTS.some(p => p.test(line))) return;
      const m = line.match(/[:=]\s*["']?([A-Za-z0-9+/=_\-]{20,})["']?/);
      if (!m) return;
      const candidate = m[1];
      const entropy   = this._shannonEntropy(candidate);
      if (entropy > 4.2) {
        findings.push({ value: candidate, entropy: entropy.toFixed(2), line: lineNum + 1 });
      }
    });
    return findings;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Clear the vault and mark this session as destroyed.
   * Call this after reintegration is complete to free memory.
   */
  destroy() {
    this._vault.clear();
    this._destroyed = true;
  }
}

module.exports = SanitizerSession;
