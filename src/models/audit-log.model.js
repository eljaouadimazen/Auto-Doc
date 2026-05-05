const auditStore = require('../services/audit-store.service');
const crypto = require('crypto');

class AuditLog {
  #sessionId;
  #repoUrl;
  #timestamp;

  constructor(repoUrl) {
    this.#sessionId = crypto.randomUUID();
    this.#repoUrl = repoUrl || 'unknown';
    this.#timestamp = new Date();
    auditStore.createSession(this.#sessionId, this.#repoUrl);
  }

  get sessionId() { return this.#sessionId; }

  RecordEntry(file, findings) {
    if (!findings || findings.length === 0) return;
    auditStore.recordEntry(this.#sessionId, file.path, findings);
  }

  IncrementScanned() {
    auditStore.incrementScanned(this.#sessionId);
  }

  GetSummary() {
    const summary = auditStore.getSummary(this.#sessionId);
    if (summary.filesScanned === 0) {
      summary.timestamp = this.#timestamp.toISOString();
    }
    return summary;
  }

  static GetRecentAudits(limit = 10) {
    return auditStore.getRecentAudits(limit);
  }
}

module.exports = AuditLog;
