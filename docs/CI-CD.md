# CI/CD Pipeline

## Overview

Auto-Doc uses a two-layer smart triggering system built on GitHub Actions. The pipeline only generates documentation when the code structure actually changed — not on every push.

---

## Trigger Conditions

### Layer 1 — GitHub Path Filter

The pipeline only starts if at least one of these paths changed:
- `src/**`
- `package.json`
- `package-lock.json`

Pushes that only modify docs, scripts, or config files never trigger the pipeline.

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
   - Env: GROQ_API_KEY, GITHUB_TOKEN, REPO_URL, GROQ_MODEL
6. Deploy to GitHub Pages (if skip=false)
   - peaceiris/actions-gh-pages@v3
   - Publishes docs/ to gh-pages branch
7. Pipeline summary
   - Written to GitHub Actions job summary
   - Shows what changed, what was skipped, live URL
```

---

## Manual Trigger

The pipeline can be triggered manually from the GitHub Actions UI regardless of what changed:

```
GitHub → Actions → Auto-Doc - Generate and Publish Documentation
→ Run workflow → Branch: dev → Force: true → Run workflow
```

Setting `force: true` bypasses the semantic diff check and always generates docs.

---

## Output Files

Each successful run writes these files to `docs/`:

| File | Description |
|------|-------------|
| `README.md` | Main generated documentation in markdown |
| `index.html` | Styled GitHub Pages version of the docs |
| `SECURITY.md` | Sanitization audit report for this run |
| `pipeline-meta.json` | Run metadata: timestamp, model, files analyzed, redactions |

---

## Environment Variables Required

| Variable | Where | Description |
|----------|-------|-------------|
| `GROQ_API_KEY` | GitHub Secrets | Groq API key for LLM generation |
| `GITHUB_TOKEN` | Auto-injected | GitHub token for Pages deployment |
| `REPO_URL` | Workflow env | Set automatically from `github.server_url/github.repository` |
| `GROQ_MODEL` | Workflow env | Set to `llama-3.3-70b-versatile` |

---

## GitHub Pages Setup

After the first successful pipeline run, enable Pages:

```
GitHub → Settings → Pages
Source: Deploy from a branch
Branch: gh-pages / root → Save
```

Live documentation URL: `https://<username>.github.io/<repo-name>/`