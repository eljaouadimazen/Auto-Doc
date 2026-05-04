const { sanitizeLog } = require('../src/services/log-sanitizer');

describe('LogSanitizer', () => {
  describe('string sanitization', () => {
    test('redacts Groq API keys', () => {
      const input = 'Error with gsk_abc123def456ghi789jkl012 in stack';
      const result = sanitizeLog(input);
      expect(result).not.toContain('gsk_');
      expect(result).toContain('[REDACTED]');
    });

    test('redacts OpenAI API keys', () => {
      const input = 'Invalid key: sk-proj-1234567890abcdefghijklmnop';
      const result = sanitizeLog(input);
      expect(result).not.toContain('sk-proj-');
    });

    test('redacts AWS access keys', () => {
      const input = 'Using AKIAIOSFODNN7EXAMPLE for auth';
      const result = sanitizeLog(input);
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    test('redacts MongoDB URIs', () => {
      const input = 'Failed to connect to mongodb+srv://user:pass@cluster.mongodb.net/db';
      const result = sanitizeLog(input);
      expect(result).not.toContain('user:pass');
      expect(result).not.toContain('mongodb+srv://');
    });

    test('redacts Bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123';
      const result = sanitizeLog(input);
      expect(result).not.toContain('eyJhbGci');
      expect(result).toContain('[REDACTED]');
    });

    test('redacts GitHub PATs', () => {
      const input = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
      const result = sanitizeLog(input);
      expect(result).not.toContain('ghp_');
    });

    test('redacts PEM private keys', () => {
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
      const result = sanitizeLog(input);
      expect(result).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(result).not.toContain('MIIEowIBAAKCAQEA');
    });

    test('leaves clean strings unchanged', () => {
      const input = 'Hello world, this is a normal log message';
      const result = sanitizeLog(input);
      expect(result).toBe(input);
    });
  });

  describe('object sanitization', () => {
    test('redacts sensitive object keys', () => {
      const input = {
        method: 'POST',
        headers: {
          'x-api-key': 'gsk_abc123def456ghi789jkl012',
          'content-type': 'application/json'
        }
      };
      const result = sanitizeLog(input);
      expect(result.headers['x-api-key']).toBe('[REDACTED]');
      expect(result.headers['content-type']).toBe('application/json');
      expect(result.method).toBe('POST');
    });

    test('redacts password key', () => {
      const input = { user: 'admin', password: 'secret123' };
      const result = sanitizeLog(input);
      expect(result.password).toBe('[REDACTED]');
      expect(result.user).toBe('admin');
    });

    test('redacts authorization key', () => {
      const input = { authorization: 'Bearer token123' };
      const result = sanitizeLog(input);
      expect(result.authorization).toBe('[REDACTED]');
    });

    test('handles nested objects', () => {
      const input = {
        level1: {
          level2: {
            secret_key: 'AKIAIOSFODNN7EXAMPLE'
          }
        }
      };
      const result = sanitizeLog(input);
      expect(result.level1.level2.secret_key).toBe('[REDACTED]');
    });

    test('handles arrays with string values', () => {
      const input = {
        keys: ['AKIAIOSFODNN7EXAMPLE', 'normal-value']
      };
      const result = sanitizeLog(input);
      // Arrays are processed — string elements containing secrets are redacted
      expect(result.keys[0]).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result.keys[1]).toBe('normal-value');
    });
  });

  describe('Error sanitization', () => {
    test('sanitizes error stack', () => {
      const err = new Error('test error');
      const result = sanitizeLog(err);
      expect(typeof result).toBe('string');
      expect(result).toContain('Error: test error');
    });

    test('sanitizes error message with embedded key', () => {
      const err = new Error('Failed with key: gsk_abc123def456ghi789jkl012');
      const result = sanitizeLog(err);
      expect(result).not.toContain('gsk_');
    });
  });

  describe('null/undefined handling', () => {
    test('returns null for null input', () => {
      expect(sanitizeLog(null)).toBeNull();
    });

    test('returns undefined for undefined input', () => {
      expect(sanitizeLog(undefined)).toBeUndefined();
    });

    test('returns primitives unchanged', () => {
      expect(sanitizeLog(42)).toBe(42);
      expect(sanitizeLog(true)).toBe(true);
    });
  });
});
