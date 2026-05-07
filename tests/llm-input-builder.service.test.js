const llmInputBuilder = require('../src/services/llm-input-builder.service');

describe('LLMInputBuilder', () => {
  describe('getExtension', () => {
    test('returns extension from file path', () => {
      expect(llmInputBuilder.getExtension('src/app.js')).toBe('.js');
      expect(llmInputBuilder.getExtension('src/style.css')).toBe('.css');
    });

    test('returns empty string for files without extension', () => {
      expect(llmInputBuilder.getExtension('Dockerfile')).toBe('');
      expect(llmInputBuilder.getExtension('src/README')).toBe('');
    });

    test('is lowercase', () => {
      expect(llmInputBuilder.getExtension('src/App.TS')).toBe('.ts');
    });
  });

  describe('extractRepoName', () => {
    test('extracts repo name from markdown heading', () => {
      const md = '# my-repo\n## File: src/app.js\n<<<CONTENT>>>\ncode\n<<<END>>>';
      expect(llmInputBuilder.extractRepoName(md)).toBe('my-repo');
    });

    test('returns unknown-repo when no heading found', () => {
      expect(llmInputBuilder.extractRepoName('no heading here')).toBe('unknown-repo');
    });
  });

  describe('parseMarkdown', () => {
    const validBlock = '## File: src/app.js\n<<<CONTENT>>>\nconst x = 1;\n<<<END>>>';

    test('parses a single file block', () => {
      const result = llmInputBuilder.parseMarkdown(validBlock);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/app.js');
      expect(result.files[0].content).toBe('const x = 1;');
      expect(result.files[0].extension).toBe('.js');
      expect(result.files[0].hash).toBeDefined();
    });

    test('parses multiple file blocks', () => {
      const md = [
        '# my-repo',
        validBlock,
        '## File: src/utils/helper.js\n<<<CONTENT>>>\nfunction help() {}\n<<<END>>>'
      ].join('\n\n');

      const result = llmInputBuilder.parseMarkdown(md);
      expect(result.files).toHaveLength(2);
      expect(result.repository).toBe('my-repo');
    });

    test('handles content with special characters', () => {
      const md = '## File: .env\n<<<CONTENT>>>\nPASSWORD=secret!@#$%^&*()\n<<<END>>>';
      const result = llmInputBuilder.parseMarkdown(md);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toContain('secret!@#$%^&*()');
    });

    test('returns empty files array for no matches', () => {
      const result = llmInputBuilder.parseMarkdown('just some text');
      expect(result.files).toEqual([]);
    });

    test('handles empty content blocks', () => {
      const md = '## File: empty.js\n<<<CONTENT>>>\n\n<<<END>>>';
      const result = llmInputBuilder.parseMarkdown(md);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toBe('');
    });
  });

  describe('filterFiles', () => {
    const parsed = {
      repository: 'test',
      files: [
        { path: 'src/app.js', content: 'code', size: 4, extension: '.js' },
        { path: 'node_modules/test/index.js', content: 'code', size: 4, extension: '.js' },
        { path: 'image.png', content: 'data', size: 4, extension: '.png' },
        { path: 'empty.js', content: '', size: 0, extension: '.js' },
      ]
    };

    test('removes ignored extensions', () => {
      const result = llmInputBuilder.filterFiles(parsed);
      expect(result.files.some(f => f.path === 'image.png')).toBe(false);
    });

    test('removes node_modules paths', () => {
      const result = llmInputBuilder.filterFiles(parsed);
      expect(result.files.some(f => f.path === 'node_modules/test/index.js')).toBe(false);
    });

    test('removes empty files', () => {
      const result = llmInputBuilder.filterFiles(parsed);
      expect(result.files.some(f => f.path === 'empty.js')).toBe(false);
    });

    test('keeps valid files', () => {
      const result = llmInputBuilder.filterFiles(parsed);
      expect(result.files.some(f => f.path === 'src/app.js')).toBe(true);
    });
  });

  describe('applyTokenBudget', () => {
    test('truncates files exceeding max chars', () => {
      const content = 'a'.repeat(5000);
      const parsed = {
        repository: 'test',
        files: [{ path: 'big.js', content, extension: '.js', filename: 'big.js' }]
      };
      const result = llmInputBuilder.applyTokenBudget(parsed);
      expect(result.files[0].content.length).toBeLessThan(5000);
      expect(result.files[0].content).toContain('FILE TRUNCATED');
    });

    test('keeps small files unchanged', () => {
      const content = 'small file';
      const parsed = {
        repository: 'test',
        files: [{ path: 'small.js', content, extension: '.js', filename: 'small.js' }]
      };
      const result = llmInputBuilder.applyTokenBudget(parsed);
      expect(result.files[0].content).toBe('small file');
    });

    test('prioritizes README and package.json files first', () => {
      const parsed = {
        repository: 'test',
        files: [
          { path: 'src/app.js', content: 'app', extension: '.js', filename: 'app.js' },
          { path: 'README.md', content: '# readme', extension: '.md', filename: 'README.md' },
          { path: 'package.json', content: '{}', extension: '.json', filename: 'package.json' },
        ]
      };
      const result = llmInputBuilder.applyTokenBudget(parsed);
      expect(result.files[0].filename).toBe('README.md');
      expect(result.files[1].filename).toBe('package.json');
    });
  });

  describe('addMetadata', () => {
    test('adds metadata fields to parsed content', () => {
      const parsed = { repository: 'test', files: [], stats: { mode: 'raw' } };
      const result = llmInputBuilder.addMetadata(parsed, {});
      expect(result.metadata).toBeDefined();
      expect(result.metadata.timestamp).toBeDefined();
      expect(result.metadata.source).toBe('github');
      expect(result.metadata.schemaVersion).toBe('2.0');
    });
  });

  describe('createChunks', () => {
    test('creates single chunk when content fits', () => {
      const parsed = {
        files: [
          { summary: 'small content' },
          { summary: 'more content' },
        ]
      };
      const chunks = llmInputBuilder.createChunks(parsed);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].files).toHaveLength(2);
    });

    test('splits into multiple chunks when content exceeds limit', () => {
      const bigContent = 'x'.repeat(6000);
      const parsed = {
        files: [
          { summary: bigContent },
          { summary: bigContent },
          { summary: bigContent },
        ]
      };
      const chunks = llmInputBuilder.createChunks(parsed);
      expect(chunks.length).toBeGreaterThan(1);
    });

    test('marks last chunk as oversized when it exceeds capacity', () => {
      const bigContent = 'x'.repeat(9000);
      const parsed = {
        files: [
          { summary: bigContent },
        ]
      };
      const chunks = llmInputBuilder.createChunks(parsed);
      expect(chunks[0].oversized).toBe(true);
    });
  });

  describe('formatChunksForLLM_raw', () => {
    test('generates prompt structure for each chunk', () => {
      const parsed = { repository: 'test', stats: { mode: 'raw' } };
      const chunks = [{ files: [{ path: 'a.js', content: 'x', size: 1 }], totalChars: 1 }];
      const result = llmInputBuilder.formatChunksForLLM_raw(chunks, parsed);
      expect(result).toHaveLength(1);
      expect(result[0].messages).toHaveLength(1);
      expect(result[0].messages[0].role).toBe('user');
      expect(result[0].messages[0].content).toContain('test');
    });
  });
});
