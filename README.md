# Auto-Doc Documentation
---
## Purpose

Auto-Doc is a secure AI-powered documentation generator for GitHub repositories, now powered by an agentic multi-agent system aligned with AST parsing and built using Object-Oriented Programming (OOP) principles. It fetches a public repository, analyzes its code structure through specialized agents, sanitizes sensitive data using 47+ regex patterns with per-session vault tokenization, and generates professional documentation via Groq, Gemini, OpenRouter, or local Ollama LLMs.

## Documentation Sections

- [Architecture](docs/ARCHITECTURE.md) — system layers, OOP domain models, and agentic data flow
- [OOP Architecture & Multi-Agent System](docs/OOP_ARCHITECTURE.md) — detailed OOP models, agents, and orchestration
- [Workflow](docs/WORKFLOW.md) — agentic pipeline description with orchestrator roles
- [Security](docs/SECURITY.md) — secret detection, vault sanitization, and audit trails
- [Security Threat Model](SECURITY-THREAT-MODEL.md) — trust boundary diagrams and data flow
- [Known Limitations](LIMITATIONS.md) — documented trade-offs and constraints
- [CI/CD Pipeline](docs/CI-CD.md) — GitHub Actions automation


---

## Quick Start

### Prerequisites

Make sure you have the following tools installed before starting:

- **Node.js** v18 or higher — [https://nodejs.org](https://nodejs.org)
- **npm** v8 or higher (comes with Node.js)
- **Git** — [https://git-scm.com](https://git-scm.com)
- A free **Groq API key** — [https://console.groq.com/keys](https://console.groq.com/keys)
- *(Optional)* A **Google Gemini API key** — [https://ai.google.dev/gemini-api](https://ai.google.dev/gemini-api)
- *(Optional)* An **OpenRouter API key** — [https://openrouter.ai](https://openrouter.ai)
- *(Optional)* **Ollama** installed locally — [https://ollama.com](https://ollama.com) (no key needed)
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
# Copy the example file
cp .env.example .env
```

Then open `.env` in your editor and fill in your keys:

```bash
# Required — get your free key at https://console.groq.com/keys
GROQ_API_KEY=gsk_your_groq_key_here

# Optional — without this you are limited to 60 GitHub API requests/hour
GITHUB_TOKEN=github_pat_your_token_here

# Optional — defaults to llama-3.3-70b-versatile if not set
GROQ_MODEL=llama-3.3-70b-versatile

# Optional — Gemini API key for alternative provider
GEMINI_API_KEY=your_gemini_key_here

# Optional — Gemini model, defaults to gemini-2.0-flash
GEMINI_MODEL=gemini-2.0-flash

# Optional — OpenRouter API key for alternative provider
OPENROUTER_API_KEY=your_openrouter_key_here

# Optional — OpenRouter model, defaults to meta-llama/llama-3.3-70b-instruct
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct

# Optional — Ollama model, defaults to tinyllama
OLLAMA_MODEL=tinyllama

# Optional — comma-separated allowed CORS origins (default: localhost:5173, localhost:3000)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Optional — only needed for CI/CD headless mode
REPO_URL=https://github.com/yourusername/your-repo

# Optional — CI documentation mode: agentic (default) or classic
DOC_MODE=agentic

# Optional — CI documentation provider: groq (default), gemini, openrouter
DOC_PROVIDER=groq
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


---

### 5. Generate your first documentation

1. Select **Cloud (Groq)** as your LLM provider
2. Paste your Groq API key in the key field
3. Paste a public GitHub repository URL (e.g. `https://github.com/expressjs/express`)
4. Click **Fetch Repo** → **Build Input** → **Generate Docs**

---

### Running the CI pipeline headlessly

To generate documentation without the web interface (used by GitHub Actions):

```bash
# Make sure GROQ_API_KEY and REPO_URL are set in .env
npm run generate:ci
```

Output is written to the `docs/` folder.

---

## Security

Auto-Doc implements multiple layers of protection:

- **Vault tokenization** — secrets are replaced with tokens before any data reaches the LLM; tokens are re-integrated locally after generation
- **47+ regex patterns** — detect API keys, database URIs, private keys, PII, and more (context-aware to reduce false positives)
- **SQLite audit log** — persistent, auto-evicting audit trail of all sanitization events
- **Security headers** — Helmet middleware sets CSP, HSTS, X-Frame-Options, and more
- **CORS** — restricted origins, configurable via `ALLOWED_ORIGINS`
- **Per-endpoint body limits** — from 10 KB (rules) to 15 MB (build), beyond the global 10 MB limit
- **Log sanitization** — all `console.error` output is automatically stripped of secrets
- **Non-root Docker** — containers run as unprivileged user

See [SECURITY-THREAT-MODEL.md](SECURITY-THREAT-MODEL.md) for the full threat model and [LIMITATIONS.md](LIMITATIONS.md) for known constraints.

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/fetch` | Fetch and sanitize a GitHub repo |
| POST | `/build` | Build LLM input from raw markdown |
| POST | `/generate-docs` | Call Groq LLM and return documentation |
| POST | `/generate` | Full pipeline in one request |
| POST | `/validate-key` | Validate an API key for any provider (Groq/Gemini/OpenRouter) |
| GET | `/audit` | Retrieve persistent sanitization audit logs (SQLite-backed) |
| GET | `/rules` | List custom sanitization rules |
| POST | `/rules` | Add a custom sanitization rule |
| DELETE | `/rules/:id` | Remove a custom rule |
| POST | `/rules/test` | Test a regex pattern against sample text |
| GET | `/health` | Health check |