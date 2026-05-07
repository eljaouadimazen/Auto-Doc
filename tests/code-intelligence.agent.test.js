const CodeIntelligenceAgent = require('../src/agents/code-intelligence.agent');

describe('CodeIntelligenceAgent', () => {
  let agent;

  beforeAll(() => {
    agent = new CodeIntelligenceAgent();
  });

  describe('buildPrompt', () => {
    test('includes file path and content in prompt', () => {
      const prompt = agent.buildPrompt('/path/to/app.js', 'const x = 1;');
      expect(prompt).toContain('/path/to/app.js');
      expect(prompt).toContain('const x = 1;');
      expect(prompt).toContain('"path": "/path/to/app.js"');
    });
  });

  describe('normalize', () => {
    test('fills missing fields with defaults', () => {
      const result = agent.normalize({}, '/default/path.js');
      expect(result.path).toBe('/default/path.js');
      expect(result.language).toBe('Unknown');
      expect(result.purpose).toBe('Purpose unclear');
      expect(result.type).toBe('other');
      expect(result.responsibilities).toEqual([]);
      expect(result.classes).toEqual([]);
      expect(result.functions).toEqual([]);
      expect(result.dependencies).toEqual([]);
      expect(result.internalDependencies).toEqual([]);
      expect(result.routes).toEqual([]);
      expect(result.envVars).toEqual([]);
      expect(result.securityRelevant).toBe(false);
      expect(result.securityNotes).toBe('');
      expect(result.keyDecisions).toEqual([]);
      expect(result.complexity).toBe('medium');
      expect(result.summary).toBe('');
    });

    test('preserves provided fields over defaults', () => {
      const input = {
        path: '/custom/path.ts',
        language: 'TypeScript',
        purpose: 'Handles user authentication',
        type: 'service',
        responsibilities: ['login', 'register'],
        classes: [{ name: 'AuthService', role: 'Handles auth' }],
        functions: [{ name: 'hashPassword', purpose: 'Hash passwords', async: true }],
        dependencies: ['bcrypt'],
        routes: [{ method: 'POST', path: '/auth/login', purpose: 'Login' }],
        complexity: 'high',
      };
      const result = agent.normalize(input, '/default/path.js');
      expect(result.path).toBe('/custom/path.ts');
      expect(result.language).toBe('TypeScript');
      expect(result.purpose).toBe('Handles user authentication');
      expect(result.type).toBe('service');
      expect(result.responsibilities).toEqual(['login', 'register']);
      expect(result.classes).toHaveLength(1);
      expect(result.functions).toHaveLength(1);
      expect(result.dependencies).toEqual(['bcrypt']);
      expect(result.routes).toHaveLength(1);
      expect(result.complexity).toBe('high');
    });
  });

  describe('buildFallback', () => {
    test('returns fallback structure with given reason', () => {
      const result = agent.buildFallback('/path/file.js', 'file content here', 'Unsupported file type');
      expect(result.path).toBe('/path/file.js');
      expect(result.purpose).toBe('Unsupported file type');
      expect(result.type).toBe('other');
      expect(result.language).toBe('Unknown');
      expect(result.classes).toEqual([]);
      expect(result.functions).toEqual([]);
      expect(result.dependencies).toEqual([]);
      expect(result.routes).toEqual([]);
      expect(result.securityRelevant).toBe(false);
      expect(result.complexity).toBe('low');
      expect(result.summary).toBe('Unsupported file type');
    });
  });

  describe('execute', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('returns fallback for unsupported file extension', async () => {
      const result = await agent.execute({
        input: { path: '/path/file.md', content: 'some markdown content here' }
      });
      expect(result.purpose).toBe('Unsupported file type');
      expect(result.path).toBe('/path/file.md');
    });

    test('returns fallback for file that is too small', async () => {
      const result = await agent.execute({
        input: { path: '/path/app.js', content: 'tiny' }
      });
      expect(result.purpose).toBe('File too small');
    });

    test('calls callLLMJSON and normalizes result for valid file', async () => {
      const mockResult = {
        path: '/path/app.js',
        language: 'JavaScript',
        purpose: 'Main application file',
        type: 'controller',
        responsibilities: ['handle requests'],
        classes: [{ name: 'App', role: 'Main class' }],
        functions: [],
        dependencies: ['express'],
        internalDependencies: [],
        routes: [{ method: 'GET', path: '/', purpose: 'Root' }],
        envVars: [],
        securityRelevant: false,
        securityNotes: '',
        keyDecisions: [],
        complexity: 'medium',
        summary: 'Express app'
      };
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue(mockResult);

      const result = await agent.execute({
        input: { path: '/path/app.js', content: 'const express = require("express");\nconst app = express();\napp.listen(3000);' }
      });

      expect(result.path).toBe('/path/app.js');
      expect(result.language).toBe('JavaScript');
      expect(result.purpose).toBe('Main application file');
      expect(result.type).toBe('controller');
    });

    test('uses fallback when callLLMJSON returns invalid result', async () => {
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue({
        path: '/path/app.js',
        purpose: 'JSON parse failed',
      });

      const result = await agent.execute({
        input: { path: '/path/app.js', content: 'const x = 1;\nconst y = 2;\n' }
      });

      expect(result.purpose).toBe('JSON parse failed');
    });
  });
});
