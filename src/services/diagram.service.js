/**
 * services/diagram.service.js
 *
 * Selects the 8 highest-signal files for diagram generation.
 *
 * Design principle (aligned with gitdiagram):
 *   The file TREE is the primary architectural signal.
 *   File CONTENTS are a secondary signal — only needed for method/class names.
 *   This service selects files that reveal STRUCTURE, not implementation details.
 */
class DiagramService {

  /**
   * Returns the best files for a given diagram type.
   * Scores each file and returns the top 8.
   *
   * @param {Array<{path: string, content: string}>} repoFiles
   * @param {'CLASS'|'COMPONENT'|'PIPELINE'} diagramType
   * @returns {Array<{path: string, content: string, score: number}>}
   */
  filterHighSignalFiles(repoFiles, diagramType) {
    const scored = repoFiles
      .map(file => ({ ...file, score: this._score(file.path, file.content || '', diagramType) }))
      .filter(f => f.score > 0)                    // drop files with no architectural signal
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return scored;
  }

  // ── Scoring ────────────────────────────────────────────────────────────

  _score(filePath, content, diagramType) {
    const path = filePath.toLowerCase();
    let score = 0;

    // ── Always skip ──────────────────────────────────────────────────────
    if (this._shouldSkip(path)) return 0;

    // ── Entry points — highest signal for any diagram type ───────────────
    if (/\/(app|main|index|server|root|gateway)\.(js|ts|tsx|jsx|py|java|go|dart)$/.test(path)) {
      score += 20;
    }

    // ── Type-specific patterns ───────────────────────────────────────────
    const patterns = this._patterns(diagramType);
    patterns.primary.forEach(p => { if (path.includes(p)) score += 12; });
    patterns.secondary.forEach(p => { if (path.includes(p)) score += 6; });

    // ── Content signals (only if content is available) ───────────────────
    if (content.length > 0) {
      score += this._contentScore(content, diagramType);
    }

    // ── Depth penalty — deeply nested files are usually implementation details
    const depth = filePath.split('/').length - 1;
    score -= depth * 1.5;

    // ── Test/generated file penalty ──────────────────────────────────────
    if (/\.(test|spec|mock|generated|d\.ts)/.test(path)) score -= 15;

    return Math.max(0, score);
  }

  _patterns(diagramType) {
    const map = {
      CLASS: {
        primary:   ['service', 'controller', 'repository', 'entity', 'domain', 'model'],
        secondary: ['middleware', 'handler', 'manager', 'factory', 'adapter', 'dto', 'interface']
      },
      COMPONENT: {
        primary:   ['component', 'screen', 'page', 'view', 'widget', 'container'],
        secondary: ['context', 'provider', 'hook', 'store', 'layout', 'modal', 'form']
      },
      PIPELINE: {
        primary:   ['.github/workflows', 'jenkinsfile', 'pipeline', 'deploy', 'dockerfile', 'docker-compose'],
        secondary: ['terraform', 'ansible', 'k8s', 'kubernetes', 'helm', 'ci', 'cd', '.github']
      }
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
        /@(Controller|Service|Repository|Injectable)/,  // decorators
        /constructor\s*\(/        // constructor = class anchor
      ],
      COMPONENT: [
        /export\s+(default\s+)?function\s+\w+/,  // React functional components
        /useState|useEffect|useContext/,           // React hooks
        /props\s*[:{]/,                            // prop definitions
        /@Component|@NgModule/,                    // Angular decorators
        /Widget\s*{|StatefulWidget|StatelessWidget/ // Flutter
      ],
      PIPELINE: [
        /^(on:|jobs:|steps:|stages:)/m,  // YAML pipeline keys
        /docker\s+build|docker\s+push/,
        /npm\s+(run|install|test|build)/,
        /runs-on:|uses:/               // GitHub Actions
      ]
    };

    const signals = contentSignals[diagramType] || contentSignals.CLASS;
    signals.forEach(regex => { if (regex.test(content)) score += 3; });

    return score;
  }

  _shouldSkip(path) {
    return /node_modules|\/dist\/|\/build\/|\/\.git\/|\/coverage\/|\.min\.(js|css)|\.lock$|\.map$/.test(path);
  }
}

module.exports = new DiagramService();