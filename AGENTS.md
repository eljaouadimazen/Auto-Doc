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

# CI install (used in workflow)
npm ci --legacy-peer-deps
```

## Key quirks
- **Vite proxy**: `/fetch`, `/build`, `/generate`, `/generate-docs`, `/validate-key`, `/audit`, `/rules`, `/health` → `localhost:3000`
- **Frontend build output**: `client/vite.config.js` sets `outDir: '../public'`; backend serves this static dir
- **No test suite**: `npm test` exits with error

## Environment
- `GROQ_API_KEY` (required) — Groq API key for LLM access
- `GITHUB_TOKEN` (optional) — raises GitHub API rate limit from 60 to 5000 req/hour
- `GROQ_MODEL` (optional, default `llama-3.3-70b-versatile`)
- `REPO_URL` (optional, used in CI headless mode)
- `LANGSMITH_*` (optional) — LangChain tracing: `LANGSMITH_TRACING`, `LANGSMITH_ENDPOINT`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`
- `graphifyy` (required for graph-backed generation) — Python CLI, install via `uv tool install graphifyy`; replaced the old Pinecone vector DB
- `GRAPHFIY_TIMEOUT` (optional, default `300000`) — ms timeout for graphify pass

## Async jobs
- **`GET /job/:jobId`** — poll for status of async doc generation (used when `githubUrl` is provided in agentic mode; graphify + LLM pipeline can take minutes)
- Job results expire after 1 hour

## Future caching
- **`src/agents/orchestrator.agent.js`**: TODO — cache graph results by repo URL + commit SHA to avoid re-running graphify on repeated requests for the same repo version

## Docs
- Architecture: `ARCHITECTURE.md`, `OOP_ARCHITECTURE.md`, `WORKFLOW.md`, `SECURITY.md`
- API endpoints listed in `README.md`
- CI/CD details in `CI-CD.md`
