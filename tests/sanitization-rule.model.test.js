const SanitizationRule = require('../src/models/sanitization-rule.model');

describe('SanitizationRule', () => {
  describe('constructor', () => {
    test('creates rule with given params', () => {
      const rule = new SanitizationRule('rule_1', 'api_key', 'sk-[A-Za-z0-9]+');
      expect(rule.id).toBe('rule_1');
      expect(rule.name).toBe('api_key');
      expect(rule.pattern).toBe('sk-[A-Za-z0-9]+');
      expect(rule.flags).toBe('gi');
    });

    test('uses custom flags when provided', () => {
      const rule = new SanitizationRule('rule_2', 'password', 'password=.*', 'g');
      expect(rule.flags).toBe('g');
    });
  });

  describe('TestMatch', () => {
    test('returns true when pattern matches', () => {
      const rule = new SanitizationRule('r1', 'api_key', 'sk-[A-Za-z0-9]+');
      expect(rule.TestMatch('const key = "sk-abc123"')).toBe(true);
    });

    test('returns false when pattern does not match', () => {
      const rule = new SanitizationRule('r1', 'api_key', 'sk-[A-Za-z0-9]+');
      expect(rule.TestMatch('const key = "no-secret-here"')).toBe(false);
    });

    test('returns false for null or non-string content', () => {
      const rule = new SanitizationRule('r1', 'test', 'test');
      expect(rule.TestMatch(null)).toBe(false);
      expect(rule.TestMatch(undefined)).toBe(false);
      expect(rule.TestMatch(123)).toBe(false);
    });

    test('resets lastIndex between calls', () => {
      const rule = new SanitizationRule('r1', 'test', 'test');
      expect(rule.TestMatch('test test test')).toBe(true);
      expect(rule.TestMatch('test test test')).toBe(true);
      expect(rule.TestMatch('no match')).toBe(false);
      expect(rule.TestMatch('test test test')).toBe(true);
    });
  });

  describe('Apply', () => {
    test('replaces matched content with redacted string', () => {
      const rule = new SanitizationRule('r1', 'password', 'password=[^;]+');
      const result = rule.Apply('db=admin;password=secret123;host=localhost');
      expect(result).toBe('db=admin;[REDACTED_SECRET];host=localhost');
    });

    test('replaces all matches globally', () => {
      const rule = new SanitizationRule('r1', 'key', 'sk-[a-z]+');
      const result = rule.Apply('key1=sk-abc key2=sk-def');
      expect(result).toBe('key1=[REDACTED_SECRET] key2=[REDACTED_SECRET]');
    });

    test('returns content unchanged when no match', () => {
      const rule = new SanitizationRule('r1', 'password', 'password=[^;]+');
      const result = rule.Apply('hello world');
      expect(result).toBe('hello world');
    });

    test('returns same content for null input', () => {
      const rule = new SanitizationRule('r1', 'test', 'test');
      expect(rule.Apply(null)).toBe(null);
      expect(rule.Apply(undefined)).toBe(undefined);
    });

    test('resets lastIndex between calls', () => {
      const rule = new SanitizationRule('r1', 'key', 'sk-[a-z]+');
      expect(rule.Apply('sk-abc')).toBe('[REDACTED_SECRET]');
      expect(rule.Apply('hello')).toBe('hello');
      expect(rule.Apply('sk-xyz')).toBe('[REDACTED_SECRET]');
    });
  });
});
