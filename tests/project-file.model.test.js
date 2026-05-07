const ProjectFile = require('../src/models/project-file.model');

describe('ProjectFile', () => {
  describe('constructor and getters', () => {
    test('stores constructor args and sets defaults', () => {
      const pf = new ProjectFile('src/app.js', 'console.log("hi")', '.js', 20);
      expect(pf.path).toBe('src/app.js');
      expect(pf.content).toBe('console.log("hi")');
      expect(pf.extension).toBe('.js');
      expect(pf.size).toBe(20);
      expect(pf.isSanitized).toBe(false);
      expect(pf.astTree).toBeNull();
    });
  });

  describe('toJSON', () => {
    test('returns plain object with all fields', () => {
      const pf = new ProjectFile('src/app.js', 'content', '.js', 100);
      const json = pf.toJSON();
      expect(json).toEqual({
        path: 'src/app.js',
        content: 'content',
        extension: '.js',
        size: 100,
        isSanitized: false,
        astTree: null
      });
    });

    test('reflects sanitized state after sanitize call', () => {
      const pf = new ProjectFile('src/app.js', 'secret=123', '.js', 12);
      pf.Sanitize([]);
      expect(pf.isSanitized).toBe(true);
      expect(pf.toJSON().isSanitized).toBe(true);
    });
  });
});
