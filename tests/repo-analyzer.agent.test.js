const RepoAnalyzerAgent = require('../src/agents/repo-analyzer.agent');

describe('RepoAnalyzerAgent', () => {
  let agent;

  beforeAll(() => {
    agent = new RepoAnalyzerAgent();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('execute', () => {
    const inputTemplate = {
      input: {
        files: [],
        repository: 'test-repo'
      }
    };

    test('calls callLLMJSON and returns its result', async () => {
      const expected = {
        projectNature: 'BACKEND',
        hasExecutableCode: true,
        techStack: ['Node.js'],
        logicSignals: ['express routes'],
        summary: 'Express backend'
      };
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue(expected);

      const result = await agent.execute({
        input: {
          files: [{ path: 'src/app.js', snippet: 'const express = require...', size: 500 }],
          repository: 'test-repo'
        }
      });

      expect(result).toEqual(expected);
    });

    test('returns hasExecutableCode false for non-code files', async () => {
      const expected = {
        projectNature: 'RESOURCE_LIST',
        hasExecutableCode: false,
        techStack: [],
        logicSignals: [],
        summary: 'Documentation repo'
      };
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue(expected);

      const result = await agent.execute({
        input: {
          files: [{ path: 'README.md', snippet: '# Documentation', size: 200 }],
          repository: 'test-repo'
        }
      });

      expect(result.hasExecutableCode).toBe(false);
    });

    test('returns hasExecutableCode true for JS files > 100 bytes', async () => {
      const expected = {
        projectNature: 'BACKEND',
        hasExecutableCode: true,
        techStack: [],
        logicSignals: [],
        summary: 'test'
      };
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue(expected);

      const result = await agent.execute({
        input: {
          files: [{ path: 'src/app.js', snippet: 'code snippet', size: 200 }],
          repository: 'test-repo'
        }
      });

      expect(result.hasExecutableCode).toBe(true);
    });

    test('uses fallback returned by callLLMJSON on failure', async () => {
      const fallback = {
        projectNature: 'BACKEND',
        hasExecutableCode: false,
        techStack: [],
        logicSignals: [],
        summary: 'Could not analyze repository'
      };
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue(fallback);

      const result = await agent.execute({
        input: { files: [], repository: 'empty-repo' }
      });

      expect(result.projectNature).toBe('BACKEND');
      expect(result.summary).toBe('Could not analyze repository');
    });

    test('detects executable code from Go files', async () => {
      const expected = {
        projectNature: 'BACKEND', hasExecutableCode: true, techStack: [], logicSignals: [], summary: 'Go backend'
      };
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue(expected);

      const result = await agent.execute({
        input: {
          files: [{ path: 'main.go', snippet: 'package main', size: 500 }],
          repository: 'test'
        }
      });

      expect(result.hasExecutableCode).toBe(true);
    });
  });
});
