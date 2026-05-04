const sanitizerService = require('../src/services/sanitizer.service');
const sessionStore = require('../src/services/sanitizer-session-store');

describe('SanitizerSessionStore', () => {
  let session;
  let sessionId;

  beforeEach(() => {
    session = sanitizerService.createSession();
    session.anonymize('const key = "AKIAIOSFODNN7EXAMPLE";');
    sessionId = sessionStore.create(session);
  });

  afterEach(() => {
    sessionStore.destroy(sessionId);
  });

  test('create returns a session ID string', () => {
    expect(typeof sessionId).toBe('string');
    expect(sessionId.startsWith('sess_')).toBe(true);
  });

  test('get retrieves the same session', () => {
    const retrieved = sessionStore.get(sessionId);
    expect(retrieved).toBe(session);
    expect(retrieved.vaultSize).toBeGreaterThan(0);
  });

  test('destroy removes session from store', () => {
    sessionStore.destroy(sessionId);
    const retrieved = sessionStore.get(sessionId);
    expect(retrieved).toBeNull();
  });

  test('reintegrate works after retrieval from store', () => {
    const stored = sessionStore.get(sessionId);
    const anon = stored.anonymize('const secret = "AKIA2222222222222222";');
    const reint = stored.reintegrate(anon);
    expect(reint).toBe('const secret = "AKIA2222222222222222";');
  });

  test('get returns null for non-existent ID', () => {
    const result = sessionStore.get('sess_nonexistent_abc123');
    expect(result).toBeNull();
  });

  test('multiple sessions are stored independently', () => {
    const s1 = sanitizerService.createSession();
    const s2 = sanitizerService.createSession();

    s1.anonymize('KEY="AKIA1111111111111111"');
    s2.anonymize('KEY="AKIA2222222222222222"');

    const id1 = sessionStore.create(s1);
    const id2 = sessionStore.create(s2);

    expect(sessionStore.get(id1).vaultSize).toBeGreaterThan(0);
    expect(sessionStore.get(id2).vaultSize).toBeGreaterThan(0);
    expect(sessionStore.get(id1)).not.toBe(sessionStore.get(id2));

    sessionStore.destroy(id1);
    sessionStore.destroy(id2);
  });

  test('activeCount reflects number of stored sessions', () => {
    const before = sessionStore.activeCount;
    const s = sanitizerService.createSession();
    const id = sessionStore.create(s);
    expect(sessionStore.activeCount).toBe(before + 1);
    sessionStore.destroy(id);
  });
});
