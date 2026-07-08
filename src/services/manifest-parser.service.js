/**
 * manifest-parser.service.js
 *
 * Deterministic (non-LLM) parsing of dependency manifest files.
 * Gives WriterAgent.writeDependencies() real package coordinates and versions
 * instead of import-statement fragments inferred by CodeIntelligenceAgent,
 * which only sees the ~10 files that fit the code-intelligence budget.
 */

const MANIFEST_FILENAMES = new Set([
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'package.json',
  'requirements.txt', 'go.mod', 'Cargo.toml', 'pyproject.toml',
]);

class ManifestParserService {
  /**
   * @param {Array} files - [{path, content}]
   * @returns {Array} [{ file, ecosystem, dependencies: string[] }]
   */
  extract(files) {
    const results = [];
    for (const file of files) {
      const name = file.path.split('/').pop();
      if (!MANIFEST_FILENAMES.has(name) || !file.content) continue;

      try {
        const dependencies = this._parse(name, file.content);
        if (dependencies.length > 0) {
          results.push({ file: file.path, ecosystem: this._ecosystem(name), dependencies });
        }
      } catch (err) {
        console.warn(`[manifest-parser] Failed to parse ${file.path}: ${err.message}`);
      }
    }
    return results;
  }

  _ecosystem(name) {
    if (name === 'pom.xml') return 'Maven';
    if (name.startsWith('build.gradle')) return 'Gradle';
    if (name === 'package.json') return 'npm';
    if (name === 'requirements.txt') return 'pip';
    if (name === 'go.mod') return 'Go Modules';
    if (name === 'Cargo.toml') return 'Cargo';
    if (name === 'pyproject.toml') return 'PEP 621 / Poetry';
    return 'unknown';
  }

  _parse(name, content) {
    if (name === 'pom.xml') return this._parsePom(content);
    if (name.startsWith('build.gradle')) return this._parseGradle(content);
    if (name === 'package.json') return this._parsePackageJson(content);
    if (name === 'requirements.txt') return this._parseRequirementsTxt(content);
    if (name === 'go.mod') return this._parseGoMod(content);
    if (name === 'Cargo.toml' || name === 'pyproject.toml') return this._parseToml(content);
    return [];
  }

  _parsePom(content) {
    const deps = [];
    const blockRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
    let m;
    while ((m = blockRegex.exec(content)) !== null) {
      const block = m[1];
      const groupId    = block.match(/<groupId>([^<]+)<\/groupId>/)?.[1]?.trim();
      const artifactId = block.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]?.trim();
      const version    = block.match(/<version>([^<]+)<\/version>/)?.[1]?.trim();
      if (!groupId || !artifactId) continue;
      deps.push(version ? `${groupId}:${artifactId}:${version}` : `${groupId}:${artifactId}`);
    }
    return [...new Set(deps)];
  }

  _parseGradle(content) {
    const deps = [];
    const regex = /(?:implementation|api|compile|runtimeOnly|testImplementation|annotationProcessor)\s*[(]?['"]([^'"]+)['"]/g;
    let m;
    while ((m = regex.exec(content)) !== null) deps.push(m[1]);
    return [...new Set(deps)];
  }

  _parsePackageJson(content) {
    const json = JSON.parse(content);
    const combined = { ...(json.dependencies || {}), ...(json.devDependencies || {}) };
    return Object.entries(combined).map(([name, version]) => `${name}@${version}`);
  }

  _parseRequirementsTxt(content) {
    return content.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => l.split(/[;#]/)[0].trim())
      .filter(Boolean);
  }

  _parseGoMod(content) {
    const deps = [];
    const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
    const lines = requireBlock
      ? requireBlock[1].split('\n')
      : content.split('\n').filter(l => l.trim().startsWith('require '));
    lines.forEach(line => {
      const m = line.trim().replace(/^require\s+/, '').match(/^(\S+)\s+(\S+)/);
      if (m) deps.push(`${m[1]}@${m[2]}`);
    });
    return [...new Set(deps)];
  }

  _parseToml(content) {
    const deps = [];
    const depSection = content.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/);
    if (!depSection) return deps;
    depSection[1].split('\n').forEach(line => {
      const m = line.trim().match(/^([\w.-]+)\s*=\s*"?([^"\n]*)"?/);
      if (m && m[1]) deps.push(m[2] ? `${m[1]}@${m[2].trim()}` : m[1]);
    });
    return [...new Set(deps)];
  }
}

module.exports = new ManifestParserService();
