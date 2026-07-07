# Architecture

## Overview

Auto-Doc uses a three-layer architecture combining local code processing, cloud-based AI generation, and automated publishing. The entire stack runs on Node.js with Express.

---

## Layer 1 — Local Processing Layer

Runs entirely on the server. No sensitive data leaves this layer unfiltered.

**Responsibilities:**
- Fetch repository content from GitHub via Octokit REST API
- Parse code structure using a custom regex-based AST parser (no ts-morph, no external parser dependency)
- Detect and redact sensitive data using 34 built-in regex patterns + Shannon entropy detection
- Build structured LLM prompts (AST mode or raw mode)
- Log every sanitization event to the in-memory audit log

**Technologies:**
- Node.js / Express
- @octokit/rest — GitHub API client (encapsulated in `Repository` model)
- Custom `ASTParserService` — regex-based JS/TS and Python parser
- Custom `SanitizerService` + `SanitizerSession` — secret detection with vault tokenization
- Custom `LLMInputBuilderService` — prompt construction
- `AuditLog` model — per-repository in-memory audit trail
- Custom `RateLimiter` — sliding window rate limiting (no Redis needed)
- `LogSanitizer` — global console.error secret stripping

---

## Layer 2 — Cloud AI Layer

Receives only sanitized, structured summaries. Never receives raw secrets.

**Responsibilities:**
- Accept structured prompt messages from the local layer
- Generate professional documentation using LLM

**Supported Providers (4):**

| Provider | Library | Default Model |
|----------|---------|---------------|
| **Groq** (default) | `@langchain/groq` | `llama-3.3-70b-versatile` |
| **Gemini** | `@langchain/google-genai` | `gemini-2.0-flash` |
| **OpenRouter** | OpenAI-compatible | `meta-llama/llama-3.3-70b-instruct` |
| **Ollama** | Local, no API key | `tinyllama` (configurable) |

**Key security property:** The prompt sent to LLM contains only AST summaries and vault tokens — never raw file contents with secrets.

---

## Layer 3 — Publishing Layer

**Responsibilities:**
- Write generated documentation to `docs/` directory
- Deploy automatically to GitHub Pages via CI/CD

**Technologies:**
- GitHub Actions — automation pipeline
- GitHub Pages — static hosting
- `peaceiris/actions-gh-pages` — deployment action

---

## Service Architecture

**Note:** GitHub fetching is built into the `Repository` model (`src/models/repository.model.js`) using Octokit directly. There is NO separate `github.service.js`.

```
src/
├── app.js                          ← Express server, routes, middleware
├── controllers/
│   └── generator.controller.js     ← Pipeline orchestration, API key handling
├── models/                         ← OOP Domain Models (5 files)
│   ├── user.model.js               ← User context + API key validation
│   ├── repository.model.js         ← GitHub fetching + aggregate root
│   ├── project-file.model.js       ← File entity with AST extraction
│   ├── audit-log.model.js          ← Per-repo in-memory audit trail
│   └── documentation.model.js      ← Generated doc artifact
├── agents/                         ← Multi-Agent System (9 files)
│   ├── base.agent.js               ← Abstract base (LLM, retry, tracing)
│   ├── protocol.js                 ← AgentInput/AgentOutput contract
│   ├── orchestrator.agent.js       ← EnforcedOrchestrator pipeline
│   ├── code-intelligence.agent.js  ← LLM-powered code understanding
│   ├── security.agent.js           ← Semantic secret detection
│   ├── writer.agent.js             ← Documentation generation
│   ├── repo-analyzer.agent.js      ← Project classification
│   ├── template-selector.agent.js  ← Template selection (unused in pipeline)
│   └── diagram.agent.js            ← Mermaid diagram generation
└── services/
    ├── sanitizer.service.js        ← Pattern registry + session factory (48 patterns)
    ├── sanitizer-session.js        ← Per-request vault for tokenization
    ├── sanitizer-session-store.js  ← Session persistence across HTTP requests
    ├── audit-store.service.js      ← Audit log storage by session ID
    ├── log-sanitizer.js            ← Global console.error secret stripping
    ├── ast-parser.service.js       ← Regex-based JS/TS/Python parser
    ├── llm-input-builder.service.js ← Prompt builder (AST + raw modes, chunks)
    ├── llm.service.js              ← 4-provider LLM client
    ├── diagram.service.js          ← High-signal file selector for diagrams
    ├── graph.service.js            ← Knowledge graph querying (graphify output)
    ├── job-queue.service.js        ← Async job management with 1hr TTL
    ├── pdf-generator.service.js    ← Puppeteer-based PDF generation
    ├── publisher.service.js        ← GitHub Pages deployment via Octokit
    ├── viewer-generator.service.js ← HTML doc viewer generator
    └── rate-limiter.middleware.js  ← Sliding window rate limiter
```

---

## Data Flow

```
GitHub URL
    ↓
Repository model          → Octokit fetch, base64 decode (NO github.service.js)
    ↓
SanitizerSession          → anoynmize() vault-based tokenization (regex + entropy)
    ↓

┌── Agentic Mode ────────────────────────────────────────┐
│ EnforcedOrchestrator:                                   │
│   1. Filter high-signal files (.js, .ts, .py, etc.)    │
│   2. Security gate (regex audit + SecurityAgent)        │
│   3. [Optional] graphify → knowledge graph             │
│   4. RepoAnalyzerAgent (project nature classification)  │
│   5. selectTemplate() (deterministic)                   │
│   6. DiagramAgent (two-pass Mermaid generation)         │
│   7. CodeIntelligenceAgent (semantic understanding)     │
│   8. WriterAgent (parallel section generation)          │
└────────────────────────────────────────────────────────┘
                      │
┌── Classic Mode ─────────────────────────────────────────┐
│ ast-parser.service.js → Extract syntax signatures       │
│ llm-input-builder.service.js → Build prompt (chunks)    │
│ llm.service.js → POST to configured LLM (Groq/Gemini/… )│
└────────────────────────────────────────────────────────┘
    ↓
SanitizerSession          → reintegrate() swaps vault tokens back to original values
    ↓
Documentation output      → Returned to client, saved to disk, or published to Pages
```

---

## Two Operating Modes

### AST Mode (default)
The AST parser extracts structural signatures from each file — class names, method signatures, Express routes, imports, and env var accesses. These compact summaries replace raw file contents in the prompt, reducing token usage by ~95% while giving the LLM higher-quality structural information.

### Raw Mode
Files are truncated to a token budget (`MAX_FILE_CHARS = 3000`, `MAX_TOTAL_CHARS = 20000`) and sent as-is. Used as fallback when AST parsing is not available or toggled off by the user.

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/fetch` | 10 requests | 15 minutes |
| `/build` | 20 requests | 15 minutes |
| `/generate-docs` | 10 requests | 15 minutes |
| All others | 60 requests | 15 minutes |

---

## Docker Deployment

**Files in `devops/`:**

| File | Purpose |
|------|---------|
| `Dockerfile.backend` | Express backend container |
| `Dockerfile.frontend` | Multi-stage build: Vite build → nginx serve |
| `docker-compose.yml` | Full stack orchestration |

### Dockerfile.backend

Node.js-based container for the Express API:
- Base: `node:20-alpine`
- Exposes port 3000
- Runs `npm start` as entry point

### Dockerfile.frontend

Multi-stage build for optimized frontend:
1. **Build stage**: `node:20-alpine` → runs `npm run build`
2. **Serve stage**: `nginx:alpine` → serves static files from `public/`
- Exposes port 80

### docker-compose.yml

Orchestrates both services:
```yaml
services:
  backend:
    build:
      context: ..
      dockerfile: devops/Dockerfile.backend
    ports:
      - "3000:3000"
    environment:
      - GROQ_API_KEY=${GROQ_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - GITHUB_TOKEN=${GITHUB_TOKEN}

  frontend:
    build:
      context: ..
      dockerfile: devops/Dockerfile.frontend
    ports:
      - "80:80"
    depends_on:
      - backend
```

### Running with Docker Compose

```bash
# Build and start
cd devops
docker-compose up --build

# Stop
docker-compose down
```

**Note:** Environment variables must be set in `devops/.env` before running.
