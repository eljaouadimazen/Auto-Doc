# Auto-Doc Documentation
---
## Purpose

Auto-Doc is a secure AI-powered documentation generator for GitHub repositories, now powered by an agentic multi-agent system aligned with AST parsing and built using Object-Oriented Programming (OOP) principles. It fetches a public repository, analyzes its code structure through specialized agents, sanitizes sensitive data using entropy-based detection and custom rules, and generates professional documentation via Groq, Gemini, OpenRouter, or local Ollama LLMs.

## Documentation Sections

- [Architecture](ARCHITECTURE.md) — system layers, OOP domain models, and agentic data flow
- [OOP Architecture & Multi-Agent System](OOP_ARCHITECTURE.md) — detailed OOP models, agents, and orchestration
- [Workflow](WORKFLOW.md) — agentic pipeline description with orchestrator roles
- [Security](SECURITY.md) — agent-level secret detection, entropy-based sanitization, and audit trails
- [CI/CD Pipeline](CI-CD.md) — GitHub Actions automation


---

## Quick Start

### Prerequisites

Make sure you have the following tools installed before starting:

- **Node.js** v18 or higher — [https://nodejs.org](https://nodejs.org)
- **npm** v8 or higher (comes with Node.js)
- **Git** — [https://git-scm.com](https://git-scm.com)
- A free **Groq API key** — [https://console.groq.com/keys](https://console.groq.com/keys)
- *(Optional)* A **GitHub Personal Access Token** — increases GitHub API rate limit from 60 to 5000 requests/hour. Generate one at [https://github.com/settings/tokens](https://github.com/settings/tokens) with `repo` scope.

---

### 1. Clone the repository

```bash
git clone https://github.com/eljaouadimazen/Auto-Doc.git
cd Auto-Doc
```

---

### 2. Install dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

---

### 3. Set up environment variables

```bash
# Copy the example file to devops/.env (IMPORTANT: not project root)
cp .env.example devops/.env
```

Then open `devops/.env` in your editor and fill in your keys. The system supports **4 LLM providers** (pick at least one):

```bash
# Groq (default, fast free tier) — get key at https://console.groq.com/keys
GROQ_API_KEY=gsk_your_groq_key_here

# Google Gemini (free tier)
# GEMINI_API_KEY=

# OpenRouter (pay-per-use, many models)
# OPENROUTER_API_KEY=

# Ollama (local, no key needed)
# OLLAMA_MODEL=tinyllama

# Optional — without this you are limited to 60 GitHub API requests/hour
GITHUB_TOKEN=github_pat_your_token_here
```

**How to get your Groq API key:**
1. Go to [https://console.groq.com/keys](https://console.groq.com/keys)
2. Sign up for a free account
3. Click **Create API Key**
4. Copy the key (starts with `gsk_`) and paste it as `GROQ_API_KEY`

**How to get your GitHub token (optional):**
1. Go to [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Select `repo` scope (read-only access is enough)
4. Copy and paste it as `GITHUB_TOKEN`

---

### 4. Run the application

Start both backend and frontend in separate terminals:

```bash
# Terminal 1: Backend (Express on port 3000)
npm run dev

# Terminal 2: Frontend (Vite on port 5173)
cd client && npm run dev
```

Then open http://localhost:5173 in your browser.

**Production build:**
```bash
cd client && npm run build    # builds to project root public/ folder
npm start                      # serves static frontend + API on port 3000
```

---

### 5. Generate your first documentation

1. Select your LLM provider (Groq, Gemini, OpenRouter, or Local Ollama)
2. Paste your API key in the key field (not needed for Ollama)
3. Paste a public GitHub repository URL (e.g. `https://github.com/expressjs/express`)
4. Click **Fetch Repo** → **Build Input** → **Generate Docs**

---

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/fetch` | Fetch and sanitize a GitHub repo |
| POST | `/build` | Build LLM input from raw markdown |
| POST | `/generate-docs` | Call Groq LLM and return documentation |
| POST | `/generate` | Full pipeline in one request |
| POST | `/analyze-nature` | Classify project nature via RepoAnalyzerAgent |
| POST | `/publish` | Publish documentation to GitHub Pages (creates/updates `gh-pages` branch) |
| GET | `/job/:jobId` | Poll status of async doc generation job (graphify-backed) |
| POST | `/validate-key` | Validate an API key for the chosen provider |
| GET | `/audit` | Retrieve sanitization audit logs |
| GET | `/rules` | List custom sanitization rules |
| POST | `/rules` | Add a custom sanitization rule |
| DELETE | `/rules/:id` | Remove a custom rule |
| POST | `/rules/test` | Test a regex pattern against sample text |
| GET | `/health` | Health check |

---

## Pre-Commit Hooks (Husky + lint-staged)

The project uses **Husky** for Git hooks and **lint-staged** for running ESLint on staged files.

### Configuration

| File | Purpose |
|------|---------|
| `prepare: "husky"` in package.json | Installs Husky on `npm install` |
| `lint-staged` config in package.json | Defines which files to lint |

### What It Does

On `git commit`:
1. **Backend files** (`src/**/*.js`) → Runs `eslint --fix`
2. **Frontend files** (`client/src/**/*.{js,jsx}`) → Runs `eslint --fix --config client/eslint.config.js`

### Bypassing (if needed)

```bash
git commit --no-verify
```

---

## Render.com Deployment

A `render.yaml` file exists for one-click deployment to [Render.com](https://render.com).

### Setup

1. Go to [render.com/new/blueprint](https://render.com/new/blueprint)
2. Connect your GitHub repository
3. Render will detect `render.yaml` and configure the services

### What render.yaml Defines

| Resource | Type | Description |
|----------|------|-------------|
| `backend` | Web Service | Express API (Node.js) on port 3000 |
| `frontend` | Static Site | Vite build → static files |

### Required Environment Variables

Set these in Render dashboard for the backend service:

| Variable | Value |
|----------|-------|
| `GROQ_API_KEY` | Your Groq API key |
| `GITHUB_TOKEN` | Optional, for higher GitHub API rate limit |
| `GEMINI_API_KEY` | Optional, for Gemini provider |
| `OPENROUTER_API_KEY` | Optional, for OpenRouter provider |
