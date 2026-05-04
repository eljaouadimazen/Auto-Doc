# AGENTS.md

## Structure
- **Backend**: Express.js, entrypoint `src/app.js`, port 3000
- **Frontend**: React + Vite in `client/`, entrypoint `client/src/main.jsx`, dev server on port 5173
- **Agents**: Multi-agent system in `src/agents/` — orchestrator, repo-analyzer, security, writer, diagram, template-selector, code-intelligence

## Commands
```bash
# Backend
npm start            # production
npm run dev          # dev with nodemon (runs fuser -k 3000/tcp first)

# Frontend
cd client && npm run dev      # Vite dev server, proxies API to :3000
cd client && npm run build    # outputs to ../public (not client/dist)
cd client && npm run lint     # ESLint check

# CI docs generation (requires GROQ_API_KEY and REPO_URL in .env)
npm run generate:ci

# CI install (used in workflow)
npm ci --legacy-peer-deps
```

## Key quirks
- **Vite proxy**: `/fetch`, `/build`, `/generate`, `/generate-docs`, `/validate-key`, `/audit`, `/rules`, `/health` → `localhost:3000`
- **Frontend build output**: `client/vite.config.js` sets `outDir: '../public'`; backend serves this static dir
- **No test suite**: `npm test` exits with error
- **Semantic diff gate**: `scripts/semantic-diff.js` compares structural changes across commits; `generate-docs.yml` skips doc regeneration when only internal logic changes. Set `FORCE=true` to override.
- **Doc generation mode**: `DOC_MODE=agentic|classic` controls multi-agent vs AST+LLM pipeline (default `agentic` in CI). `DOC_PROVIDER=groq|openai|gemini` selects LLM backend (default `groq`).

## Environment
- `GROQ_API_KEY` (required) — Groq API key for LLM access
- `GITHUB_TOKEN` (optional) — raises GitHub API rate limit from 60 to 5000 req/hour
- `GROQ_MODEL` (optional, default `llama-3.3-70b-versatile`)
- `REPO_URL` (optional, used in CI headless mode)
- `DOC_MODE`, `DOC_PROVIDER` — control CI doc generation (see Key quirks)
- `LANGSMITH_*` (optional) — LangChain tracing: `LANGSMITH_TRACING`, `LANGSMITH_ENDPOINT`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`
- `PINECONE_API_KEY`, `PINECONE_INDEX` (optional) — vector DB for code-intelligence agent

## Docs
- Architecture: `ARCHITECTURE.md`, `OOP_ARCHITECTURE.md`, `WORKFLOW.md`, `SECURITY.md`
- API endpoints listed in `README.md`
- Auto-generated docs deploy to GitHub Pages via `generate-docs.yml`
- CI/CD details in `CI-CD.md`
