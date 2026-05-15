const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../../data/audit-log.db');

class AuditLogDatabase {
  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  insertSession({ id, repoUrl, timestamp, filesScanned, totalRedacted }) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_sessions (session_id, repo_url, created_at, files_scanned, total_redacted)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, repoUrl || '', timestamp, filesScanned, totalRedacted);
  }

  insertEntry(sessionId, filePath, patterns) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_entries (session_id, file_path, patterns)
      VALUES (?, ?, ?)
    `);
    stmt.run(sessionId, filePath, JSON.stringify(patterns));
  }

  insertSessionWithEntries(session, findings) {
    const insertSession = this.db.prepare(`
      INSERT INTO audit_sessions (session_id, repo_url, created_at, files_scanned, total_redacted)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertEntry = this.db.prepare(`
      INSERT INTO audit_entries (session_id, file_path, patterns)
      VALUES (?, ?, ?)
    `);

    const tx = this.db.transaction(({ id, repoUrl, timestamp, filesScanned, totalRedacted }, entries) => {
      insertSession.run(id, repoUrl, timestamp, filesScanned, totalRedacted);
      for (const f of entries) {
        insertEntry.run(id, f.file, JSON.stringify(f.patterns || []));
      }
    });

    tx(session, findings);
  }

  listSessions(limit = 50) {
    const rows = this.db.prepare(`
      SELECT session_id, repo_url, created_at, files_scanned, total_redacted
      FROM audit_sessions
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    const getEntries = this.db.prepare(`
      SELECT file_path, patterns FROM audit_entries
      WHERE session_id = ?
      ORDER BY id ASC
    `);

    return rows.map(row => {
      const entries = getEntries.all(row.session_id);
      return {
        id: row.session_id,
        timestamp: row.created_at,
        repoUrl: row.repo_url,
        filesScanned: row.files_scanned,
        filesAffected: entries.length,
        totalRedacted: row.total_redacted,
        findings: entries.map(e => ({
          file: e.file_path,
          patterns: JSON.parse(e.patterns)
        }))
      };
    });
  }

  getStats() {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total_entries,
        COALESCE(SUM(files_scanned), 0) AS scans,
        COALESCE(SUM(total_redacted), 0) AS redactions,
        (SELECT COUNT(*) FROM audit_entries) AS affected
      FROM audit_sessions
    `).get();
    return {
      totalEntries: row.total_entries,
      scans: row.scans,
      redactions: row.redactions,
      affected: row.affected
    };
  }

  clear() {
    this.db.exec('DELETE FROM audit_entries');
    this.db.exec('DELETE FROM audit_sessions');
  }

  close() {
    this.db.close();
  }
}

module.exports = new AuditLogDatabase();
