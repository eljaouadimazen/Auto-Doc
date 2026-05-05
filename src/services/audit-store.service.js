const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'audit-log.db');
const MAX_ENTRIES = parseInt(process.env.AUDIT_MAX_ENTRIES, 10) || 1000;
const MAX_SESSIONS = parseInt(process.env.AUDIT_MAX_SESSIONS, 10) || 100;

class AuditStore {
  constructor() {
    this.db = null;
    this._initialize();
  }

  _initialize() {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_sessions (
        session_id   TEXT PRIMARY KEY,
        repo_url     TEXT NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        files_scanned INTEGER NOT NULL DEFAULT 0,
        total_redacted INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS audit_entries (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        file_path  TEXT NOT NULL,
        patterns   TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES audit_sessions(session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_entries_session ON audit_entries(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_created ON audit_sessions(created_at);
    `);

    this._enforceLimits();
  }

  _enforceLimits() {
    const sessionCount = this.db.prepare('SELECT COUNT(*) as cnt FROM audit_sessions').get();
    if (sessionCount.cnt > MAX_SESSIONS) {
      const excess = sessionCount.cnt - MAX_SESSIONS;
      this.db.prepare(`
        DELETE FROM audit_sessions
        WHERE session_id IN (
          SELECT session_id FROM audit_sessions
          ORDER BY created_at ASC
          LIMIT ?
        )
      `).run(excess);
    }

    const entryCount = this.db.prepare('SELECT COUNT(*) as cnt FROM audit_entries').get();
    if (entryCount.cnt > MAX_ENTRIES) {
      const excess = entryCount.cnt - MAX_ENTRIES;
      this.db.prepare(`
        DELETE FROM audit_entries
        WHERE id IN (
          SELECT id FROM audit_entries
          ORDER BY created_at ASC
          LIMIT ?
        )
      `).run(excess);
    }

    this.db.exec('VACUUM');
  }

  createSession(sessionId, repoUrl) {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO audit_sessions (session_id, repo_url) VALUES (?, ?)');
    stmt.run(sessionId, repoUrl);
  }

  incrementScanned(sessionId) {
    const stmt = this.db.prepare('UPDATE audit_sessions SET files_scanned = files_scanned + 1 WHERE session_id = ?');
    stmt.run(sessionId);
  }

  recordEntry(sessionId, filePath, findings) {
    const patternsJson = JSON.stringify(findings);
    const stmt = this.db.prepare('INSERT INTO audit_entries (session_id, file_path, patterns) VALUES (?, ?, ?)');
    stmt.run(sessionId, filePath, patternsJson);

    this.db.prepare('UPDATE audit_sessions SET total_redacted = total_redacted + ? WHERE session_id = ?')
      .run(findings.length, sessionId);

    this._enforceLimits();
  }

  getSummary(sessionId) {
    const session = this.db.prepare('SELECT * FROM audit_sessions WHERE session_id = ?').get(sessionId);
    if (!session) {
      return {
        timestamp: new Date().toISOString(),
        filesScanned: 0,
        filesAffected: 0,
        totalRedacted: 0,
        findings: []
      };
    }

    const entries = this.db.prepare('SELECT file_path, patterns FROM audit_entries WHERE session_id = ? ORDER BY id ASC').all(sessionId);
    const findings = entries.map(e => ({
      file: e.file_path,
      patterns: JSON.parse(e.patterns)
    }));

    return {
      timestamp: session.created_at,
      filesScanned: session.files_scanned,
      filesAffected: findings.length,
      totalRedacted: session.total_redacted,
      findings
    };
  }

  getRecentAudits(limit = 10) {
    const sessions = this.db.prepare(`
      SELECT session_id, repo_url, created_at, files_scanned, total_redacted
      FROM audit_sessions
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    return sessions.map(s => ({
      sessionId: s.session_id,
      repoUrl: s.repo_url,
      createdAt: s.created_at,
      filesScanned: s.files_scanned,
      totalRedacted: s.total_redacted
    }));
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

const instance = new AuditStore();
module.exports = instance;
