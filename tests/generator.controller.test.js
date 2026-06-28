jest.mock('../src/services/llm.service', () => ({
  generate: jest.fn(),
  validateKey: jest.fn(),
}));

jest.mock('../src/services/llm-input-builder.service', () => ({
  build: jest.fn(),
}));

jest.mock('../src/models/repository.model', () => {
  const mock = jest.fn().mockImplementation(() => ({
    FetchFiles: jest.fn().mockResolvedValue(),
    files: [
      { Sanitize: jest.fn().mockReturnValue([]), toJSON: () => ({ path: 'src/app.js', content: 'const x = 1;' }) },
    ],
    auditLog: {
      IncrementScanned: jest.fn(),
      RecordEntry: jest.fn(),
      GetSummary: jest.fn().mockReturnValue({ filesScanned: 1, filesAffected: 0, totalRedacted: 0 }),
    },
    name: 'test-repo',
  }));
  mock.fromDTO = jest.fn().mockReturnValue({
    name: 'test-repo',
    files: [{ path: 'src/app.js', content: 'code' }],
    GenerateDocumentation: jest.fn().mockResolvedValue({
      content: '# Generated Docs',
      stats: { filesAnalyzed: 1 },
    }),
  });
  return mock;
});

jest.mock('../src/services/sanitizer-session-store', () => ({
  create: jest.fn(() => 'test-session-id'),
  get: jest.fn(),
  destroy: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const generatorController = require('../src/controllers/generator.controller');
const llmService = require('../src/services/llm.service');
const llmInputBuilder = require('../src/services/llm-input-builder.service');
const sessionStore = require('../src/services/sanitizer-session-store');

function createApp() {
  const app = express();
  app.use(express.json());
  app.post('/validate-key', (req, res) => generatorController.validateKey(req, res));
  app.get('/rules', (req, res) => generatorController.listRules(req, res));
  app.post('/rules', (req, res) => generatorController.addRule(req, res));
  app.delete('/rules/:id', (req, res) => generatorController.removeRule(req, res));
  app.post('/rules/test', (req, res) => generatorController.testRule(req, res));
  app.post('/fetch', (req, res) => generatorController.fetchRepo(req, res));
  app.post('/build', (req, res) => generatorController.buildInput(req, res));
  app.post('/generate', (req, res) => generatorController.generateDocs(req, res));
  return app;
}

describe('GeneratorController', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  describe('POST /validate-key', () => {
    test('returns valid for Ollama without key', async () => {
      llmService.validateKey.mockResolvedValue({
        valid: true,
        reason: 'Ollama (local) — no key required'
      });

      const res = await request(app)
        .post('/validate-key')
        .set('x-provider', 'ollama');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });

    test('returns 200 with valid key', async () => {
      llmService.validateKey.mockResolvedValue({
        valid: true,
        reason: 'Key is valid — 42 models available',
        models: 42
      });

      const res = await request(app)
        .post('/validate-key')
        .set('x-api-key', 'valid-key')
        .set('x-provider', 'groq');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.reason).toContain('Key is valid');
    });

    test('returns 200 with invalid key', async () => {
      llmService.validateKey.mockResolvedValue({
        valid: false,
        reason: 'Invalid API key — check your Groq console'
      });

      const res = await request(app)
        .post('/validate-key')
        .set('x-api-key', 'bad-key');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });

    test('returns 500 on service error', async () => {
      llmService.validateKey.mockRejectedValue(new Error('Service crashed'));

      const res = await request(app)
        .post('/validate-key')
        .set('x-api-key', 'key');

      expect(res.status).toBe(500);
      expect(res.body.valid).toBe(false);
    });

    test('handles missing API key (no x-api-key header)', async () => {
      const res = await request(app)
        .post('/validate-key')
        .set('x-provider', 'groq');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe('No API key provided');
    });
  });

  describe('GET /rules', () => {
    test('returns list of built-in rules', async () => {
      const res = await request(app).get('/rules');

      expect(res.status).toBe(200);
      expect(res.body.rules).toBeDefined();
      expect(Array.isArray(res.body.rules)).toBe(true);
      expect(res.body.rules.length).toBeGreaterThan(5);
      res.body.rules.forEach(rule => {
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('name');
        expect(rule).toHaveProperty('pattern');
      });
    });
  });

  describe('POST /rules/test', () => {
    test('tests a pattern against sample text', async () => {
      const res = await request(app)
        .post('/rules/test')
        .send({
          pattern: 'sk-[A-Za-z0-9]+',
          sample: 'my key is sk-abc123 and sk-xyz789'
        });

      expect(res.status).toBe(200);
      expect(res.body.matched).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.preview).toContain('[REDACTED_SECRET]');
    });

    test('returns no match when pattern does not match', async () => {
      const res = await request(app)
        .post('/rules/test')
        .send({
          pattern: 'AKIA[0-9A-Z]{16}',
          sample: 'no secrets here'
        });

      expect(res.status).toBe(200);
      expect(res.body.matched).toBe(false);
      expect(res.body.count).toBe(0);
      expect(res.body.preview).toBe('no secrets here');
    });

    test('returns 400 for invalid pattern', async () => {
      const res = await request(app)
        .post('/rules/test')
        .send({
          pattern: '[invalid',
          sample: 'test'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /fetch', () => {
    test('returns 400 for invalid GitHub URL', async () => {
      const res = await request(app)
        .post('/fetch')
        .send({ githubUrl: 'not-a-url' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid GitHub URL');
    });

    test('returns files for valid GitHub URL', async () => {
      const res = await request(app)
        .post('/fetch')
        .send({ githubUrl: 'https://github.com/user/repo' });

      expect(res.status).toBe(200);
      expect(res.body.step).toBe('fetch');
      expect(res.body.files).toBeInstanceOf(Array);
      expect(res.body.rawMarkdown).toBeDefined();
    });

    test('returns 500 on server error', async () => {
      const Repository = require('../src/models/repository.model');
      Repository.mockImplementationOnce(() => {
        throw new Error('Server error');
      });

      const res = await request(app)
        .post('/fetch')
        .send({ githubUrl: 'https://github.com/user/repo' });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /build', () => {
    beforeEach(() => {
      llmInputBuilder.build.mockResolvedValue({
        chunks: [{ chunkIndex: 0, messages: [{ role: 'user', content: 'test' }], fileCount: 1 }],
        mode: 'classic',
        vaultSize: 0,
        audit: { filesScanned: 1 },
      });
    });

    test('returns 400 when no content provided', async () => {
      const res = await request(app)
        .post('/build')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No content to build from');
    });

    test('returns build result with files', async () => {
      const res = await request(app)
        .post('/build')
        .send({ files: [{ path: 'app.js', content: 'code' }] });

      expect(res.status).toBe(200);
      expect(res.body.step).toBe('build');
      expect(res.body.chunks).toBeDefined();
      expect(res.body.sessionId).toBeDefined();
    });

    test('returns build result with rawMarkdown', async () => {
      const res = await request(app)
        .post('/build')
        .send({ rawMarkdown: '# some markdown' });

      expect(res.status).toBe(200);
      expect(res.body.step).toBe('build');
    });
  });

  describe('POST /generate', () => {
    test('returns 400 for agentic mode without files', async () => {
      const res = await request(app)
        .post('/generate')
        .set('x-mode', 'agentic')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Structured files array required');
    });

    test('generates docs in agentic mode', async () => {
      const res = await request(app)
        .post('/generate')
        .set('x-mode', 'agentic')
        .send({
          files: [{ path: 'app.js', content: 'code' }],
          repoName: 'test-repo'
        });

      expect(res.status).toBe(200);
      expect(res.body.step).toBe('generate');
      expect(res.body.mode).toBe('agentic');
      expect(res.body.documentation).toBe('# Generated Docs');
    });

    test('returns 400 for classic chunks mode without session', async () => {
      const res = await request(app)
        .post('/generate')
        .send({
          chunks: [{ chunkIndex: 0, messages: [{ role: 'user', content: 'test' }], fileCount: 1 }],
          sessionId: 'nonexistent'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Session expired');
    });

    test('generates docs in classic chunks mode with valid session', async () => {
      const mockSession = {
        reintegrate: jest.fn().mockImplementation(doc => `reintegrated: ${doc}`),
      };
      sessionStore.get.mockReturnValue(mockSession);

      llmService.generate.mockResolvedValue('chunk content');

      const res = await request(app)
        .post('/generate')
        .send({
          chunks: [{ chunkIndex: 0, messages: [{ role: 'user', content: 'test' }], fileCount: 1 }],
          sessionId: 'valid-session'
        });

      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('classic');
      expect(res.body.documentation).toContain('reintegrated');
    });

    test('returns 400 for legacy mode without messages', async () => {
      const res = await request(app)
        .post('/generate')
        .send({});

      expect(res.status).toBe(400);
    });

    test('generates docs in legacy messages mode', async () => {
      llmService.generate.mockResolvedValue('legacy doc content');
      const mockReintegrate = jest.fn().mockImplementation(doc => doc);
      jest.spyOn(sessionStore, 'create').mockReturnValue('legacy-session');

      const res = await request(app)
        .post('/generate')
        .send({
          messages: [{ role: 'user', content: 'write docs' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('classic');
      expect(res.body.documentation).toBeDefined();
      expect(res.body.warning).toContain('Legacy');
    });

    test('validates chunk messages structure', async () => {
      const res = await request(app)
        .post('/generate')
        .send({
          chunks: [{ chunkIndex: 0, messages: [{ role: 'user' }], fileCount: 1 }],
          sessionId: 'valid-session'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Each chunk must have messages');
    });

    test('validates legacy messages structure', async () => {
      const res = await request(app)
        .post('/generate')
        .send({
          messages: [{ role: 'user' }]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Each message must have');
    });
  });

  describe('POST /rules (add)', () => {
    test('adds a new rule', async () => {
      const res = await request(app)
        .post('/rules')
        .send({ name: 'custom_rule', pattern: 'secret', flags: 'gi' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Rule added');
      expect(res.body.rule).toHaveProperty('id');
      expect(res.body.rule.name).toBe('custom_rule');
    });

    test('returns 400 on error', async () => {
      const res = await request(app)
        .post('/rules')
        .send({ pattern: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /rules/:id', () => {
    test('removes a rule', async () => {
      const addRes = await request(app)
        .post('/rules')
        .send({ name: 'delete_test', pattern: 'test', flags: 'gi' });

      const ruleId = addRes.body.rule.id;

      const res = await request(app)
        .delete(`/rules/${ruleId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Rule removed');
    });
  });
});
