class AuditStore {
  constructor() {
    this.#store = new Map();
  }

  #store;

  store(sessionId, auditData) {
    if (!sessionId) return;
    this.#store.set(sessionId, {
      ...auditData,
      sessionId,
      storedAt: new Date().toISOString()
    });
  }

  getAll() {
    return Array.from(this.#store.values());
  }

  getBySessionId(sessionId) {
    return this.#store.get(sessionId) || null;
  }
}

module.exports = new AuditStore();
