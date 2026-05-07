const SecurityAgent = require('../src/agents/security.agent');

describe('SecurityAgent', () => {
  let agent;

  beforeAll(() => {
    agent = new SecurityAgent();
  });

  describe('shouldReview', () => {
    test('returns true when regex findings exist', () => {
      expect(agent.shouldReview('/path/to/file.js', ['api_key'])).toBe(true);
    });

    test('returns true for high-risk paths', () => {
      expect(agent.shouldReview('/path/to/.env', [])).toBe(true);
      expect(agent.shouldReview('/path/to/config.yml', [])).toBe(true);
      expect(agent.shouldReview('/path/to/credentials.json', [])).toBe(true);
      expect(agent.shouldReview('/path/to/secret.txt', [])).toBe(true);
      expect(agent.shouldReview('/path/to/auth.js', [])).toBe(true);
      expect(agent.shouldReview('/path/to/key.pem', [])).toBe(true);
      expect(agent.shouldReview('/path/to/token.txt', [])).toBe(true);
      expect(agent.shouldReview('/path/to/password.txt', [])).toBe(true);
      expect(agent.shouldReview('/path/to/settings.json', [])).toBe(true);
    });

    test('returns false for normal paths with no findings', () => {
      expect(agent.shouldReview('/path/to/index.js', [])).toBe(false);
      expect(agent.shouldReview('/path/to/app.ts', [])).toBe(false);
    });

    test('is case-insensitive for high-risk patterns', () => {
      expect(agent.shouldReview('/path/to/.Env', [])).toBe(true);
      expect(agent.shouldReview('/path/to/Config', [])).toBe(true);
      expect(agent.shouldReview('/path/to/SECRET', [])).toBe(true);
    });
  });

  describe('normalize', () => {
    test('fills missing fields with defaults', () => {
      const result = agent.normalize({}, '/default/path.js');
      expect(result.path).toBe('/default/path.js');
      expect(result.riskLevel).toBe('clean');
      expect(result.confirmedSecrets).toEqual([]);
      expect(result.falsePositives).toEqual([]);
      expect(result.missedByRegex).toEqual([]);
      expect(result.recommendation).toBe('safe_to_send');
      expect(result.notes).toBe('');
      expect(result.agentReviewed).toBe(true);
    });

    test('preserves provided fields over defaults', () => {
      const input = {
        path: '/custom/path.js',
        riskLevel: 'critical',
        confirmedSecrets: [{ type: 'api_key', location: 'line 5', shouldRedact: true }],
        falsePositives: [{ regexPattern: 'password', reason: 'test data' }],
        recommendation: 'do_not_send',
        notes: 'Hardcoded AWS key found',
      };
      const result = agent.normalize(input, '/default/path.js');
      expect(result.path).toBe('/custom/path.js');
      expect(result.riskLevel).toBe('critical');
      expect(result.confirmedSecrets).toHaveLength(1);
      expect(result.falsePositives).toHaveLength(1);
      expect(result.recommendation).toBe('do_not_send');
      expect(result.notes).toBe('Hardcoded AWS key found');
    });

    test('passes through regexFindings', () => {
      const findings = ['api_key', 'password'];
      const result = agent.normalize({}, '/path.js', findings);
      expect(result.regexFindings).toEqual(findings);
    });
  });

  describe('buildCleanResult', () => {
    test('returns clean result with given path and reason', () => {
      const result = agent.buildCleanResult('/path/to/file.js', 'File too small');
      expect(result.path).toBe('/path/to/file.js');
      expect(result.riskLevel).toBe('clean');
      expect(result.confirmedSecrets).toEqual([]);
      expect(result.recommendation).toBe('safe_to_send');
      expect(result.notes).toBe('File too small');
      expect(result.agentReviewed).toBe(false);
      expect(result.regexFindings).toEqual([]);
    });
  });

  describe('buildPrompt', () => {
    test('includes regex findings context when findings exist', () => {
      const prompt = agent.buildPrompt('/path/file.js', 'code content', ['api_key']);
      expect(prompt).toContain('already found these pattern types');
      expect(prompt).toContain('api_key');
      expect(prompt).toContain('/path/file.js');
      expect(prompt).toContain('code content');
    });

    test('includes no-findings context when regex array is empty', () => {
      const prompt = agent.buildPrompt('/path/file.js', 'code content', []);
      expect(prompt).toContain('found nothing');
      expect(prompt).toContain('/path/file.js');
      expect(prompt).toContain('code content');
    });
  });
});
