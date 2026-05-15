# AGENTS.md

## Structure
- **Backend**: Express.js, entrypoint `src/app.js`, port 3000, CommonJS (`require`)
- **Frontend**: React + Vite in `client/`, entrypoint `client/src/main.jsx`, dev server on port 5173, ESM (`import`)
- **Agents**: `src/agents/` — orchestrator, repo-analyzer, writer, diagram, template-selector, code-intelligence, base, protocol
- **Tests**: `tests/**/*.test.js`, Jest with `node` environment, coverage thresholds at 30%

## Commands
```bash
# Backend
npm start              # production
npm run dev            # dev with nodemon (kills port 3000 via fuser first)
npm run lint           # ESLint check
npm test               # Jest tests (verbose)
npm run test:coverage  # Jest with coverage report

# Frontend (run from client/)
cd client && npm run dev     # Vite dev server, proxies /fetch, /build, etc. to :3000
cd client && npm run build   # outputs to client/public/ (not client/dist)
cd client && npm run lint    # ESLint check

# CI docs generation
npm run generate:ci          # requires GROQ_API_KEY + REPO_URL in devops/.env

# CI install (required for clean installs)
npm ci --legacy-peer-deps
```

## Key quirks
- **Env loading**: `dotenv` loads from `devops/.env`, NOT project root — affects both app and scripts
- **Module systems**: Backend is CJS (`require`), frontend is ESM (`import`) — `client/package.json` has `"type": "module"`
- **Pre-commit hooks** (husky + lint-staged): blocks trailing whitespace, missing EOF newline, merge conflict markers, private keys (`BEGIN * PRIVATE KEY`); validates JSON (not lockfiles) and YAML (tabs forbidden) syntax; then runs `eslint --fix` on staged backend/frontend files. Bypass with `--no-verify`.
- **Rate limiter**: In-memory per-IP sliding window — `/fetch` and `/generate-docs` 10/15min, `/build` 20/15min, default 60/15min
- **Audit log persistence**: SQLite DB at `data/audit-log.db`

## Agent pipeline
Orchestrator stages (in `orchestrator.agent.js`):
1. Filter high-signal files
2. Security gate (pass-through — Layer 1 handles sanitization)
3. RepoAnalyzer → 4. TemplateSelector → 5. CodeIntelligence → 6. Writer → 7. Diagram

All agents communicate via `protocol.js` (`buildInput`, `buildSuccess`, `buildFailure`, `buildSkipped`, `validateOutput`).

## Semantic diff gate
`scripts/semantic-diff.js` compares AST signatures (classes, methods, routes, imports, exports, env vars) between commits. Only structural changes trigger doc regeneration. Set `FORCE=true` to override.

## Docker
- Dockerfiles in `devops/` (not root): `Dockerfile.backend` (Express) and `Dockerfile.frontend` (Nginx-static)
- Docker Hub images: `mazeneljaouadi/safe-file-generator` (backend), `mazeneljaouadi/safe-file-generator-frontend`
- CI builds, Trivy-scans (HIGH/CRITICAL severity), and pushes on push to main/master/dev

## Environment (from `devops/.env`)
Pick at least one LLM provider: `GROQ_API_KEY` (default), `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or `OLLAMA_MODEL` (local, no key). See `.env.example` for full list including `GITHUB_TOKEN`, model overrides, LangSmith tracing, and Pinecone vector DB.
