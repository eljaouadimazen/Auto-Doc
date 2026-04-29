  # CI/CD Pipeline

  ## Overview

  Auto-Doc uses a two-layer smart triggering system built on GitHub Actions. The pipeline only generates documentation when the code structure actually changed — not on every push.

  The pipeline supports **two documentation modes**:
  - **Agentic** (default) — Multi-agent orchestrator pipeline with 7 specialized stages: repo analysis, template selection, security gate, code intelligence, diagram generation, and final writing
  - **Classic** — AST-based structural parsing → chunked LLM calls → merged output

  ---

  ## Trigger Conditions

  ### Layer 1 — GitHub Path Filter

  The pipeline only starts if at least one of these paths changed:
  - `src/**`
  - `scripts/**`
  - `package.json`
  - `package-lock.json`

  Pushes that only modify docs, images, or config files never trigger the pipeline.

  ### Layer 2 — Semantic Diff (scripts/semantic-diff.js)

  Even when Layer 1 passes, the pipeline performs an AST-level comparison between the previous commit and the current one.

  For each changed `.js`, `.ts`, or `.py` file, it extracts a structural fingerprint:

  ```
  fingerprint = class names + method signatures + Express routes + imports + env vars
  ```

  If the fingerprint is identical between commits, the change was internal logic only (variable renames, bug fixes, refactoring) and the existing documentation is still accurate — the pipeline skips generation.

  If the fingerprint differs, a structural change was detected and documentation is regenerated.

  **Examples:**

  | Change | Result |
  |--------|--------|
  | `const x = 1` → `const x = 2` | SKIP — internal logic |
  | `console.log('a')` → `console.log('b')` | SKIP — cosmetic |
  | `function foo()` → `function foo(options)` | GENERATE — signature changed |
  | New Express route added | GENERATE — structural change |
  | New `require()` import | GENERATE — dependency changed |
  | New `process.env.VAR` access | GENERATE — config changed |

  ---

  ## Pipeline Steps

  ```yaml
  1. Checkout repository (fetch-depth: 2 for diff comparison)
  2. Setup Node.js 20 with npm cache
  3. npm ci
  4. Semantic diff check → sets skip=true/false output
  5. Generate documentation (if skip=false)
     - Runs scripts/generate-docs-ci.js
     - Uses Repository model to fetch files via Octokit
     - Runs security audit via AuditLog model + SanitizerService
     - Mode "agentic": EnforcedOrchestrator runs 7-stage agent pipeline
     - Mode "classic": LLMInputBuilder chunks → LLMService generates per chunk
     - Env: GROQ_API_KEY, GITHUB_TOKEN, REPO_URL, GROQ_MODEL, DOC_MODE, DOC_PROVIDER
  6. Deploy to GitHub Pages (if skip=false)
     - peaceiris/actions-gh-pages@v3
     - Publishes docs/ to gh-pages branch
  7. Pipeline summary
     - Written to GitHub Actions job summary
     - Shows mode used, what changed, what was skipped, live URL
  ```

  ---

  ## Documentation Modes

  ### Agentic Mode (default)

  Uses the `EnforcedOrchestrator` which coordinates 7 specialized agents:

  | Stage | Agent | Purpose |
  |-------|-------|---------|
  | 1 | Filter | Select high-signal files from the repo |
  | 2 | SecurityAgent | Vault-anonymize secrets, confirm findings |
  | 3 | RepoAnalyzerAgent | Classify project nature and detect logic signals |
  | 4 | TemplateSelectorAgent | Choose the best documentation template + diagram type |
  | 5 | CodeIntelligenceAgent | Deep file-level structural analysis |
  | 6 | WriterAgent | Generate final documentation from all agent outputs |
  | 7 | DiagramAgent | Generate architecture diagrams (if applicable) |

  All agents communicate via the standardized `protocol.js` contract (`AgentInput` → `AgentOutput`).

  ### Classic Mode

  Uses the original AST-based pipeline:
  1. Parse files through `LLMInputBuilder` (AST structural summaries)
  2. Chunk files into rate-limit-safe batches
  3. Send each chunk to `LLMService` for documentation generation
  4. Merge chunk outputs into a single document

  ---

  ## Manual Trigger

  The pipeline can be triggered manually from the GitHub Actions UI regardless of what changed:

  ```
  GitHub → Actions → Auto-Doc - Generate and Publish Documentation
  → Run workflow → Branch: dev → Force: true → Mode: agentic/classic → Run workflow
  ```

  Setting `force: true` bypasses the semantic diff check and always generates docs.
  Setting `doc_mode` lets you choose between `agentic` (multi-agent) and `classic` (AST + LLM chunks).

  ---

  ## Output Files

  Each successful run writes these files to `docs/`:

  | File | Description |
  |------|-------------|
  | `README.md` | Main generated documentation in markdown |
  | `index.html` | Styled GitHub Pages version of the docs |
  | `SECURITY.md` | Sanitization audit report for this run |
  | `pipeline-meta.json` | Run metadata: timestamp, mode, model, files analyzed, stats |

  ---

  ## Architecture (OOP)

  The CI script uses the same OOP domain models as the main application:

  ```
  scripts/generate-docs-ci.js
    └── Repository model          → FetchFiles() via Octokit
        ├── ProjectFile model     → Individual file representation
        ├── AuditLog model        → Track sanitization findings
        ├── SanitizerService      → Vault-based secret anonymization
        └── GenerateDocumentation(mode, provider)
            ├── "agentic" → EnforcedOrchestrator → 7 agents
            └── "classic" → LLMInputBuilder → LLMService chunks
  ```

  ---

  ## Environment Variables Required

  | Variable | Where | Description |
  |----------|-------|-------------|
  | `GROQ_API_KEY` | GitHub Secrets | Groq API key for LLM generation |
  | `GITHUB_TOKEN` | Auto-injected | GitHub token for repo access and Pages deployment |
  | `REPO_URL` | Workflow env | Set automatically from `github.server_url/github.repository` |
  | `GROQ_MODEL` | Workflow env | Set to `llama-3.3-70b-versatile` |
  | `DOC_MODE` | Workflow env | `agentic` (default) or `classic` |
  | `DOC_PROVIDER` | Workflow env | `groq` (default) — LLM provider |

  ---

  ## GitHub Pages Setup

  After the first successful pipeline run, enable Pages:

  ```
  GitHub → Settings → Pages
  Source: Deploy from a branch
  Branch: gh-pages / root → Save
  ```

  Live documentation URL: `https://<username>.github.io/<repo-name>/`
