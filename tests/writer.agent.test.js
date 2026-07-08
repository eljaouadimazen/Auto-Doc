const WriterAgent = require('../src/agents/writer.agent');

describe('WriterAgent', () => {
  let agent;

  beforeAll(() => {
    agent = new WriterAgent();
  });

  describe('buildModuleSummary', () => {
    test('formats with full analysis fields', () => {
      const analyses = [{
        path: 'src/controllers/user.controller.js',
        type: 'controller',
        purpose: 'Handles user CRUD operations',
        responsibilities: ['create user', 'delete user', 'list users'],
        dependencies: ['UserService', 'UserRepository'],
        routes: [{ method: 'GET', path: '/users' }, { method: 'POST', path: '/users' }],
        complexity: 'medium',
      }];
      const summary = agent.buildModuleSummary(analyses);
      expect(summary).toContain('src/controllers/user.controller.js');
      expect(summary).toContain('Handles user CRUD operations');
      expect(summary).toContain('create user, delete user, list users');
      expect(summary).toContain('UserService, UserRepository');
      expect(summary).toContain('GET /users');
      expect(summary).toContain('POST /users');
    });

    test('falls back to snippet when no analysis fields', () => {
      const analyses = [{
        path: 'src/utils/helper.js',
        type: 'utility',
        snippet: 'function helper() { return true; }',
      }];
      const summary = agent.buildModuleSummary(analyses);
      expect(summary).toContain('src/utils/helper.js');
      expect(summary).toContain('function helper()');
    });

    test('handles empty file list', () => {
      expect(agent.buildModuleSummary([])).toBe('');
    });

    test('handles file with no snippet and no analysis', () => {
      const analyses = [{ path: 'src/empty.js', type: 'source' }];
      const summary = agent.buildModuleSummary(analyses);
      expect(summary).toContain('src/empty.js');
      expect(summary).toContain('(no content)');
    });
  });

  describe('inferLayers', () => {
    test('categorizes files into correct layers', () => {
      const analyses = [
        { path: 'src/controllers/user.controller.js' },
        { path: 'src/services/user.service.js' },
        { path: 'src/repositories/user.repository.js' },
        { path: 'src/models/user.entity.js' },
        { path: 'src/config/database.config.js' },
        { path: 'src/app.js' },
      ];
      const layers = agent.inferLayers(analyses);
      expect(layers.controllers).toHaveLength(1);
      expect(layers.controllers[0]).toContain('user.controller');
      expect(layers.services).toHaveLength(1);
      expect(layers.services[0]).toContain('user.service');
      expect(layers.repositories).toHaveLength(1);
      expect(layers.repositories[0]).toContain('user.repository');
      expect(layers.models).toHaveLength(1);
      expect(layers.models[0]).toContain('user.entity');
      expect(layers.config).toHaveLength(1);
      expect(layers.config[0]).toContain('database.config');
      expect(layers.other).toHaveLength(1);
      expect(layers.other[0]).toContain('app.js');
    });

    test('handles empty file list', () => {
      const layers = agent.inferLayers([]);
      expect(layers.controllers).toEqual([]);
      expect(layers.services).toEqual([]);
      expect(layers.repositories).toEqual([]);
      expect(layers.models).toEqual([]);
      expect(layers.config).toEqual([]);
      expect(layers.other).toEqual([]);
    });
  });

  describe('writeFooter', () => {
    test('includes repository name and agent pipeline reference', () => {
      const footer = agent.writeFooter('my-awesome-repo', 'DEVELOPER');
      expect(footer).toContain('my-awesome-repo');
      expect(footer).toContain('Multi-Agent Pipeline');
    });
  });

  describe('execute', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('returns documentation for FULL_SOFTWARE strategy with all DEVELOPER sections', async () => {
      // DEVELOPER audience produces 13 sections (see getSections()) + the
      // footer = 14 parts. entities/error_handling/configuration/deployment/
      // dependencies are left unmocked deliberately — with no matching
      // evidence in fileAnalyses they deterministically return a hardcoded
      // "not detected" string without calling callLLM, so they don't need
      // mocking here. business_model and data_flow have no such fallback —
      // they always call callLLM — so those two must be mocked.
      jest.spyOn(agent, 'writeOverview').mockResolvedValue('# Overview');
      jest.spyOn(agent, 'writeArchitecture').mockResolvedValue('# Architecture');
      jest.spyOn(agent, 'writeAPIReference').mockResolvedValue('# API Reference');
      jest.spyOn(agent, 'writeSecuritySection').mockResolvedValue('# Security');
      jest.spyOn(agent, 'writeSetupUsage').mockResolvedValue('# Setup & Usage');
      jest.spyOn(agent, 'writeTechnicalModules').mockResolvedValue('# Technical Specifications');
      jest.spyOn(agent, 'writeBusinessModel').mockResolvedValue('# Business Context');
      jest.spyOn(agent, 'writeDataFlow').mockResolvedValue('# Data Flow');

      const result = await agent.execute({
        input: {
          projectNature: 'BACKEND',
          docStrategy: 'FULL_SOFTWARE',
          logicSignals: ['express', 'jwt'],
          fileAnalyses: [{ path: 'app.js', purpose: 'Main', responsibilities: ['x'] }],
        },
        context: { repository: 'test-repo' }
      });

      expect(result.documentation).toContain('# Overview');
      expect(result.documentation).toContain('# Architecture');
      expect(result.documentation).toContain('# API Reference');
      expect(result.documentation).toContain('# Security');
      expect(result.documentation).toContain('# Setup & Usage');
      expect(result.documentation).toContain('# Technical Specifications');
      expect(result.documentation).toContain('# Business Context');
      expect(result.documentation).toContain('# Data Flow');
      expect(result.documentation).toContain('Multi-Agent Pipeline');
      expect(result.sections).toBe(14);
    });

    test('returns RESOURCE_LIST documentation with 3 sections', async () => {
      jest.spyOn(agent, 'writeResourceDoc').mockResolvedValue('# Resources');

      const result = await agent.execute({
        input: {
          docStrategy: 'RESOURCE_LIST',
          fileAnalyses: [{ path: 'README.md' }],
        },
        context: { repository: 'docs-repo' }
      });

      expect(result.documentation).toContain('# Resources');
      expect(result.sections).toBe(3);
    });

    test('includes architecture diagram when provided', async () => {
      jest.spyOn(agent, 'writeOverview').mockResolvedValue('# Overview');
      jest.spyOn(agent, 'writeArchitecture').mockResolvedValue('# Architecture');
      jest.spyOn(agent, 'writeAPIReference').mockResolvedValue('# API Reference');
      jest.spyOn(agent, 'writeSecuritySection').mockResolvedValue('# Security');
      jest.spyOn(agent, 'writeSetupUsage').mockResolvedValue('# Setup & Usage');
      jest.spyOn(agent, 'writeTechnicalModules').mockResolvedValue('# Technical Specifications');
      jest.spyOn(agent, 'writeBusinessModel').mockResolvedValue('# Business Context');
      jest.spyOn(agent, 'writeDataFlow').mockResolvedValue('# Data Flow');

      const result = await agent.execute({
        input: {
          projectNature: 'BACKEND',
          docStrategy: 'FULL_SOFTWARE',
          logicSignals: [],
          fileAnalyses: [],
          architectureDiagram: 'classDiagram\nClassA --> ClassB',
        },
        context: { repository: 'test-repo' }
      });

      expect(result.documentation).toContain('# Architecture');
    });
  });

  describe('writeOverview', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('calls callLLM with overview prompt', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('## Project Overview\nMy project');
      const result = await agent.writeOverview('test-repo', 'BACKEND', ['express'], 'file summary');
      expect(result).toContain('Project Overview');
    });
  });

  describe('writeArchitecture', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('includes diagram in prompt when provided', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('## Architecture');
      const result = await agent.writeArchitecture(
        'BACKEND', ['express'], [{ path: 'app.js' }], 'classDiagram\nClassA --> ClassB'
      );
      expect(result).toContain('Architecture');
    });

    test('notes missing diagram when not provided', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('## Architecture\nNo diagram');
      const result = await agent.writeArchitecture('BACKEND', [], [], null);
      expect(result).toContain('Architecture');
    });
  });

  describe('writeAPIReference', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('returns hardcoded message when no routes or controllers', async () => {
      const result = await agent.writeAPIReference([], 'BACKEND');
      expect(result).toBe('## API Reference\n\n*No API routes could be detected.*');
    });

    test('calls callLLM when routes exist', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('## API Reference\nGET /users');
      const analyses = [{ routes: [{ method: 'GET', path: '/users', purpose: 'List users' }] }];
      const result = await agent.writeAPIReference(analyses, 'BACKEND');
      expect(result).toContain('API Reference');
    });

    test('calls callLLM when controllers exist but no routes', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('## API Reference\nFrom controllers');
      const analyses = [{ path: 'src/controllers/user.controller.js' }];
      const result = await agent.writeAPIReference(analyses, 'BACKEND');
      expect(result).toContain('API Reference');
    });
  });

  describe('writeSecuritySection', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('calls callLLM with security prompt', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('## Security\nJWT used');
      const result = await agent.writeSecuritySection([], ['jwt', 'auth'], [], 'BACKEND', 'DEVELOPER');
      expect(result).toContain('Security');
    });
  });

  describe('writeSetupUsage', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('calls callLLM with setup prompt', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('## Setup & Usage\nnpm install');
      const result = await agent.writeSetupUsage('test-repo', 'BACKEND', ['express'], []);
      expect(result).toContain('Setup');
    });
  });

  describe('writeTechnicalModules', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('calls callLLM with technical specs prompt', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('## Technical Specifications\nModules');
      const result = await agent.writeTechnicalModules('module summary', 'BACKEND', 'DEVELOPER');
      expect(result).toContain('Technical Specifications');
    });
  });

  describe('writeResourceDoc', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('calls callLLM with resource doc prompt', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('## Resources\nFiles list');
      const result = await agent.writeResourceDoc('docs-repo', [{ path: 'README.md' }]);
      expect(result).toContain('Resources');
    });
  });
});
