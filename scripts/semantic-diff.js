/**
 * scripts/semantic-diff.js
 *
 * Layer 2 smart trigger — uses your own AST parser to detect
 * whether changed files contain STRUCTURAL differences, not just
 * internal logic changes.
 *
 * Structural changes that trigger doc generation:
 *   - New/removed/renamed functions or methods
 *   - New/removed/renamed classes
 *   - New/changed API routes
 *   - New/removed imports (dependencies changed)
 *   - New/removed env vars accessed
 *
 * Changes that are SKIPPED (docs already accurate):
 *   - Variable value changes
 *   - Internal logic refactors
 *   - Comments / console.logs
 *   - Code style fixes
 */

const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');
const astParser    = require('../src/services/ast-parser.service');

const currentSHA = process.env.GITHUB_SHA;
const baseSHA    = process.env.GITHUB_BASE_SHA;
const force      = process.env.FORCE === 'true';
const output     = process.env.GITHUB_OUTPUT;

// ── Helpers ───────────────────────────────────────────────────────

function setOutput(key, value) {
  fs.appendFileSync(output, `${key}=${value}\n`);
}

function log(msg) {
  console.log(`[semantic-diff] ${msg}`);
}

/**
 * Extract a structural fingerprint from an AST result.
 * Only captures things that matter for documentation.
 * Internal logic, variable values, comments — all ignored.
 */
function extractSignature(ast) {
  if (!ast) return '';

  const parts = [
    // Class names + their method signatures
    ...(ast.classes || []).map(c =>
      `class:${c.name}(extends:${c.extends || 'none'})` +
      `[${(c.methods || []).map(m => `${m.async ? 'async ' : ''}${m.name}(${m.params.join(',')})`).join('|')}]`
    ),

    // Top-level function signatures
    ...(ast.functions || []).map(f =>
      `fn:${f.async ? 'async:' : ''}${f.name}(${f.params.join(',')})`
    ),

    // Express routes — new route = new doc section needed
    ...(ast.expressRoutes || []).map(r =>
      `route:${r.method}:${r.path}`
    ),

    // External imports — new dependency = architecture changed
    ...(ast.imports || [])
      .filter(i => !i.specifier?.startsWith('.') && !i.module?.startsWith('.'))
      .map(i => `import:${i.specifier || i.module}`),

    // Env vars — new var = new config requirement
    ...(ast.envAccess || []).map(e => `env:${e}`),

    // Exports — public API changed
    ...(ast.exports || []).map(e => `export:${e.type}:${e.name}`)
  ];

  // Sort so order changes don't trigger false positives
  return parts.sort().join('|');
}

/**
 * Get file content at a specific git commit
 * Returns null if file didn't exist at that commit
 */
function getFileAtCommit(sha, filePath) {
  try {
    return execSync(`git show ${sha}:${filePath} 2>/dev/null`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    return null; // file didn't exist at this commit
  }
}

// ── Main ──────────────────────────────────────────────────────────

async function run() {
  // Force flag overrides everything
  if (force) {
    log('Force flag set — skipping semantic check');
    setOutput('skip', 'false');
    setOutput('changed_files', 'forced regeneration');
    return;
  }

  // Handle first push (no base SHA available)
  if (!baseSHA || baseSHA === '0000000000000000000000000000000000000000') {
    log('First push detected — generating docs');
    setOutput('skip', 'false');
    setOutput('changed_files', 'initial commit');
    return;
  }

  // Get list of changed files in src/
  let changedFiles;
  try {
    changedFiles = execSync(
      `git diff --name-only ${baseSHA} ${currentSHA} -- src/`,
      { encoding: 'utf-8' }
    ).trim().split('\n').filter(Boolean);
  } catch (err) {
    log(`Git diff failed: ${err.message} — assuming structural change`);
    setOutput('skip', 'false');
    setOutput('changed_files', 'unknown');
    return;
  }

  if (changedFiles.length === 0) {
    log('No src/ files in diff — skipping');
    setOutput('skip', 'true');
    setOutput('changed_files', 'none');
    return;
  }

  log(`Changed files: ${changedFiles.join(', ')}`);

  // Only analyze JS/TS/PY files — others (JSON, md) skip straight to generate
  const parseable = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.py'];
  const nonParseable = changedFiles.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return !parseable.includes(ext);
  });

  // Non-parseable file changed (e.g. package.json) → always regenerate
  if (nonParseable.length > 0) {
    log(`Non-parseable files changed: ${nonParseable.join(', ')} — generating docs`);
    setOutput('skip', 'false');
    setOutput('changed_files', changedFiles.join(', '));
    return;
  }

  // ── Semantic comparison for each changed JS/TS/PY file ──────────
  let structuralChangeFound = false;
  const structuralFiles = [];

  for (const filePath of changedFiles) {
    const ext = path.extname(filePath).toLowerCase();

    // Get content before and after
    const contentBefore = getFileAtCommit(baseSHA, filePath);
    const contentAfter  = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : null;

    // File was added
    if (!contentBefore && contentAfter) {
      log(`New file added: ${filePath} — structural change`);
      structuralChangeFound = true;
      structuralFiles.push(`${filePath} (new file)`);
      continue;
    }

    // File was deleted
    if (contentBefore && !contentAfter) {
      log(`File deleted: ${filePath} — structural change`);
      structuralChangeFound = true;
      structuralFiles.push(`${filePath} (deleted)`);
      continue;
    }

    // File was modified — compare AST signatures
    try {
      let astBefore, astAfter;

      if (['.js', '.ts', '.jsx', '.tsx', '.mjs'].includes(ext)) {
        astBefore = astParser.parseJS(contentBefore, filePath);
        astAfter  = astParser.parseJS(contentAfter,  filePath);
      } else if (ext === '.py') {
        astBefore = astParser.parsePython(contentBefore, filePath);
        astAfter  = astParser.parsePython(contentAfter,  filePath);
      }

      const sigBefore = extractSignature(astBefore);
      const sigAfter  = extractSignature(astAfter);

      if (sigBefore !== sigAfter) {
        log(`Structural change in: ${filePath}`);
        log(`  Before: ${sigBefore.slice(0, 100)}...`);
        log(`  After:  ${sigAfter.slice(0, 100)}...`);
        structuralChangeFound = true;
        structuralFiles.push(filePath);
      } else {
        log(`Only internal logic changed in: ${filePath} — skipping`);
      }

    } catch (err) {
      // Parse error → assume structural change to be safe
      log(`Parse error on ${filePath}: ${err.message} — assuming structural change`);
      structuralChangeFound = true;
      structuralFiles.push(`${filePath} (parse error)`);
    }
  }

  // ── Decision ────────────────────────────────────────────────────
  if (structuralChangeFound) {
    log(` Structural changes found in: ${structuralFiles.join(', ')}`);
    log('→ Generating documentation');
    setOutput('skip', 'false');
    setOutput('changed_files', structuralFiles.join(', '));
  } else {
    log(' All changes are internal logic only');
    log('→ Skipping doc generation — existing docs are still accurate');
    setOutput('skip', 'true');
    setOutput('changed_files', changedFiles.join(', '));
  }
}

run().catch(err => {
  console.error('[semantic-diff] Fatal error:', err.message);
  // On any unexpected error, generate docs to be safe
  setOutput('skip', 'false');
  setOutput('changed_files', 'error — regenerating to be safe');
  process.exit(0); // exit 0 so pipeline continues
});