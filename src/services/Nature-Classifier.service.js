/**
 * Nature-Classifier.service.js
 *
 * Detects the primary nature of a project from its file list.
 * Returns one of: 'Backend', 'Frontend', 'DevOps', 'General'
 *
 * Key improvements over v1:
 *
 * 1. WEIGHTED signals — not all signals are equal.
 *    A `controllers/` folder is a stronger Backend signal than an `.env.example`.
 *    A `Dockerfile` alone is a weak DevOps signal — it just means the project is containerised.
 *
 * 2. DevOps ONLY wins if it has exclusive signals.
 *    If Backend or Frontend also have signals, DevOps is demoted.
 *    A backend project with a Dockerfile is still a Backend project.
 *    DevOps wins only when the repo IS the pipeline (no app code detected).
 *
 * 3. Stable tie-breaking by priority: Backend > Frontend > DevOps > General.
 *    Most real-world repos are backend or frontend apps that happen to have
 *    some CI/CD config — Backend/Frontend should win ties.
 */

// ── Signal weights ────────────────────────────────────────────────────────────
// Each entry is [pattern, weight].
// High weight (3): definitive structural signal — this file/dir only exists in this type.
// Medium weight (2): strong but occasionally shared.
// Low weight (1): weak — present in many project types.

const WEIGHTED_SIGNATURES = {

  DevOps: [
    ['.github/workflows',  3],  // CI/CD pipeline definition
    ['Jenkinsfile',        3],  // Jenkins pipeline
    ['.gitlab-ci',        3],  // GitLab CI
    ['terraform',         3],  // Infrastructure as Code
    ['.tf',               3],  // Terraform files
    ['kubernetes',        3],  // K8s manifests
    ['k8s',               3],  // K8s shorthand dir
    ['ansible',           3],  // Ansible playbooks
    ['helm',              3],  // Helm charts
    ['circleci',          3],  // CircleCI config
    ['docker-compose',    2],  // Compose = likely app + infra mixed
    ['nginx.conf',        2],  // Server config
    ['Dockerfile',        1],  // Weak — almost every backend has one
    ['deploy',            1],  // Weak — deploy scripts are everywhere
  ],

  Frontend: [
    ['src/components',    3],  // React/Vue component directory
    ['src/pages',         3],  // Next.js / SvelteKit pages
    ['src/views',         3],  // Vue views
    ['next.config',       3],  // Next.js config
    ['nuxt.config',       3],  // Nuxt config
    ['angular.json',      3],  // Angular workspace
    ['svelte.config',     3],  // SvelteKit config
    ['.tsx',              2],  // TypeScript JSX — likely React
    ['.jsx',              2],  // JSX — likely React
    ['.vue',              2],  // Vue SFCs
    ['.svelte',           2],  // Svelte components
    ['vite.config',       2],  // Vite bundler
    ['tailwind.config',   2],  // Tailwind — almost always frontend
    ['postcss.config',    1],  // Could be frontend or backend
    ['index.html',        1],  // Weak — could be docs
    ['public/index',      1],  // Weak
  ],

  Backend: [
    ['controllers/',      3],  // MVC controller layer
    ['models/',           3],  // Data models
    ['routes/',           3],  // Route definitions
    ['migrations/',       3],  // DB migrations
    ['schema.prisma',     3],  // Prisma ORM schema
    ['schema.graphql',    3],  // GraphQL schema
    ['pom.xml',           3],  // Maven — Java backend
    ['build.gradle',      3],  // Gradle — Java/Kotlin backend
    ['manage.py',         3],  // Django management
    ['wsgi.py',           3],  // Python WSGI app
    ['asgi.py',           3],  // Python ASGI app
    ['middleware/',        2],  // Express/Laravel middleware
    ['seeders/',          2],  // DB seeders
    ['main.py',           2],  // Python entry point
    ['server.js',         2],  // Node server entry
    ['app.js',            2],  // Node app entry
    ['.env.example',      1],  // Weak — present in many projects
  ],
};

// Priority order for stable tie-breaking.
// When two natures have the same score, the one with lower index wins.
const PRIORITY = ['Backend', 'Frontend', 'DevOps', 'General'];

/**
 * Detect the primary nature of a project.
 *
 * @param {string[]} fileList - Array of file paths from the repo tree
 * @returns {{ nature: string, confidence: number, scores: object, weightedScores: object }}
 */
const detectProjectNature = (fileList) => {
  const combined = fileList.join(' ');

  // ── Step 1: compute raw match count AND weighted score per nature ──────────
  const scores         = {};
  const weightedScores = {};

  for (const [nature, signals] of Object.entries(WEIGHTED_SIGNATURES)) {
    let rawCount    = 0;
    let weightedSum = 0;

    for (const [pattern, weight] of signals) {
      if (combined.includes(pattern)) {
        rawCount    += 1;
        weightedSum += weight;
      }
    }

    scores[nature]         = rawCount;
    weightedScores[nature] = weightedSum;
  }

  // ── Step 2: DevOps demotion rule ──────────────────────────────────────────
  // If Backend or Frontend have ANY signals, reduce DevOps weighted score
  // by the sum of those signals. This prevents a Dockerfile from hijacking
  // a Backend classification.
  const appSignals = (weightedScores.Backend || 0) + (weightedScores.Frontend || 0);
  if (appSignals > 0 && weightedScores.DevOps > 0) {
    weightedScores.DevOps = Math.max(0, weightedScores.DevOps - appSignals);
  }

  // ── Step 3: find winner using weighted scores, with priority tie-breaking ──
  let winner     = 'General';
  let topScore   = 0;

  for (const nature of PRIORITY) {
    const ws = weightedScores[nature] || 0;
    if (ws > topScore) {
      topScore = ws;
      winner   = nature;
    }
    // equal score: PRIORITY order already handles this since we iterate in order
    // and only update winner if strictly greater
  }

  // ── Step 4: confidence as % of winner's weighted score vs total ───────────
  const totalWeighted = Object.values(weightedScores).reduce((a, b) => a + b, 0);
  const confidence    = totalWeighted > 0
    ? Math.round((topScore / totalWeighted) * 100)
    : 0;

  return {
    nature:   winner,
    confidence,
    scores,          // raw match counts (for debugging)
    weightedScores,  // weighted scores after demotion (for debugging)
  };
};

module.exports = { detectProjectNature };