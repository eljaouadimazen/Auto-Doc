/**
 * sanitizer-session-store.js
 *
 * Manages per-request sanitizer sessions across multi-step HTTP pipelines.
 *
 * The build → generate pipeline spans two separate HTTP requests. The vault
 * created during buildInput must survive until generateDocs calls reintegrate().
 * This store maps session IDs to SanitizerSession instances with TTL-based cleanup.
 *
 * Usage:
 *   const sessionId = sessionStore.create(session);
 *   // ... later, in next request ...
 *   const session = sessionStore.get(sessionId);
 *   session.reintegrate(llmOutput);
 *   sessionStore.destroy(sessionId);
 */

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

class SanitizerSessionStore {
  constructor() {
    this._sessions = new Map();
    this._cleanupInterval = setInterval(() => this._evictExpired(), 60 * 1000);
    this._cleanupInterval.unref(); // Don't keep process alive
  }

  /**
   * Store a session and return a unique ID.
   */
  create(session) {
    const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this._sessions.set(id, { session, createdAt: Date.now() });
    return id;
  }

  /**
   * Retrieve a session by ID. Returns null if not found or expired.
   */
  get(id) {
    const entry = this._sessions.get(id);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > SESSION_TTL_MS) {
      this._sessions.delete(id);
      entry.session.destroy();
      return null;
    }
    return entry.session;
  }

  /**
   * Destroy a session and remove it from the store.
   */
  destroy(id) {
    const entry = this._sessions.get(id);
    if (entry) {
      entry.session.destroy();
      this._sessions.delete(id);
    }
  }

  /**
   * Remove expired sessions.
   */
  _evictExpired() {
    const now = Date.now();
    for (const [id, entry] of this._sessions.entries()) {
      if (now - entry.createdAt > SESSION_TTL_MS) {
        entry.session.destroy();
        this._sessions.delete(id);
      }
    }
  }

  /**
   * Get the number of active sessions (for monitoring/debugging).
   */
  get activeCount() {
    return this._sessions.size;
  }
}

module.exports = new SanitizerSessionStore();
