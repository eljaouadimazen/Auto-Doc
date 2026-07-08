const EnforcedOrchestrator = require('../src/agents/orchestrator.agent');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('EnforcedOrchestrator', () => {
  let orchestrator;

  const makeFile = (path, content) => ({
    path,
    content: content || 'some valid content that exceeds the minimum length'
  });

  beforeAll(() => {
    orchestrator = new EnforcedOrchestrator();
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
        makeFile('README.md'),
        makeFile('image.png'),
        makeFile('data.json'),
      ];
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/app.js');
    });

    test('includes yaml and yml files as critical', () => {
      const files = [
        makeFile('deploy.yml'),
        makeFile('config.yaml'),
      ];
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result).toHaveLength(2);
    });

    test('filters out empty or tiny files', () => {
      const files = [
        makeFile('src/app.js', 'short'),
        makeFile('src/server.js', '   '),
        makeFile('src/utils.js', 'valid content here that is long enough'),
      ];
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/utils.js');
    });

    test('limits output to 25 files', () => {
      const files = Array.from({ length: 30 }, (_, i) => makeFile(`src/file${i}.js`));
      const result = orchestrator.filterHighSignalFiles(files);
      expect(result.length).toBeLessThanOrEqual(25);
    });

    test('sorts files by score placing app files first', () => {
      const files = [
        makeFile('src/service.js'),
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

    test('returns 0 for manifest files regardless of directory depth', () => {
      expect(orchestrator.fileScore('pom.xml')).toBe(0);
      expect(orchestrator.fileScore('build.gradle')).toBe(0);
      expect(orchestrator.fileScore('package.json')).toBe(0);
      expect(orchestrator.fileScore('requirements.txt')).toBe(0);
      expect(orchestrator.fileScore('go.mod')).toBe(0);
      expect(orchestrator.fileScore('Cargo.toml')).toBe(0);
    });

    test('returns 2 for repository/DAO files, same tier as controllers', () => {
      expect(orchestrator.fileScore('src/repositories/UserRepository.java')).toBe(2);
      expect(orchestrator.fileScore('src/dao/UserDao.java')).toBe(2);
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
      const orch = new EnforcedOrchestrator({ session: null });

      orch.analyzer.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { projectNature: 'BACKEND', logicSignals: ['express'], hasExecutableCode: true }
      });

      // Note: template selection is a deterministic selectTemplate() function,
      // not an agent — there's no templateSelector instance to mock. BACKEND
      // maps to { templateId: 'FULL_SOFTWARE', diagramType: 'CLASS' }.

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
      // selectTemplate('RESOURCE_LIST') deterministically resolves to
      // { templateId: 'RESOURCE_LIST', diagramType: 'NONE' } — no mock needed.

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

      // Not asserting an exact call count — runCodeIntelligence emits one
      // progress event per file on top of the per-stage events, so the total
      // scales with the file count rather than being a fixed number of stages.
      expect(onProgress).toHaveBeenCalledWith({ stage: 1, message: expect.any(String) });
      expect(onProgress).toHaveBeenCalledWith({ stage: 2, message: expect.any(String) });
      expect(onProgress).toHaveBeenCalledWith({ stage: 3, message: expect.any(String) });
      expect(onProgress).toHaveBeenCalledWith({ stage: 4, message: expect.any(String) });
      expect(onProgress).toHaveBeenCalledWith({ stage: 6, message: 'Documentation generated' });
    });
  });

  describe('runSecurityGate', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('returns all files as safe when no session', async () => {
      const orch = new EnforcedOrchestrator({ session: null });
      const result = await orch.runSecurityGate(
        [{ path: 'src/app.js', content: 'test' }],
        {},
        null
      );
      expect(result).toHaveLength(1);
    });

    test('returns all files as safe when session audit finds nothing', async () => {
      const mockSession = { audit: jest.fn().mockReturnValue([]) };
      const orch = new EnforcedOrchestrator({ session: mockSession });

      const result = await orch.runSecurityGate(
        [{ path: 'src/app.js', content: 'safe content' }],
        {},
        null
      );

      expect(result).toHaveLength(1);
      expect(mockSession.audit).toHaveBeenCalledWith('safe content');
    });

    test('runs security agent on flagged files', async () => {
      const mockSession = {
        audit: jest.fn().mockReturnValue([{ type: 'secret', name: 'api_key' }])
      };
      const orch = new EnforcedOrchestrator({ session: mockSession });
      orch.securityAgent.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { recommendation: 'safe_to_send' }
      });

      const result = await orch.runSecurityGate(
        [{ path: 'src/app.js', content: 'api_key=secret123' }],
        { repository: 'test-repo' },
        'test-key'
      );

      expect(result).toHaveLength(1);
      expect(orch.securityAgent.run).toHaveBeenCalled();
    });

    test('filters out files flagged as not safe', async () => {
      const mockSession = {
        audit: jest.fn().mockReturnValue([{ type: 'secret', name: 'api_key' }])
      };
      const orch = new EnforcedOrchestrator({ session: mockSession });
      orch.securityAgent.run = jest.fn().mockResolvedValue({
        status: 'success',
        result: { recommendation: 'reject' }
      });

      const result = await orch.runSecurityGate(
        [{ path: 'src/app.js', content: 'dangerous content' }],
        {},
        null
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('runCodeIntelligence', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('returns analysis for all files when code agent succeeds', async () => {
      const orch = new EnforcedOrchestrator();
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
      const orch = new EnforcedOrchestrator();
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

  describe('pruneNonCodeFiles', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('deletes PDFs and images but keeps code files', () => {
      fs.writeFileSync(path.join(tmpDir, 'Foo.java'), 'class Foo {}');
      fs.writeFileSync(path.join(tmpDir, 'rapport.pdf'), 'fake pdf');
      fs.writeFileSync(path.join(tmpDir, 'diagram.png'), 'fake image');

      orchestrator.pruneNonCodeFiles(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, 'Foo.java'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'rapport.pdf'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'diagram.png'))).toBe(false);
    });

    test('recurses into subdirectories', () => {
      const nested = path.join(tmpDir, 'src', 'main', 'resources');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'logo.svg'), 'fake svg');
      fs.writeFileSync(path.join(nested, 'App.java'), 'class App {}');

      orchestrator.pruneNonCodeFiles(tmpDir);

      expect(fs.existsSync(path.join(nested, 'logo.svg'))).toBe(false);
      expect(fs.existsSync(path.join(nested, 'App.java'))).toBe(true);
    });

    test('does not descend into .git', () => {
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'should-not-touch.pdf'), 'fake pdf');

      orchestrator.pruneNonCodeFiles(tmpDir);

      expect(fs.existsSync(path.join(gitDir, 'should-not-touch.pdf'))).toBe(true);
    });

    test('does not throw for a non-existent directory', () => {
      expect(() => orchestrator.pruneNonCodeFiles(path.join(tmpDir, 'missing'))).not.toThrow();
    });
  });
});
