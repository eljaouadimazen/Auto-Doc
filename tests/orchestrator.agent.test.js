const Orchestrator = require('../src/agents/orchestrator.agent');

describe('Orchestrator', () => {
  let orchestrator;

  const makeFile = (path, content) => ({
    path,
    content: content || 'some valid content that exceeds the minimum length'
  });

  beforeAll(() => {
    orchestrator = new Orchestrator();
  });

  describe('filterHighSignalFiles', () => {
    test('filters out node_modules, dist, and build files', () => {
      const files = [
        makeFile('src/app.js'),
        makeFile('node_modules/express/index.js'),
        makeFile('some/dist/bundle.js'),
        makeFile('some/build/output.js'),
        makeFile('.git/config'),
      ];
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/app.js');
    });

    test('only keeps files with critical extensions', () => {
      const files = [
        makeFile('src/app.js'),
        makeFile('src/styles.css'),
        makeFile('README.md'),
        makeFile('src/utils/helper.ts'),
        makeFile('src/main.py'),
        makeFile('src/Dockerfile'),
      ];
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result).toHaveLength(3);
      expect(result.map(f => f.path)).toEqual(
        expect.arrayContaining(['src/app.js', 'src/utils/helper.ts', 'src/main.py'])
      );
    });

    test('filters out files below minimum content length', () => {
      const files = [
        makeFile('src/app.js', 'short'),
        makeFile('src/utils.js', 'x'.repeat(50)),
      ];
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/utils.js');
    });

    test('sorts by priority and limits to 25', () => {
      const files = Array.from({ length: 30 }, (_, i) => ({
        path: `src/file${i}.js`,
        content: 'x'.repeat(100),
      }));
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result).toHaveLength(25);
    });

    test('prioritizes app.js and main files first', () => {
      const files = [
        makeFile('src/utils/helper.js'),
        makeFile('src/app.js'),
        makeFile('src/main.ts'),
      ];
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result[0].path).toMatch(/app\.js/);
      expect(result[1].path).toMatch(/main\.ts/);
    });

    test('handles empty input', () => {
      expect(orchestrator.filterHighSignalFiles([])).toEqual([]);
    });

    test('handles files with no content', () => {
      const files = [
        { path: 'src/app.js' },
        { path: 'src/utils.js', content: '' },
      ];
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result).toHaveLength(0);
    });
  });

  describe('fileScore', () => {
    test('returns 0 for app.js', () => {
      expect(orchestrator.fileScore('src/app.js')).toBe(0);
    });

    test('returns 0 for app.ts', () => {
      expect(orchestrator.fileScore('src/app.ts')).toBe(0);
    });

    test('returns 0 for app.py', () => {
      expect(orchestrator.fileScore('app.py')).toBe(0);
    });

    test('returns 0 for main.java', () => {
      expect(orchestrator.fileScore('src/main/java/com/example/Main.java')).toBe(0);
    });

    test('returns 2 for controller files', () => {
      expect(orchestrator.fileScore('src/controllers/user.controller.js')).toBe(2);
      expect(orchestrator.fileScore('src/controllers/AuthController.ts')).toBe(2);
    });

    test('returns 3 for service files', () => {
      expect(orchestrator.fileScore('src/services/user.service.js')).toBe(3);
      expect(orchestrator.fileScore('src/services/AuthService.ts')).toBe(3);
    });

    test('returns 7 for other files', () => {
      expect(orchestrator.fileScore('src/utils/helper.js')).toBe(7);
      expect(orchestrator.fileScore('src/middleware/auth.middleware.ts')).toBe(7);
      expect(orchestrator.fileScore('src/config/database.js')).toBe(7);
    });
  });

  describe('inferFileType', () => {
    test('detects controller paths', () => {
      expect(orchestrator.inferFileType('src/controllers/user.controller.js')).toBe('controller');
      expect(orchestrator.inferFileType('controllers/AuthController.ts')).toBe('controller');
    });

    test('detects service paths', () => {
      expect(orchestrator.inferFileType('src/services/user.service.js')).toBe('service');
      expect(orchestrator.inferFileType('services/AuthService.ts')).toBe('service');
    });

    test('detects repository paths', () => {
      expect(orchestrator.inferFileType('src/repositories/user.repository.js')).toBe('repository');
      expect(orchestrator.inferFileType('repos/UserRepo.ts')).toBe('repository');
    });

    test('returns source for other paths', () => {
      expect(orchestrator.inferFileType('src/utils/helper.js')).toBe('source');
      expect(orchestrator.inferFileType('src/app.ts')).toBe('source');
      expect(orchestrator.inferFileType('src/middleware/auth.js')).toBe('source');
    });
  });

  describe('execute', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    const validFiles = [
      { path: 'src/app.js', content: 'const express = require("express");\nconst app = express();\napp.listen(3000);' },
      { path: 'src/controllers/user.controller.js', content: 'class UserController { constructor() { this.name = "User"; } }' },
    ];

    function makeMockOrchestrator() {
      const orch = new Orchestrator({ session: null });

      orch.analyzer.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { projectNature: 'BACKEND', logicSignals: ['express'], hasExecutableCode: true }
      });

      orch.templateSelector.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { templateId: 'FULL_SOFTWARE', diagramType: 'CLASS' }
      });

      orch.diagramAgent.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: 'classDiagram\nClassA --> ClassB'
      });

      orch.codeAgent.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { path: 'src/app.js', type: 'source', purpose: 'Main app file' }
      });

      orch.writer.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { documentation: '# Generated Docs', sections: 6 }
      });

      orch.onProgress = jest.fn();
      return orch;
    }

    test('executes full pipeline and returns AnalysisComplete', async () => {
      const orch = makeMockOrchestrator();

      const result = await orch.execute({
        input: { files: validFiles, provider: 'groq' },
        context: { repository: 'test-repo', apiKey: 'key' }
      });

      expect(result.step).toBe('AnalysisComplete');
      expect(result.projectNature).toBe('BACKEND');
      expect(result.selectedTemplate).toBe('FULL_SOFTWARE');
      expect(result.documentation).toBe('# Generated Docs');
      expect(result.architectureDiagram).toBe('classDiagram\nClassA --> ClassB');
      expect(result.stats.diagramGenerated).toBe(true);
      expect(result.stats.filesAnalyzed).toBe(2);
    });

    test('throws when RepoAnalyzer fails', async () => {
      const orch = makeMockOrchestrator();
      orch.analyzer.run = jest.fn().mockResolvedValue({
        status: 'failed',
        error: 'Analysis failed'
      });

      await expect(orch.execute({
        input: { files: validFiles, provider: 'groq' },
        context: { repository: 'test-repo', apiKey: 'key' }
      })).rejects.toThrow('RepoAnalyzer failed');
    });

    test('throws when TemplateSelector fails', async () => {
      const orch = makeMockOrchestrator();
      orch.templateSelector.run = jest.fn().mockResolvedValue({
        status: 'failed',
        error: 'Selection failed'
      });

      await expect(orch.execute({
        input: { files: validFiles, provider: 'groq' },
        context: { repository: 'test-repo', apiKey: 'key' }
      })).rejects.toThrow('TemplateSelector failed');
    });

    test('throws when WriterAgent fails', async () => {
      const orch = makeMockOrchestrator();
      orch.writer.run = jest.fn().mockResolvedValue({
        status: 'failed',
        error: 'Write failed'
      });

      await expect(orch.execute({
        input: { files: validFiles, provider: 'groq' },
        context: { repository: 'test-repo', apiKey: 'key' }
      })).rejects.toThrow('WriterAgent failed');
    });

    test('skips diagram and code intel when no executable code', async () => {
      const orch = makeMockOrchestrator();
      orch.analyzer.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { projectNature: 'RESOURCE_LIST', logicSignals: [], hasExecutableCode: false }
      });
      orch.templateSelector.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { templateId: 'RESOURCE_LIST', diagramType: 'NONE' }
      });

      const result = await orch.execute({
        input: { files: validFiles, provider: 'groq' },
        context: { repository: 'test-repo', apiKey: 'key' }
      });

      expect(result.architectureDiagram).toBeNull();
      expect(result.stats.diagramGenerated).toBe(false);
      expect(result.stats.filesAnalyzed).toBe(0);
    });

    test('calls onProgress for each stage', async () => {
      const orch = makeMockOrchestrator();
      const onProgress = jest.fn();
      orch.onProgress = onProgress;

      await orch.execute({
        input: { files: validFiles, provider: 'groq' },
        context: { repository: 'test-repo', apiKey: 'key' }
      });

      expect(onProgress).toHaveBeenCalledTimes(7);
      expect(onProgress).toHaveBeenCalledWith({ stage: 1, message: expect.any(String) });
      expect(onProgress).toHaveBeenCalledWith({ stage: 6, message: 'Documentation generated' });
    });
  });

  describe('runSecurityGate', () => {
    test('passes all files through (Layer 1 handles sanitization)', async () => {
      const orch = new Orchestrator();
      const files = [
        { path: 'src/app.js', content: 'some content' },
        { path: 'src/config.js', content: 'more content' }
      ];
      const result = await orch.runSecurityGate(files);
      expect(result).toEqual(files);
    });
  });

  describe('runCodeIntelligence', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('returns analysis for all files when code agent succeeds', async () => {
      const orch = new Orchestrator();
      orch.codeAgent.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { path: 'src/app.js', type: 'source', purpose: 'App' }
      });

      const result = await orch.runCodeIntelligence(
        [{ path: 'src/app.js', content: 'code here' }],
        {},
        null
      );

      expect(result).toHaveLength(1);
      expect(result[0].purpose).toBe('App');
    });

    test('falls back to inferFileType when code agent fails', async () => {
      const orch = new Orchestrator();
      orch.codeAgent.run = jest.fn().mockRejectedValue(new Error('LLM error'));

      const result = await orch.runCodeIntelligence(
        [{ path: 'src/app.js', content: 'const x = 1;' }],
        {},
        null
      );

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/app.js');
      expect(result[0].type).toBe('source');
      expect(result[0].snippet).toBeDefined();
    });
  });
});
