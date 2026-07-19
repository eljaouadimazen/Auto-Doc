/**
 * services/diagram.service.js
 *
 * Selects the highest-signal files for diagram generation.
 * CLASS → top 12, others → top 8.
 *
 * Design principle (aligned with gitdiagram):
 *   The file TREE is the primary architectural signal.
 *   File CONTENTS are a secondary signal — only needed for method/class names.
 *   This service selects files that reveal STRUCTURE, not implementation details.
 */
class DiagramService {

  /**
   * Returns the best files for a given diagram type.
   * Scores each file — CLASS returns top 20, others return top 8.
   * When graphService is provided, ensures at least 2 files per community.
   *
   * @param {Array<{path: string, content: string}>} repoFiles
   * @param {'CLASS'|'COMPONENT'|'PIPELINE'|'C4_CONTAINER'|'C4_CONTEXT'} diagramType
   * @param {Object} [graphService] optional graph service for community-aware selection
   * @returns {Array<{path: string, content: string, score: number}>}
   */
  filterHighSignalFiles(repoFiles, diagramType, graphService) {
    console.info(`[DiagramService] filterHighSignalFiles: ${repoFiles.length} files in, diagramType=${diagramType}`);
    if (repoFiles.length > 0) {
      console.info(`[DiagramService] First 5 file paths:`, repoFiles.slice(0, 5).map(f => f.path));
    }

    const allScored = repoFiles.map(file => {
      const score = this._score(file.path, file.content || '', diagramType);
      if (score <= 0) {
        console.info(`[DiagramService] SCORE 0: "${file.path}" (depth=${file.path.split('/').length - 1}, contentLen=${(file.content || '').length})`);
      }
      return { ...file, score };
    });

    let scored;

    if (diagramType === 'CLASS') {
      // ── Two-pass entity-first selection for CLASS ────────────────────
      const entityFiles = allScored.filter(f => this._isEntityFile(f) && f.score > 0);

      const entityCount = entityFiles.length;
      const fileLimit = Math.max(30, Math.ceil(entityCount * 1.2));
      console.info(`[DiagramService] CLASS: ${entityCount} entity files, limit=${fileLimit}`);

      entityFiles.sort((a, b) => b.score - a.score);
      scored = [];

      for (const f of entityFiles) {
        if (scored.length < fileLimit) {
          scored.push(f);
        }
      }
    } else {
      const fileLimit = 8;
      scored = allScored
        .filter(f => f.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, fileLimit);
    }

    console.info(`[DiagramService] filterHighSignalFiles result: ${scored.length} files selected out of ${repoFiles.length}`);
    if (scored.length > 0) {
      scored.forEach(f => console.info(`[DiagramService]   selected: "${f.path}" → score=${f.score}`));
    }

    // ── Community-aware selection (CLASS only) ─────────────────────────
    if (graphService && diagramType === 'CLASS') {
      const selectedPaths = new Set(scored.map(f => f.path));
      const allScoredMap = new Map(allScored.filter(f => f.score > 0).map(f => [f.path, f]));
      for (const [, members] of graphService.communityMap) {
        const membersInResult = members.filter(m => selectedPaths.has(m));
        if (membersInResult.length < 2) {
          const candidates = members
            .filter(m => !selectedPaths.has(m) && allScoredMap.has(m))
            .sort((a, b) => (allScoredMap.get(b)?.score || 0) - (allScoredMap.get(a)?.score || 0));
          const needed = 2 - membersInResult.length;
          for (let i = 0; i < needed && i < candidates.length; i++) {
            const candidate = allScoredMap.get(candidates[i]);
            if (candidate) {
              scored.push(candidate);
              selectedPaths.add(candidate.path);
              console.info(`[DiagramService]   community-added: "${candidate.path}" → score=${candidate.score}`);
            }
          }
        }
      }
      scored.sort((a, b) => b.score - a.score);
    }

    return scored;
  }

  // ── Scoring ────────────────────────────────────────────────────────────

  _score(filePath, content, diagramType) {
    const path = filePath.toLowerCase();
    let score = 0;
    const breakdown = { entry: 0, primary: 0, secondary: 0, content: 0, depth: 0, testPenalty: 0 };

    // ── Always skip ──────────────────────────────────────────────────────
    if (this._shouldSkip(path)) {
      console.info(`[DiagramService] SKIPPED "${filePath}" — matched _shouldSkip`);
      return 0;
    }

    // ── Entry points — highest signal for any diagram type ───────────────
    if (/\/(app|main|index|server|root|gateway)\.(js|ts|tsx|jsx|py|java|go|dart)$/.test(path)) {
      score += 20;
      breakdown.entry = 20;
    }

    // ── Type-specific patterns ───────────────────────────────────────────
    const patterns = this._patterns(diagramType);
    patterns.primary.forEach(p => { if (path.includes(p)) { score += 12; breakdown.primary += 12; } });
    patterns.secondary.forEach(p => { if (path.includes(p)) { score += 6; breakdown.secondary += 6; } });

    // ── Content signals (only if content is available) ───────────────────
    if (content.length > 0) {
      const cs = this._contentScore(content, diagramType);
      score += cs;
      breakdown.content = cs;
    } else {
      console.info(`[DiagramService] "${filePath}" — empty content, contentScore=0`);
    }

    // ── Depth penalty — deeply nested files are usually implementation details
    const depth = filePath.split('/').length - 1;
    const depthPenalty = depth * 1.0;
    score -= depthPenalty;
    breakdown.depth = -depthPenalty;

    // ── Test/generated file penalty ──────────────────────────────────────
    if (/\.(test|spec|mock|generated|d\.ts)/.test(path)) {
      score -= 15;
      breakdown.testPenalty = -15;
    }

    const finalScore = Math.max(0, score);
    if (finalScore <= 0) {
      console.info(`[DiagramService] SCORED 0: "${filePath}" | entry=${breakdown.entry} primary=${breakdown.primary} secondary=${breakdown.secondary} content=${breakdown.content} depth=${breakdown.depth} test=${breakdown.testPenalty} final=${finalScore}`);
    }
    return finalScore;
  }

  _patterns(diagramType) {
    const map = {
      CLASS: {
        primary:   ['entity', 'domain', 'model', 'schema', 'dto', 'value-object', 'persist', 'types.go', 'models.py', 'serializers', 'data-class', 'pojo'],
        secondary: ['interface']
      },
      COMPONENT: {
        primary:   ['component', 'screen', 'page', 'view', 'widget', 'container', 'service', 'api', 'http', 'store'],
        secondary: ['context', 'provider', 'hook', 'store', 'layout', 'modal', 'form', 'guard', 'interceptor', 'pipe', 'directive', 'module', 'model', 'dto']
      },
      PIPELINE: {
        primary:   ['.github/workflows', 'jenkinsfile', 'pipeline', 'deploy', 'dockerfile', 'docker-compose'],
        secondary: ['terraform', 'ansible', 'k8s', 'kubernetes', 'helm', 'ci', 'cd', '.github']
      },
      C4_CONTAINER: {
        primary:   ['Dockerfile', 'docker-compose', 'pom.xml', 'package.json', 'build.gradle', 'Procfile', 'render.yaml', 'app.json', 'k8s', 'kubernetes', 'helm'],
        secondary: ['nginx', 'proxy', 'gateway', 'config', 'application.yml', 'application.properties', '.env'],
      },
      C4_CONTEXT: {
        primary:   ['openapi', 'swagger', 'spec', 'contract', 'ARCHITECTURE', 'README'],
        secondary: ['gateway', 'proxy', 'config', 'docs'],
      },
    };
    return map[diagramType] || map.CLASS;
  }

  _contentScore(content, diagramType) {
    let score = 0;
    const contentSignals = {
      CLASS: [
        /class\s+\w+/,           // class definitions
        /extends\s+\w+/,          // inheritance
        /implements\s+\w+/,       // interfaces
        /@(Entity|Table|Column|OneToMany|ManyToOne|ManyToMany|OneToOne|JoinColumn)/,  // ORM/entity decorators
        /constructor\s*\(/,        // JS constructor keyword
        /^\s*(public|private|protected)\s+\w+\s*\([^)]*\)\s*\{/m,  // Java constructor: "public ClassName(...) {"
      ],
      COMPONENT: [
        /export\s+(default\s+)?function\s+\w+/,  // React functional components
        /useState|useEffect|useContext/,           // React hooks
        /props\s*[:{]/,                            // prop definitions
        /@Component|@NgModule/,                    // Angular decorators
        /Widget\s*{|StatefulWidget|StatelessWidget/ // Flutter
      ],
      PIPELINE: [
        /^\s*(on|jobs|steps|stages):/m,  // YAML pipeline keys (steps/stages are usually indented)
        /docker\s+build|docker\s+push/,
        /npm\s+(run|install|test|build)/,
        /runs-on:|uses:/               // GitHub Actions
      ]
    };

    const signals = contentSignals[diagramType] || contentSignals.CLASS;
    signals.forEach(regex => { if (regex.test(content)) score += 3; });

    if (diagramType === 'CLASS') {
      if (/\b(?:class|interface|type|struct|entity|record)\s+\w+/.test(content)) score += 15;
      if (/@Entity\b/.test(content)) score += 10;
      if (/@Document\b/.test(content)) score += 10;
    }

    return score;
  }

  _isEntityFile(file) {
    const content = file.content || '';
    if (!/\b(?:class|interface|@interface|struct|type|entity|record|enum)\s+\w+/.test(content)) return false;
    const path = file.path.toLowerCase();
    const architecturePatterns = [
      'service', 'controller', 'repositor', 'middleware', 'handler',
      'manager', 'factory', 'adapter', 'interceptor', 'provider',
      'config', 'util', 'helper', 'mapper', 'spec', 'dao',
      'builder', 'validator', 'filter', 'matcher', 'resolver',
      'compiler', 'generator', 'scheduler', 'observer', 'listener',
      'strategy', 'application', 'dto', 'auth', 'security',
      'request', 'response', 'exception', 'error', 'event', 'command'
    ];
    for (const p of architecturePatterns) {
      if (path.includes(p)) return false;
    }

    const filename = file.path.split('/').pop().toLowerCase();
    if (/^(main|app)\./.test(filename)) return false;

    return true;
  }

  _shouldSkip(path) {
    return /node_modules|\/dist\/|\/build\/|\/\.git\/|\/coverage\/|\.min\.(js|css)|\.lock$|\.map$/.test(path);
  }
}

module.exports = new DiagramService();