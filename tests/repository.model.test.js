jest.mock('@octokit/rest');

const { Octokit } = require('@octokit/rest');
const Repository = require('../src/models/repository.model');

function base64(str) {
  return Buffer.from(str).toString('base64');
}

describe('Repository', () => {
  let mockGetContent;

  function setupOctokit(getContentImpl) {
    mockGetContent = jest.fn().mockImplementation(getContentImpl);
    Octokit.mockImplementation(() => ({
      repos: { getContent: mockGetContent },
    }));
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('parses GitHub URL and extracts owner and name', () => {
      const repo = new Repository('https://github.com/facebook/react');
      expect(repo.name).toBe('react');
      expect(repo.owner).toBe('facebook');
      expect(repo.url).toBe('https://github.com/facebook/react');
    });

    test('strips .git suffix from repo name', () => {
      const repo = new Repository('https://github.com/user/my-repo.git');
      expect(repo.name).toBe('my-repo');
    });

    test('throws on invalid GitHub URL', () => {
      expect(() => new Repository('https://gitlab.com/user/repo')).toThrow('Invalid GitHub URL');
      expect(() => new Repository('not-a-url')).toThrow('Invalid GitHub URL');
    });

    test('initializes with empty files and null documentation', () => {
      const repo = new Repository('https://github.com/user/repo');
      expect(repo.files).toEqual([]);
      expect(repo.documentation).toBeNull();
      expect(repo.auditLog).toBeDefined();
    });
  });

  describe('FetchFiles', () => {
    test('fetches files from GitHub recursively', async () => {
      setupOctokit(({ path }) => {
        if (path === '') {
          return { data: [
            { name: 'src', type: 'dir', path: 'src' },
            { name: 'README.md', type: 'file', path: 'README.md', size: 500 },
            { name: 'package.json', type: 'file', path: 'package.json', size: 200 },
          ]};
        }
        if (path === 'src') {
          return { data: [
            { name: 'index.js', type: 'file', path: 'src/index.js', size: 300 },
            { name: 'app.js', type: 'file', path: 'src/app.js', size: 1000 },
          ]};
        }
        return { data: { content: base64('file content here'), size: 16 } };
      });

      const repo = new Repository('https://github.com/user/test-repo');
      const files = await repo.FetchFiles();

      expect(files.length).toBeGreaterThan(0);
      files.forEach(f => {
        expect(f.path).toBeDefined();
        expect(f.content).toBeDefined();
        expect(f.extension).toBeDefined();
      });

      const paths = files.map(f => f.path);
      expect(paths).toContain('src/index.js');
      expect(paths).toContain('src/app.js');
      expect(paths).toContain('README.md');
      expect(paths).toContain('package.json');
    });

    test('skips node_modules and dist directories', async () => {
      setupOctokit(({ path }) => {
        if (path === '') {
          return { data: [
            { name: 'node_modules', type: 'dir', path: 'node_modules' },
            { name: 'dist', type: 'dir', path: 'dist' },
            { name: 'index.js', type: 'file', path: 'index.js', size: 50 },
          ]};
        }
        return { data: { content: base64('module.exports = {}'), size: 18 } };
      });

      const repo = new Repository('https://github.com/user/test-repo');
      const files = await repo.FetchFiles();

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('index.js');
    });

    test('skips files with disallowed extensions', async () => {
      setupOctokit(({ path }) => {
        if (path === '') {
          return { data: [
            { name: 'image.png', type: 'file', path: 'image.png', size: 50000 },
            { name: 'script.js', type: 'file', path: 'script.js', size: 100 },
          ]};
        }
        return { data: { content: base64('console.log("test")'), size: 18 } };
      });

      const repo = new Repository('https://github.com/user/test-repo');
      const files = await repo.FetchFiles();

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('script.js');
    });

    test('handles fetch errors gracefully', async () => {
      setupOctokit(() => { throw new Error('API error'); });

      const repo = new Repository('https://github.com/user/test-repo');
      const files = await repo.FetchFiles();

      expect(files).toEqual([]);
    });
  });

  describe('fromDTO', () => {
    test('reconstructs Repository from serialized data', () => {
      const serialized = [
        { path: 'src/app.js', content: 'console.log(1)', extension: '.js', size: 13, isSanitized: false },
        { path: 'src/utils.js', content: 'const x = 1', extension: '.js', size: 11, isSanitized: false },
      ];

      const repo = Repository.fromDTO('test-repo', serialized);
      expect(repo.name).toBe('test-repo');
      expect(repo.files).toHaveLength(2);
      expect(repo.files[0].path).toBe('src/app.js');
      expect(repo.files[1].content).toBe('const x = 1');
    });
  });
});
