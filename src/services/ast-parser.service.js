/**
 * ast-parser.service.js
 * 
 * Extracts structured code intelligence from JS/TS and Python files.
 * Sits between github.service and llm-input-builder.service in the pipeline.
 * 
 * Output replaces raw file content with structured summaries,
 * dramatically reducing token usage while improving LLM output quality.
 */
const LOGIC_PATTERNS = {
  database:  /db\.|repository\.|prisma\.|mongoose\.|select\s+from|insert\s+into|update\s+|delete\s+from/i,
  security:  /bcrypt|argon2|jwt\.sign|jwt\.verify|crypto\.|password|hash|compare/i,
  network:   /fetch\(|axios\.|http\.|request\(|api\./i,
  validation: /validate|joi\.|zod\.|check\(|isEmail|isURL/i,
  fileSystem: /fs\.|path\.|readFile|writeFile|storage\./i,
  messaging: /emit\(|on\(|publish|subscribe|kafka|rabbitmq/i
};

class ASTParserService {
  constructor() {
    this.JS_EXTENSIONS  = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
    this.PY_EXTENSIONS  = ['.py'];
  }
  

  /**
   * Main entry — parse a list of files, return structured summaries
   * @param {Array} files - [{path, content, extension}]
   * @returns {Array} enriched files with `ast` field
   */
  parseFiles(files) {
    return files.map(file => {
      try {
        if (this.JS_EXTENSIONS.includes(file.extension)) {
          return { ...file, ast: this.parseJS(file.content, file.path) };
        }
        if (this.PY_EXTENSIONS.includes(file.extension)) {
          return { ...file, ast: this.parsePython(file.content, file.path) };
        }
        // Non-parseable file (config, markdown, etc.) — keep as-is
        return { ...file, ast: null };
      } catch (err) {
        console.warn(`[ast-parser] Failed to parse ${file.path}: ${err.message}`);
        return { ...file, ast: null };
      }
    });
  }

  // ─────────────────────────────────────────────
  // JS / TS PARSER (regex-based, no dependency)
  // ─────────────────────────────────────────────

  parseJS(content, filePath) {
    return {
      language: filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'TypeScript' : 'JavaScript',
      imports:        this.extractJSImports(content),
      exports:        this.extractJSExports(content),
      classes:        this.extractJSClasses(content),
      functions:      this.extractJSFunctions(content),
      jsdoc:          this.extractJSDoc(content),
      expressRoutes:  this.extractExpressRoutes(content),
      envAccess:      this.extractEnvAccess(content),
    };
  }

  extractJSImports(content) {
    const imports = [];

    // ES6: import X from 'y'  |  import { X } from 'y'  |  import * as X from 'y'
    const esRegex = /import\s+(?:([\w*{},\s]+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = esRegex.exec(content)) !== null) {
      imports.push({ type: 'es6', specifier: m[2], binding: m[1]?.trim() || null });
    }

    // CommonJS: require('x')  |  const x = require('x')
    const cjsRegex = /(?:const|let|var)\s+([\w{},\s]+)\s*=\s*require\(['"]([^'"]+)['"]\)/g;
    while ((m = cjsRegex.exec(content)) !== null) {
      imports.push({ type: 'cjs', specifier: m[2], binding: m[1]?.trim() || null });
    }

    return imports;
  }

  extractJSExports(content) {
    const exports = [];

    // export default ...
    const defaultMatch = content.match(/export\s+default\s+(class|function|async function)?\s*(\w+)?/);
    if (defaultMatch) {
      exports.push({ type: 'default', kind: defaultMatch[1] || 'value', name: defaultMatch[2] || 'anonymous' });
    }

    // export const/function/class X
    const namedRegex = /export\s+(const|let|var|function|async function|class)\s+(\w+)/g;
    let m;
    while ((m = namedRegex.exec(content)) !== null) {
      exports.push({ type: 'named', kind: m[1], name: m[2] });
    }

    // module.exports = ...
    if (/module\.exports\s*=/.test(content)) {
      const nameMatch = content.match(/module\.exports\s*=\s*(?:new\s+)?(\w+)/);
      exports.push({ type: 'cjs', name: nameMatch ? nameMatch[1] : 'unknown' });
    }

    return exports;
  }

  extractJSClasses(content) {
    const classes = [];
    // class Foo [extends Bar]
    const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
    let m;
    while ((m = classRegex.exec(content)) !== null) {
      const classStart = m.index;
      const classBody  = this.extractBlock(content, classStart);

      classes.push({
        name:    m[1],
        extends: m[2] || null,
        methods: this.extractJSMethods(classBody),
      });
    }
    return classes;
  }

  extractJSMethods(classBody) {
  const methods = [];
  const methodRegex = /(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[\w<>\[\]|]+)?\s*\{/g;
  const SKIP = new Set(['if', 'for', 'while', 'switch', 'catch', 'function']);
  
  let m;
  while ((m = methodRegex.exec(classBody)) !== null) {
    if (SKIP.has(m[1])) continue;
    
    // NOUVEAU : On extrait le corps de la méthode pour analyse
    const body = this.extractBlock(classBody, m.index); 
    
    methods.push({
      name:   m[1],
      params: m[2].trim() ? m[2].split(',').map(p => p.trim()) : [],
      async:  /async\s+/.test(classBody.slice(Math.max(0, m.index - 6), m.index + 1)),
      // AJOUT : Les signaux de logique détectés
      logicSignals: this.extractLogicSignals(body),
      // AJOUT : Un aperçu très court (3 lignes max) pour lever le flou
      preview: body.split('\n').slice(1, 4).map(l => l.trim()).join(' ') 
    });
  }
  return methods;
}

  extractJSFunctions(content) {
    const fns = [];

    // function foo(params) / async function foo(params)
    const declRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = declRegex.exec(content)) !== null) {
      fns.push({ name: m[1], params: m[2].trim() ? m[2].split(',').map(p => p.trim()) : [], style: 'declaration' });
    }

    // const foo = (params) => / const foo = async (params) =>
    const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
    while ((m = arrowRegex.exec(content)) !== null) {
      fns.push({ name: m[1], params: m[2].trim() ? m[2].split(',').map(p => p.trim()) : [], style: 'arrow' });
    }

    return fns;
  }

  extractJSDoc(content) {
    const docs = [];
    const jsdocRegex = /\/\*\*([\s\S]*?)\*\/\s*(?:(?:export\s+)?(?:async\s+)?(?:function|class|const|let)\s+(\w+))?/g;
    let m;
    while ((m = jsdocRegex.exec(content)) !== null) {
      const raw = m[1];
      docs.push({
        target:      m[2] || null,
        description: raw.match(/@?(?:^|\n)\s*\*\s*([^@\n*][^\n]*)/)?.[1]?.trim() || null,
        params:      [...raw.matchAll(/@param\s+\{?[\w|]+\}?\s+(\w+)\s+-?\s*(.*)/g)].map(p => ({ name: p[1], desc: p[2].trim() })),
        returns:     raw.match(/@returns?\s+\{?[\w|]+\}?\s*(.*)/)?.[1]?.trim() || null,
      });
    }
    return docs;
  }

  extractExpressRoutes(content) {
    const routes = [];
    // router.get('/path', ...) | app.post('/path', ...)
    const routeRegex = /(?:router|app)\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = routeRegex.exec(content)) !== null) {
      routes.push({ method: m[1].toUpperCase(), path: m[2] });
    }
    return routes;
  }

  extractEnvAccess(content) {
    const vars = new Set();
    const regex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
    let m;
    while ((m = regex.exec(content)) !== null) vars.add(m[1]);
    return [...vars];
  }

  // ─────────────────────────────────────────────
  // PYTHON PARSER (regex-based)
  // ─────────────────────────────────────────────

  parsePython(content, filePath) {
    return {
      language:  'Python',
      imports:   this.extractPythonImports(content),
      classes:   this.extractPythonClasses(content),
      functions: this.extractPythonFunctions(content),
      docstring: this.extractPythonModuleDocstring(content),
      envAccess: this.extractPythonEnvAccess(content),
    };
  }

  extractPythonImports(content) {
    const imports = [];

    // import x  |  import x as y
    const simpleRegex = /^import\s+([\w.,\s]+?)(?:\s+as\s+(\w+))?$/gm;
    let m;
    while ((m = simpleRegex.exec(content)) !== null) {
      imports.push({ type: 'import', module: m[1].trim(), alias: m[2] || null });
    }

    // from x import y  |  from x import y as z
    const fromRegex = /^from\s+([\w.]+)\s+import\s+([\w,\s*]+?)(?:\s+as\s+(\w+))?$/gm;
    while ((m = fromRegex.exec(content)) !== null) {
      imports.push({ type: 'from', module: m[1], names: m[2].split(',').map(n => n.trim()), alias: m[3] || null });
    }

    return imports;
  }

  extractPythonClasses(content) {
    const classes = [];
    // class Foo:  |  class Foo(Bar):
    const classRegex = /^class\s+(\w+)(?:\(([^)]*)\))?\s*:/gm;
    let m;
    while ((m = classRegex.exec(content)) !== null) {
      const afterClass = content.slice(m.index);
      classes.push({
        name:    m[1],
        extends: m[2] ? m[2].split(',').map(s => s.trim()) : [],
        methods: this.extractPythonMethods(afterClass),
        docstring: this.extractPythonDocstring(afterClass),
      });
    }
    return classes;
  }

  extractPythonMethods(classBody) {
    const methods = [];
    // def method(self, params):  |  async def method(self, params):
    const methodRegex = /^\s+(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*[\w\[\], |]+)?\s*:/gm;
    let m;
    while ((m = methodRegex.exec(classBody)) !== null) {
      const params = m[2].split(',').map(p => p.trim()).filter(p => p && p !== 'self');
      methods.push({
        name:   m[1],
        params,
        async:  /async\s+def/.test(classBody.slice(Math.max(0, m.index - 6), m.index + m[0].length)),
        private: m[1].startsWith('_'),
      });
    }
    return methods;
  }

  extractPythonFunctions(content) {
    const fns = [];
    // Top-level def (no leading spaces)
    const fnRegex = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*[\w\[\], |]+)?\s*:/gm;
    let m;
    while ((m = fnRegex.exec(content)) !== null) {
      fns.push({
        name:   m[1],
        params: m[2].split(',').map(p => p.trim()).filter(Boolean),
        async:  m[0].startsWith('async'),
      });
    }
    return fns;
  }

  extractPythonDocstring(body) {
    const m = body.match(/^\s*"""([\s\S]*?)"""/);
    return m ? m[1].trim() : null;
  }

  extractPythonModuleDocstring(content) {
    const m = content.match(/^"""([\s\S]*?)"""/);
    return m ? m[1].trim() : null;
  }

  extractPythonEnvAccess(content) {
    const vars = new Set();
    const patterns = [
      /os\.environ\.get\(['"]([^'"]+)['"]/g,
      /os\.environ\[['"]([^'"]+)['"]\]/g,
      /os\.getenv\(['"]([^'"]+)['"]/g,
    ];
    patterns.forEach(rx => {
      let m;
      while ((m = rx.exec(content)) !== null) vars.add(m[1]);
    });
    return [...vars];
  }

  // ─────────────────────────────────────────────
  // UTILITY
  // ─────────────────────────────────────────────

  /**
   * Extract a balanced {} block starting from a given index
   */
  extractBlock(content, startIdx) {
    const openIdx = content.indexOf('{', startIdx);
    if (openIdx === -1) return '';

    let depth = 0;
    for (let i = openIdx; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) return content.slice(openIdx, i + 1);
      }
    }
    return content.slice(openIdx);
  }

  /**
   * Convert AST result to a compact text summary for the LLM prompt
   * Much cheaper than sending raw code
   */
  toSummary(file) {
  if (!file.ast) return `### ${file.path}\n[Raw Content Truncated]`;

  const a = file.ast;
  const summary = {
    file: file.path,
    nature: a.language,
    deps: a.imports.map(i => i.specifier || i.module).slice(0, 5),
    routes: a.expressRoutes,
    logic: {
      classes: a.classes.map(c => ({
        name: c.name,
        methods: c.methods.map(m => ({
          sig: `${m.name}(${m.params.join(',')})`,
          tags: m.logicSignals,
          hint: m.preview.slice(0, 100) // Très court !
        }))
      })),
      functions: a.functions.map(f => ({
        name: f.name,
        tags: this.extractLogicSignals(file.content) // Scan simplifié pour fns
      }))
    },
    env: a.envAccess
  };

  return JSON.stringify(summary); // On renvoie du JSON pur, l'IA préfère ça.
}
}

module.exports = new ASTParserService();