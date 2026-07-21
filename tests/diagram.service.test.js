const diagramService = require('../src/services/diagram.service');

describe('DiagramService', () => {
  const makeFile = (path, content = '') => ({ path, content });

  describe('_shouldSkip', () => {
    test('skips node_modules paths', () => {
      expect(diagramService._shouldSkip('node_modules/express/index.js')).toBe(true);
    });

    test('skips dist paths', () => {
      expect(diagramService._shouldSkip('some/dist/bundle.js')).toBe(true);
    });

    test('skips build paths', () => {
      expect(diagramService._shouldSkip('some/build/output.js')).toBe(true);
    });

    test('skips .git paths', () => {
      expect(diagramService._shouldSkip('some/.git/config')).toBe(true);
    });

    test('skips coverage paths', () => {
      expect(diagramService._shouldSkip('some/coverage/lcov.info')).toBe(true);
    });

    test('skips lock files', () => {
      expect(diagramService._shouldSkip('yarn.lock')).toBe(true);
    });

    test('skips map files', () => {
      expect(diagramService._shouldSkip('src/bundle.js.map')).toBe(true);
    });

    test('skips minified files', () => {
      expect(diagramService._shouldSkip('src/app.min.js')).toBe(true);
    });

    test('allows normal source files', () => {
      expect(diagramService._shouldSkip('src/app.js')).toBe(false);
      expect(diagramService._shouldSkip('src/controllers/user.controller.ts')).toBe(false);
    });
  });

  describe('_patterns', () => {
    test('returns CLASS patterns by default', () => {
      const patterns = diagramService._patterns('CLASS');
      expect(patterns.primary).toContain('entity');
      expect(patterns.primary).toContain('model');
      expect(patterns.secondary).toContain('interface');
      expect(patterns.secondary).not.toContain('service');
    });

    test('returns COMPONENT patterns', () => {
      const patterns = diagramService._patterns('COMPONENT');
      expect(patterns.primary).toContain('component');
      expect(patterns.primary).toContain('screen');
      expect(patterns.secondary).toContain('hook');
    });

    test('returns PIPELINE patterns', () => {
      const patterns = diagramService._patterns('PIPELINE');
      expect(patterns.primary).toContain('deploy');
      expect(patterns.primary).toContain('dockerfile');
      expect(patterns.secondary).toContain('terraform');
    });

    test('falls back to CLASS for unknown type', () => {
      const patterns = diagramService._patterns('UNKNOWN');
      expect(patterns.primary).toContain('entity');
      expect(patterns.secondary).toContain('interface');
    });
  });

  describe('_contentScore', () => {
    test('scores CLASS signals for class definitions', () => {
      const content = 'class UserController {\n  constructor() {}\n}';
      const score = diagramService._contentScore(content, 'CLASS');
      expect(score).toBeGreaterThan(0);
    });

    test('scores COMPONENT signals for React hooks', () => {
      const content = 'function App() {\n  const [state, setState] = useState();\n}';
      const score = diagramService._contentScore(content, 'COMPONENT');
      expect(score).toBeGreaterThan(0);
    });

    test('scores PIPELINE signals for workflow keywords', () => {
      const content = 'jobs:\n  build:\n    steps:\n      - run: npm test';
      const score = diagramService._contentScore(content, 'PIPELINE');
      expect(score).toBeGreaterThan(0);
    });

    test('returns 0 for empty content', () => {
      expect(diagramService._contentScore('', 'CLASS')).toBe(0);
    });

    test('returns 0 for content with no signals', () => {
      expect(diagramService._contentScore('just some random text', 'CLASS')).toBe(0);
    });
  });

  describe('_score', () => {
    test('returns 0 for skipped paths', () => {
      expect(diagramService._score('node_modules/test.js', '', 'CLASS')).toBe(0);
    });

    test('gives high score to entry points', () => {
      const score = diagramService._score('src/app.js', '', 'CLASS');
      expect(score).toBeGreaterThanOrEqual(18);
      expect(score).toBeLessThanOrEqual(25);
    });

    test('gives 0 for controller paths in CLASS diagram', () => {
      const score = diagramService._score('src/controllers/user.controller.js', '', 'CLASS');
      expect(score).toBe(0);
    });

    test('penalizes test files', () => {
      const normal = diagramService._score('src/app.js', '', 'CLASS');
      const testScore = diagramService._score('src/app.test.js', '', 'CLASS');
      expect(testScore).toBeLessThan(normal);
    });

    test('does not return negative scores', () => {
      const score = diagramService._score('src/deeply/nested/helpers/test/something.test.js', '', 'CLASS');
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('filterHighSignalFiles', () => {
    test('returns top 8 scored files', () => {
      const files = [
        makeFile('src/app.js', 'class App {}'),
        makeFile('src/controllers/user.controller.js', 'class UserController {}'),
        makeFile('src/services/user.service.js', 'class UserService {}'),
        makeFile('README.md'),
        makeFile('node_modules/express/index.js'),
        makeFile('dist/bundle.js'),
        makeFile('src/models/user.model.js', 'class UserModel {}'),
        makeFile('src/middleware/auth.middleware.js', 'function auth() {}'),
        makeFile('src/config/database.js', 'module.exports = {}'),
        makeFile('src/utils/helper.js'),
      ];

      const result = diagramService.filterHighSignalFiles(files, 'CLASS');
      expect(result.length).toBeLessThanOrEqual(8);
      result.forEach(f => expect(f.score).toBeGreaterThan(0));
      expect(result.some(f => f.path === 'node_modules/express/index.js')).toBe(false);
      expect(result.some(f => f.path === 'dist/bundle.js')).toBe(false);
    });

    test('returns empty array for all skipped files', () => {
      const files = [
        makeFile('node_modules/test.js'),
        makeFile('dist/bundle.js'),
      ];
      const result = diagramService.filterHighSignalFiles(files, 'CLASS');
      expect(result).toEqual([]);
    });

    test('sorts by score descending, only entity files', () => {
      const files = [
        makeFile('src/model/Animal.java', 'class Animal {}'),
        makeFile('src/model/Pet.java', 'class Pet extends Animal {}'),
      ];
      const result = diagramService.filterHighSignalFiles(files, 'CLASS');
      expect(result).toHaveLength(2);
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    });
  });
});
