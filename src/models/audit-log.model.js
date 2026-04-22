class AuditLog {
  #timestamp;
  #filesScanned;
  #totalRedacted;
  #entries;

  constructor() {
    this.#timestamp = new Date();
    this.#filesScanned = 0;
    this.#totalRedacted = 0;
    this.#entries = [];
  }

  RecordEntry(file, findings) {
    if (!findings || findings.length === 0) return;
    this.#entries.push({ file: file.path, patterns: findings });
    this.#totalRedacted += findings.length;
  }

  IncrementScanned() {
    this.#filesScanned++;
  }

  GetSummary() {
    return {
      timestamp: this.#timestamp.toISOString(),
      filesScanned: this.#filesScanned,
      filesAffected: this.#entries.length,
      totalRedacted: this.#totalRedacted,
      findings: this.#entries
    };
  }
}
module.exports = AuditLog;
