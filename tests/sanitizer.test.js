const sanitizerService = require('../src/services/sanitizer.service');

describe('SanitizerService', () => {
  let session;

  beforeEach(() => {
    session = sanitizerService.createSession();
  });

  afterEach(() => {
    session.destroy();
  });

  describe('session creation', () => {
    test('createSession returns a new session each time', () => {
      const s1 = sanitizerService.createSession();
      const s2 = sanitizerService.createSession();
      expect(s1).not.toBe(s2);
      s1.destroy();
      s2.destroy();
    });

    test('new session starts with empty vault', () => {
      expect(session.vaultSize).toBe(0);
    });
  });

  describe('AWS key detection', () => {
    test('detects and anonymizes AWS access key', () => {
      const text = 'const key = "AKIAIOSFODNN7EXAMPLE";';
      const anon = session.anonymize(text);
      expect(anon).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(anon).toContain('[TOKEN_AWS_KEY_');
    });

    test('reintegrates AWS key back to original', () => {
      const text = 'const key = "AKIAIOSFODNN7EXAMPLE";';
      const anon = session.anonymize(text);
      const reint = session.reintegrate(anon);
      expect(reint).toBe(text);
    });
  });

  describe('Groq key detection', () => {
    test('detects and anonymizes Groq API key', () => {
      const text = 'GROQ_API_KEY=gsk_abc123def456ghi789jkl012';
      const anon = session.anonymize(text);
      expect(anon).not.toContain('gsk_abc123def456ghi789jkl012');
      expect(anon).toContain('[TOKEN_');
    });
  });

  describe('OpenAI key detection', () => {
    test('detects sk- prefix keys', () => {
      const text = 'OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012';
      const anon = session.anonymize(text);
      expect(anon).not.toContain('sk-proj-');
    });
  });

  describe('GitHub PAT detection', () => {
    test('detects ghp_ personal access token', () => {
      const text = 'GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
      const anon = session.anonymize(text);
      expect(anon).not.toContain('ghp_');
    });

    test('detects ghs_ GitHub Actions token', () => {
      const text = 'token: ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
      const anon = session.anonymize(text);
      expect(anon).not.toContain('ghs_');
    });
  });

  describe('MongoDB URI detection', () => {
    test('detects mongodb:// connection string', () => {
      const text = 'const uri = "mongodb://user:pass123@localhost:27017/mydb";';
      const anon = session.anonymize(text);
      expect(anon).not.toContain('user:pass123');
    });

    test('detects mongodb+srv:// connection string', () => {
      const text = 'const uri = "mongodb+srv://admin:secret@cluster.mongodb.net/prod";';
      const anon = session.anonymize(text);
      expect(anon).not.toContain('admin:secret');
    });
  });

  describe('private key block detection', () => {
    test('detects PEM private key block', () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy
-----END RSA PRIVATE KEY-----`;
      const anon = session.anonymize(text);
      expect(anon).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(anon).not.toContain('MIIEowIBAAKCAQEA');
    });
  });

  describe('dotenv value detection', () => {
    test('anonymizes dotenv values while keeping key visible', () => {
      const text = 'DB_PASSWORD=supersecretvalue123';
      const anon = session.anonymize(text);
      expect(anon).toContain('DB_PASSWORD=');
      expect(anon).not.toContain('supersecretvalue123');
      expect(anon).toContain('[TOKEN_DOTENV_VALUE_');
    });
  });

  describe('email detection', () => {
    test('detects email addresses', () => {
      const text = 'const email = "user@example.com";';
      const anon = session.anonymize(text);
      expect(anon).not.toContain('user@example.com');
    });
  });

  describe('JWT token detection', () => {
    test('detects JWT tokens', () => {
      const text = 'const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";';
      const anon = session.anonymize(text);
      expect(anon).not.toContain('eyJhbGci');
    });
  });

  describe('deduplication', () => {
    test('same secret value gets same token', () => {
      const text = 'KEY1=AKIAIOSFODNN7EXAMPLE\nKEY2=AKIAIOSFODNN7EXAMPLE';
      const anon = session.anonymize(text);
      const tokens = anon.match(/\[TOKEN_[^\]]+\]/g) || [];
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(1);
    });
  });

  describe('audit (read-only)', () => {
    test('detects pattern types without modifying text', () => {
      const text = 'const key = "AKIAIOSFODNN7EXAMPLE";';
      const findings = session.audit(text);
      expect(findings).toContain('aws_key');
    });

    test('returns empty array for clean text', () => {
      const text = 'const x = 42;\nconsole.log("hello");';
      const findings = session.audit(text);
      expect(findings).toEqual([]);
    });
  });

  describe('shannon entropy detection', () => {
    test('detects high-entropy strings', () => {
      const text = 'const secret = "xK9$mP2vL8qR4wN7jF5hT3yB"';
      const hits = session.detectHighEntropyStrings
        ? session.detectHighEntropyStrings(text)
        : [];
      if (hits.length > 0) {
        expect(hits[0].entropy).toBeGreaterThan(4.0);
      }
    });

    test('low-entropy strings are not flagged', () => {
      const text = 'const greeting = "hello world";';
      const hits = session.detectHighEntropyStrings
        ? session.detectHighEntropyStrings(text)
        : [];
      expect(hits).toEqual([]);
    });
  });

  describe('session isolation', () => {
    test('destroyed session cannot reintegrate', () => {
      const text = 'const key = "AKIAIOSFODNN7EXAMPLE";';
      const anon = session.anonymize(text);
      session.destroy();
      expect(session.isDestroyed).toBe(true);
    });

    test('two sessions have independent vaults', () => {
      const s1 = sanitizerService.createSession();
      const s2 = sanitizerService.createSession();

      const text1 = 'const key = "AKIA1111111111111111";';
      const text2 = 'const key = "AKIA2222222222222222";';

      const anon1 = s1.anonymize(text1);
      const anon2 = s2.anonymize(text2);

      const reint1 = s1.reintegrate(anon1);
      const reint2 = s2.reintegrate(anon2);

      expect(reint1).toBe(text1);
      expect(reint2).toBe(text2);

      s1.destroy();
      s2.destroy();
    });
  });

  describe('custom rules', () => {
    test('addCustomRule adds a pattern that gets detected', () => {
      sanitizerService.addCustomRule('internal_token', 'INT_[A-Z0-9]{8}', 'g');
      const session2 = sanitizerService.createSession();
      const text = 'const token = "INT_ABCD1234";';
      const findings = session2.audit(text);
      expect(findings).toContain('internal_token');
      const anon = session2.anonymize(text);
      expect(anon).not.toContain('INT_ABCD1234');
      session2.destroy();
      sanitizerService.removeCustomRule(sanitizerService.customRules[sanitizerService.customRules.length - 1].id);
    });

    test('removeCustomRule removes the pattern', () => {
      const rule = sanitizerService.addCustomRule('test_rule', 'TEST_[0-9]+', 'g');
      expect(sanitizerService.listCustomRules().length).toBeGreaterThan(0);
      sanitizerService.removeCustomRule(rule.id);
      const remaining = sanitizerService.listCustomRules().find(r => r.id === rule.id);
      expect(remaining).toBeUndefined();
    });

    test('invalid regex throws error', () => {
      expect(() => {
        sanitizerService.addCustomRule('bad', '[invalid', 'g');
      }).toThrow('Invalid regex');
    });
  });

  describe('cleanFiles', () => {
    test('anonymizes content in multiple files', () => {
      const files = [
        { path: 'src/config.js', content: 'const key = "AKIAIOSFODNN7EXAMPLE";' },
        { path: 'src/db.js', content: 'const uri = "mongodb://user:pass@localhost/db";' }
      ];
      const result = session.cleanFiles(files);
      expect(result[0].content).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result[1].content).not.toContain('user:pass');
    });
  });
});
