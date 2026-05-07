const AuditLog = require('../src/models/audit-log.model');

describe('AuditLog', () => {
  let log;

  beforeEach(() => {
    log = new AuditLog();
  });

  describe('initial state', () => {
    test('starts with zero scans and no entries', () => {
      const summary = log.GetSummary();
      expect(summary.filesScanned).toBe(0);
      expect(summary.filesAffected).toBe(0);
      expect(summary.totalRedacted).toBe(0);
      expect(summary.findings).toEqual([]);
      expect(summary.timestamp).toBeDefined();
    });
  });

  describe('IncrementScanned', () => {
    test('increments filesScanned by 1', () => {
      log.IncrementScanned();
      expect(log.GetSummary().filesScanned).toBe(1);
    });

    test('increments filesScanned multiple times', () => {
      log.IncrementScanned();
      log.IncrementScanned();
      log.IncrementScanned();
      expect(log.GetSummary().filesScanned).toBe(3);
    });
  });

  describe('RecordEntry', () => {
    test('does nothing when findings is empty', () => {
      log.RecordEntry({ path: 'file.js' }, []);
      const summary = log.GetSummary();
      expect(summary.filesAffected).toBe(0);
      expect(summary.totalRedacted).toBe(0);
    });

    test('does nothing when findings is null or undefined', () => {
      log.RecordEntry({ path: 'file.js' }, null);
      log.RecordEntry({ path: 'file.js' }, undefined);
      const summary = log.GetSummary();
      expect(summary.filesAffected).toBe(0);
    });

    test('records entry with file path and findings', () => {
      log.RecordEntry({ path: 'src/config/.env' }, ['api_key', 'password']);
      const summary = log.GetSummary();
      expect(summary.filesAffected).toBe(1);
      expect(summary.totalRedacted).toBe(2);
      expect(summary.findings).toHaveLength(1);
      expect(summary.findings[0].file).toBe('src/config/.env');
      expect(summary.findings[0].patterns).toEqual(['api_key', 'password']);
    });

    test('accumulates multiple entries', () => {
      log.RecordEntry({ path: '.env' }, ['api_key']);
      log.RecordEntry({ path: 'config.yml' }, ['password']);
      log.IncrementScanned();
      log.RecordEntry({ path: 'secret.txt' }, ['token', 'password']);

      const summary = log.GetSummary();
      expect(summary.filesScanned).toBe(1);
      expect(summary.filesAffected).toBe(3);
      expect(summary.totalRedacted).toBe(4);
      expect(summary.findings).toHaveLength(3);
    });
  });
});
