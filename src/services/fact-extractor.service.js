const astParserService = require('./ast-parser.service');

const JAVA_STANDARD_TYPES = new Set([
  'String', 'Long', 'Integer', 'Double', 'Float', 'Boolean', 'Byte', 'Short', 'Character', 'Void',
  'List', 'Set', 'Map', 'Collection', 'ArrayList', 'HashMap', 'HashSet', 'LinkedList', 'TreeMap',
  'Object', 'Class', 'Optional', 'Stream', 'Iterable', 'Iterator', 'Comparable', 'Serializable',
  'BigDecimal', 'BigInteger',
  'LocalDate', 'LocalDateTime', 'LocalTime', 'ZonedDateTime', 'Date', 'Calendar',
  'Throwable', 'Exception', 'RuntimeException', 'Error',
  'Consumer', 'Supplier', 'Function', 'Predicate',
]);

function isProjectType(name) {
  return !JAVA_STANDARD_TYPES.has(name) && !/^(int|long|double|float|boolean|byte|short|char|void)$/i.test(name);
}

class FactExtractor {
  extract(safeFiles, diagramType, options = {}) {
    const { graphService, manifestDependencies, techStack, businessModel } = options;
    switch (diagramType) {
      case 'C4_CONTAINER':
        return this._extractC4Container(safeFiles, { graphService, manifestDependencies });
      case 'C4_CONTEXT':
        return this._extractC4Context(safeFiles, { techStack, businessModel, manifestDependencies });
      case 'CLASS':
        return this._extractClass(safeFiles, { graphService });
      case 'COMPONENT':
        return this._extractComponent(safeFiles, { graphService });
      case 'PIPELINE':
        return this._extractPipeline(safeFiles, { graphService });
      default:
        return this._extractClass(safeFiles, { graphService });
    }
  }

  _extractClass(files, { graphService }) {
    const rawNames = new Set();
    const allNames = new Set();
    const highConfidenceEdges = [];
    const possibleEdges = [];
    const members = new Map();
    const rawParts = [];
    const fileClassMap = new Map();

    const classRegex = /(?:^|[\n\r])(?:(?:public|private|protected|abstract|final|static|sealed)\s+)*(?:class|interface|@interface|enum|record)\s+(\w+)/g;
    const extendsRegex = /extends\s+(\w+)/g;
    const implementsRegex = /implements\s+(\w+)/g;
    const fieldRegex = /(?:private|public|protected)?\s*(\w+(?:<[^>]*>)?)\s+(\w+)\s*[;=]/g;
    const ormRegex = /@(?:ManyToOne|OneToMany|OneToOne|ManyToMany)(?:\([^)]*\))?\s*(?:\n)?\s*(?:private|public|protected)?\s*(\w+(?:<[^>]*>)?)\s+(\w+)/g;

    for (const file of files) {
      const content = file.content || '';
      rawParts.push(content);
      const fileClasses = [];

      let m;
      while ((m = classRegex.exec(content)) !== null) {
        const className = m[1];
        rawNames.add(className);
        fileClasses.push(className);

        const body = this._extractBlock(content, content.indexOf('{', m.index));
        if (body) {
          if (!members.has(className)) members.set(className, []);
          const fields = [];
          let fm;
          const fieldRx = new RegExp(fieldRegex.source, 'g');
          while ((fm = fieldRx.exec(body)) !== null) {
            fields.push({ type: fm[1], name: fm[2] });
          }
          if (fields.length > 0) {
            members.set(className, members.get(className).concat(fields));
          }

          const paramRx = /(?:public|private|protected)\s+(?:\w+)\s+(\w+)\s*\(([^)]*)\)/g;
          let pm;
          while ((pm = paramRx.exec(body)) !== null) {
            const params = pm[2].split(',').map(p => p.trim()).filter(Boolean);
            for (const param of params) {
              const parts = param.replace(/@\w+(?:\([^)]*\))?\s*/g, '').trim().split(/\s+/);
              if (parts.length === 2) {
                const paramType = parts[0].replace(/<.+>/, '').trim();
                if (paramType[0] === paramType[0]?.toUpperCase() && isProjectType(paramType)) {
                  highConfidenceEdges.push({ from: className, to: paramType, type: 'depends_on', source: 'method-param' });
                  rawNames.add(paramType);
                }
              }
            }
          }
        }
      }

      while ((m = extendsRegex.exec(content)) !== null) {
        highConfidenceEdges.push({ from: this._findNameBefore(content, m.index), to: m[1], type: 'extends', source: 'regex' });
      }

      while ((m = implementsRegex.exec(content)) !== null) {
        highConfidenceEdges.push({ from: this._findNameBefore(content, m.index), to: m[1], type: 'implements', source: 'regex' });
      }

      while ((m = ormRegex.exec(content)) !== null) {
        const genericMatch = m[1].match(/<(\w+)>/);
        const targetType = genericMatch ? genericMatch[1] : m[1];
        highConfidenceEdges.push({ from: this._findNameBefore(content, m.index), to: targetType, type: 'association', source: 'regex' });
        rawNames.add(targetType);
      }

      if (fileClasses.length > 0) {
        fileClassMap.set(file.path, [...new Set(fileClasses)]);
      }
    }

    // ── ASTParserService: JS/TS/Python entities ────────────────────────
    const astFiles = astParserService.parseFiles(files);
    for (const file of astFiles) {
      if (!file.ast) continue;

      if (file.ast.classes) {
        for (const cls of file.ast.classes) {
          if (!cls.name) continue;
          rawNames.add(cls.name);
          const parents = Array.isArray(cls.extends) ? cls.extends : (cls.extends ? [cls.extends] : []);
          for (const parent of parents) {
            if (parent && !/^[A-Z_]+$/.test(parent)) {
              highConfidenceEdges.push({ from: cls.name, to: parent, type: 'extends', source: 'ast' });
              rawNames.add(parent);
            }
          }
          const fc = fileClassMap.get(file.path) || [];
          if (!fc.includes(cls.name)) fc.push(cls.name);
          fileClassMap.set(file.path, fc);
        }
      }

      // Import-based dependency edges
      if (file.ast.imports && file.ast.imports.length > 0) {
        const fromClasses = fileClassMap.get(file.path) || [];
        for (const imp of file.ast.imports) {
          const specifier = imp.specifier || imp.module || '';
          const resolved = files.find(f =>
            f.path.endsWith('/' + specifier.replace(/^\.\//, '').replace(/\.\w+$/, '').split('/').pop() + '.') ||
            f.path.includes(specifier.replace(/^\.\.?\/+/, '/'))
          );
          if (resolved && fileClassMap.has(resolved.path)) {
            const toClasses = fileClassMap.get(resolved.path);
            for (const fromClass of fromClasses) {
              for (const toClass of toClasses) {
                highConfidenceEdges.push({ from: fromClass, to: toClass, type: 'imports', source: 'ast' });
                rawNames.add(toClass);
              }
            }
          }
        }
      }
    }

    // ── Java-specific extraction ───────────────────────────────────────
    const stereotypeTiers = new Map();
    this._extractJavaEntities(files, { rawNames, highConfidenceEdges, members, fileClassMap, stereotypeTiers });

    // Filter out architecture-layer classes (services, controllers, etc.)
    for (const name of rawNames) {
      if (!this._isArchitectureClass(name)) allNames.add(name);
    }

    // Filter edges to only reference surviving names
    const filteredEdges = highConfidenceEdges.filter(e =>
      allNames.has(e.from) && allNames.has(e.to)
    );

    // ── Field-type → edge conversion ────────────────────────────────────
    for (const [className, classFields] of members) {
      if (!allNames.has(className)) continue;
      for (const field of classFields) {
        const fieldType = field.type.replace(/<.+>/, '').trim();
        if (allNames.has(fieldType) && className !== fieldType && isProjectType(fieldType)) {
          const existing = filteredEdges.find(e => e.from === className && e.to === fieldType);
          if (!existing) {
            filteredEdges.push({ from: className, to: fieldType, type: 'association', source: 'field-type' });
          }
        }
      }
    }

    // ── Graph integration: promote file-path edges to class-name edges ─
    if (graphService) {
      for (const file of files) {
        const related = graphService.getRelatedFiles(file.path, { filterAmbiguous: true });
        const fromClasses = fileClassMap.get(file.path) || [];
        for (const r of related) {
          const toClasses = fileClassMap.get(r.path);
          if (!toClasses || fromClasses.length === 0) {
            possibleEdges.push({ from: file.path, to: r.path, type: r.relationType, source: 'graph' });
            continue;
          }
          for (const fromClass of fromClasses) {
            if (!allNames.has(fromClass)) continue;
            for (const toClass of toClasses) {
              if (!allNames.has(toClass)) continue;
              const existing = filteredEdges.find(e => e.from === fromClass && e.to === toClass);
              if (existing) {
                existing.source = 'both';
              } else {
                filteredEdges.push({ from: fromClass, to: toClass, type: r.relationType, source: 'graph' });
              }
            }
          }
        }
      }
    }

    return {
      diagramType: 'CLASS',
      allNames,
      highConfidenceEdges: filteredEdges,
      possibleEdges,
      members,
      stereotypeTiers: Object.fromEntries(stereotypeTiers),
      rawText: rawParts.join('\n'),
      stats: { regexNames: allNames.size, totalEdges: filteredEdges.length + possibleEdges.length },
    };
  }

  _isArchitectureClass(name) {
    return /(?:Services?|Controllers?|Repositor(?:y|ies)|Middlewares?|Handlers?|Managers?|Factor(?:y|ies)|Adapters?|Interceptors?|Providers?|Modules?|Configs?|Utils?|Helpers?|Mappers?|Specs?|Daos?|Repos?|Builders?|Strateg(?:y|ies)|Observers?|EventListeners?|Schedulers?|Validators?|Formatters?|Parsers?|Transformers?|Generators?|Filters?|Matchers?|Resolvers?|Compilers?)$/i.test(name);
  }

  _extractComponent(files, { graphService }) {
    const allNames = new Set();
    const highConfidenceEdges = [];
    const possibleEdges = [];
    const rawParts = [];

    const funcRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*)?=>|class\s+(\w+)\s+(?:extends\s+\w+\s+)?implements)/g;
    const ngRegex = /@(?:Component|Injectable|Directive|Pipe|NgModule)\([\s\S]*?\)\s*(?:export\s+)?(?:class\s+)?(\w+)/g;
    const vueRegex = /(?:defineComponent|createApp|app\.component)\((?:\s*['"](\w+)['"]\s*,?\s*)?/g;
    const flutterRegex = /class\s+(\w+)\s+extends\s+(?:StatefulWidget|StatelessWidget)/g;
    const jsxRegex = /<([A-Z][a-zA-Z0-9]*)(?:\s|>)/g;

    for (const file of files) {
      const content = file.content || '';
      rawParts.push(content);

      let m;
      while ((m = funcRegex.exec(content)) !== null) allNames.add(m[1] || m[2] || m[3]);
      while ((m = ngRegex.exec(content)) !== null) allNames.add(m[1]);
      while ((m = vueRegex.exec(content)) !== null) if (m[1]) allNames.add(m[1]);
      while ((m = flutterRegex.exec(content)) !== null) allNames.add(m[1]);
    }

    for (const file of files) {
      const content = file.content || '';
      let m;
      while ((m = jsxRegex.exec(content)) !== null) {
        const name = m[1];
        if (name[0] === name[0]?.toUpperCase() && allNames.has(name)) {
          const parent = this._findComponentParent(content, m.index);
          if (parent) {
            highConfidenceEdges.push({ from: parent, to: name, type: 'renders', source: 'regex' });
          }
        }
      }
    }

    if (graphService) {
      for (const file of files) {
        const related = graphService.getRelatedFiles(file.path, { filterAmbiguous: true });
        for (const r of related) {
          possibleEdges.push({ from: file.path, to: r.path, type: r.relationType, source: 'graph' });
        }
      }
    }

    return {
      diagramType: 'COMPONENT',
      allNames,
      highConfidenceEdges,
      possibleEdges,
      rawText: rawParts.join('\n'),
      stats: { regexNames: allNames.size, totalEdges: highConfidenceEdges.length + possibleEdges.length },
    };
  }

  _extractPipeline(files, { graphService }) {
    const allNames = new Set();
    const highConfidenceEdges = [];
    const rawParts = [];

    const ghJobRegex = /^\s+(\w+):\s*\n\s+runs-on:/gm;
    const needsRegex = /^\s+needs:\s*\[([^\]]+)\]/gm;
    const needsMultiRegex = /^\s+needs:\s*$/gm;
    const stageRegex = /stage\(['"](\w+)['"]\)/g;
    const gitlabStageRegex = /^\s+-\s+(\w+)$/gm;
    const stepNameRegex = /^\s+-\s+name:\s*(.+)$/gm;

    for (const file of files) {
      const content = file.content || '';
      rawParts.push(content);

      let m;
      while ((m = ghJobRegex.exec(content)) !== null) allNames.add(m[1]);
      while ((m = needsRegex.exec(content)) !== null) {
        m[1].split(',').forEach(n => {
          const name = n.trim();
          allNames.add(name);
          const currentJob = this._findJobBefore(content, m.index);
          if (currentJob) highConfidenceEdges.push({ from: currentJob, to: name, type: 'depends_on', source: 'regex' });
        });
      }
      while ((m = stageRegex.exec(content)) !== null) allNames.add(m[1]);
      while ((m = stepNameRegex.exec(content)) !== null) allNames.add(m[1]);
    }

    return {
      diagramType: 'PIPELINE',
      allNames,
      highConfidenceEdges,
      possibleEdges: [],
      rawText: rawParts.join('\n'),
      stats: { regexNames: allNames.size, totalEdges: highConfidenceEdges.length },
    };
  }

  _extractC4Container(files, { graphService, manifestDependencies }) {
    const allNames = new Set();
    const highConfidenceEdges = [];
    const rawParts = [];

    for (const file of files) {
      const content = file.content || '';
      rawParts.push(content);
    }

    const manifests = manifestDependencies || [];
    for (const dep of manifests) {
      if (dep.type === 'node') {
        allNames.add('Web App');
        allNames.add('Frontend');
      }
      if (dep.type === 'java' || dep.type === 'spring') {
        allNames.add('API Server');
        allNames.add('Backend');
      }
      if (dep.type === 'python') {
        allNames.add('Python Service');
      }
      if (dep.type === 'go') {
        allNames.add('Go Service');
      }
    }

    if (graphService) {
      for (const [communityId, members] of graphService.communityMap) {
        const containerName = `Container-${communityId}`;
        allNames.add(containerName);
      }
    }

    allNames.add('Database');

    const beName = allNames.has('API Server') ? 'API Server' : (allNames.has('Backend') ? 'Backend' : null);
    const feName = allNames.has('Frontend') ? 'Frontend' : (allNames.has('Web App') ? 'Web App' : null);

    if (beName && allNames.has('Database')) {
      highConfidenceEdges.push({ from: beName, to: 'Database', type: 'reads/writes', source: 'manifest' });
    }
    if (feName && beName) {
      highConfidenceEdges.push({ from: feName, to: beName, type: 'calls', source: 'manifest' });
    }

    if (!beName) {
      allNames.add('Application');
    }
    if (!feName) {
      allNames.add('Web Client');
    }

    return {
      diagramType: 'C4_CONTAINER',
      allNames,
      highConfidenceEdges,
      possibleEdges: [],
      rawText: rawParts.join('\n'),
      stats: { regexNames: allNames.size, totalEdges: highConfidenceEdges.length },
    };
  }

  _extractC4Context(files, { techStack, businessModel, manifestDependencies }) {
    const allNames = new Set();
    const highConfidenceEdges = [];
    const rawParts = [];

    for (const file of files) {
      rawParts.push(file.content || '');
    }

    allNames.add('User');

    const tech = Array.isArray(techStack) ? techStack.join(' ') : (techStack || '');
    const systemName = tech.match(/(\w+)\s+(?:app|api|backend|service|system|platform)/i)?.[1] || 'System';
    allNames.add(systemName);
    allNames.add(`${systemName} API`);

    if (manifestDependencies && manifestDependencies.length > 0) {
      for (const dep of manifestDependencies) {
        if (dep.externalApis) {
          for (const api of dep.externalApis) {
            allNames.add(api);
            highConfidenceEdges.push({ from: systemName, to: api, type: 'calls', source: 'manifest' });
          }
        }
      }
    }

    highConfidenceEdges.push({ from: 'User', to: systemName, type: 'uses', source: 'manifest' });

    return {
      diagramType: 'C4_CONTEXT',
      allNames,
      highConfidenceEdges,
      possibleEdges: [],
      rawText: rawParts.join('\n'),
      stats: { regexNames: allNames.size, totalEdges: highConfidenceEdges.length },
    };
  }

  _extractBlock(content, openIdx) {
    if (openIdx === -1 || openIdx >= content.length) return null;
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

  _findNameBefore(content, index) {
    const before = content.slice(Math.max(0, index - 500), index);
    const classMatch = before.match(/(?:^|[\n\r])(?:(?:public|private|protected|abstract|final|static|sealed)\s+)*(?:class|interface|@interface|enum|record)\s+(\w+)/);
    return classMatch ? classMatch[1] : 'Unknown';
  }

  _findComponentParent(content, jsxIndex) {
    const before = content.slice(Math.max(0, jsxIndex - 200), jsxIndex);
    const lines = before.split('\n').reverse();
    for (const line of lines) {
      const funcMatch = line.match(/(?:function|const)\s+(\w+)/);
      if (funcMatch) return funcMatch[1];
    }
    return null;
  }

  _findJobBefore(content, needsIndex) {
    const before = content.slice(Math.max(0, needsIndex - 500), needsIndex);
    const jobMatch = before.match(/(?:^|\n)\s+(\w+):\s*\n/);
    return jobMatch ? jobMatch[1] : null;
  }

  _extractJavaEntities(files, state) {
    const { rawNames, highConfidenceEdges, members, fileClassMap, stereotypeTiers } = state;
    const javaFiles = files.filter(f => f.path.endsWith('.java'));
    if (javaFiles.length === 0) return;

    for (const file of javaFiles) {
      const content = file.content || '';
      const fileClasses = fileClassMap.get(file.path) || [];

      const javaClassRegex = /(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+|static\s+)?(?:class|interface|@interface|enum|record)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/g;
      let m;
      while ((m = javaClassRegex.exec(content)) !== null) {
        const className = m[1];
        const extendsClass = m[2];
        const implementsList = m[3] ? m[3].split(',').map(s => s.trim().replace(/<.+>/, '').trim()).filter(Boolean) : [];

        rawNames.add(className);
        if (!fileClasses.includes(className)) fileClasses.push(className);

        if (extendsClass && extendsClass[0] === extendsClass[0]?.toUpperCase()) {
          highConfidenceEdges.push({ from: className, to: extendsClass, type: 'extends', source: 'java' });
          rawNames.add(extendsClass);
        }

        for (const impl of implementsList) {
          if (impl[0] === impl[0]?.toUpperCase()) {
            highConfidenceEdges.push({ from: className, to: impl, type: 'implements', source: 'java' });
            rawNames.add(impl);
          }
        }

        // Detect stereotype from annotations above class declaration
        const beforeClass = content.slice(Math.max(0, m.index - 500), m.index);
        let tier = 3;
        if (/@Entity\b/.test(beforeClass) || /@Document\b/.test(beforeClass)) tier = 1;
        else if (/@Repository\b/.test(beforeClass)) tier = 2;
        else if (/@Service\b/.test(beforeClass)) tier = 3;
        else if (/@RestController\b/.test(beforeClass) || /@Controller\b/.test(beforeClass)) tier = 4;
        stereotypeTiers.set(className, tier);
      }

      if (fileClasses.length > 0) fileClassMap.set(file.path, fileClasses);
    }

    // Build import-based edges (properly: import → defining file)
    const classNameToFile = new Map();
    for (const [filePath, classNames] of fileClassMap) {
      for (const cn of classNames) {
        classNameToFile.set(cn, filePath);
      }
    }

    for (const file of javaFiles) {
      const content = file.content || '';
      const fromClasses = fileClassMap.get(file.path) || [];
      if (fromClasses.length === 0) continue;

      const importRegex = /^import\s+(?:static\s+)?([\w.*]+);$/gm;
      let m;
      while ((m = importRegex.exec(content)) !== null) {
        const full = m[1];
        const parts = full.split('.');
        const shortName = parts[parts.length - 1];
        if (shortName === '*' || /^\d/.test(shortName)) continue;

        const definingFile = classNameToFile.get(shortName);
        if (definingFile && definingFile !== file.path) {
          const toClasses = fileClassMap.get(definingFile);
          if (toClasses) {
            for (const fromClass of fromClasses) {
              for (const toClass of toClasses) {
                if (fromClass !== toClass) {
                  highConfidenceEdges.push({ from: fromClass, to: toClass, type: 'imports', source: 'java' });
                  rawNames.add(toClass);
                }
              }
            }
          }
        }
      }
    }
  }
}

module.exports = new FactExtractor();
