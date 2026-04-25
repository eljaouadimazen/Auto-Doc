# Auto-Doc Documentation
---
## Purpose

Auto-Doc is a secure AI-powered documentation generator for GitHub repositories, now powered by an agentic multi-agent system aligned with AST parsing and built using Object-Oriented Programming (OOP) principles. It fetches a public repository, analyzes its code structure through specialized agents, sanitizes sensitive data using entropy-based detection and custom rules, and generates professional documentation via Groq or OpenAI LLMs.

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

# Optional — only needed for CI/CD headless mode
REPO_URL=https://github.com/yourusername/your-repo
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

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/fetch` | Fetch and sanitize a GitHub repo |
| POST | `/build` | Build LLM input from raw markdown |
| POST | `/generate-docs` | Call Groq LLM and return documentation |
| POST | `/generate` | Full pipeline in one request |
| POST | `/validate-key` | Validate a Groq API key via /models endpoint |
| GET | `/audit` | Retrieve sanitization audit logs |
| GET | `/rules` | List custom sanitization rules |
| POST | `/rules` | Add a custom sanitization rule |
| DELETE | `/rules/:id` | Remove a custom rule |
| POST | `/rules/test` | Test a regex pattern against sample text |
| GET | `/health` | Health check |