const Documentation = require('../src/models/documentation.model');

describe('Documentation', () => {
  describe('constructor and getters', () => {
    test('stores content and stats', () => {
      const doc = new Documentation('# Doc', { mode: 'agentic', filesAnalyzed: 5 });
      expect(doc.content).toBe('# Doc');
      expect(doc.stats).toEqual({ mode: 'agentic', filesAnalyzed: 5 });
    });

    test('generates timestamp on construction', () => {
      const before = new Date();
      const doc = new Documentation('content', {});
      const after = new Date();
      expect(doc.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(doc.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test('handles empty content', () => {
      const doc = new Documentation('', {});
      expect(doc.content).toBe('');
    });

    test('handles null stats', () => {
      const doc = new Documentation('content', null);
      expect(doc.stats).toBeNull();
    });
  });
});
