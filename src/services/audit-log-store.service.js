const db = require('./audit-log-db.service');

class AuditLogStore {

  add(repoName, repoUrl, summary) {
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    db.insertSessionWithEntries(
      { id, repoUrl, timestamp, filesScanned: summary.filesScanned || 0, totalRedacted: summary.totalRedacted || 0 },
      summary.findings || []
    );

    return {
      id,
      timestamp,
      repoName,
      repoUrl,
      filesScanned: summary.filesScanned || 0,
      filesAffected: (summary.findings || []).length,
      totalRedacted: summary.totalRedacted || 0,
      findings: (summary.findings || []).map(f => ({
        file: f.file,
        patterns: f.patterns || []
      }))
    };
  }

  list(limit = 50) {
    return db.listSessions(limit);
  }

  clear() {
    db.clear();
  }

  get stats() {
    return db.getStats();
  }
}

module.exports = new AuditLogStore();
