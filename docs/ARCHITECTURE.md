# Architecture

## Overview

Auto-Doc uses a three-layer architecture combining local code processing, cloud-based AI generation, and automated publishing. The entire stack runs on Node.js with Express.

---

## Layer 1 — Local Processing Layer

Runs entirely on the server. No sensitive data leaves this layer unfiltered.

**Responsibilities:**
- Fetch repository content from GitHub via Octokit REST API (encapsulated in `Repository` model)
- Parse code structure using a custom regex-based AST parser (no ts-morph, no external parser dependency)
- Detect and redact sensitive data using 47+ built-in regex patterns (context-aware to reduce false positives)
- Build structured LLM prompts (AST mode or raw mode)
- Log every sanitization event to the persistent SQLite audit log (`data/audit-log.db`)

**Technologies:**
- Node.js / Express
- @octokit/rest — GitHub API client (encapsulated in `Repository` model)
- Custom `ASTParserService` — regex-based JS/TS and Python parser
- Custom `SanitizerService` — secret detection and redaction (per-session vault)
- Custom `LLMInputBuilderService` — prompt construction
- Custom `AuditStoreService` — SQLite-persisted audit trail with auto-eviction
- Custom `LLMProviderService` — shared provider config (Groq, Gemini, OpenRouter, Ollama)
- Custom `LogSanitizer` — global console.error secret stripping
- Custom `RateLimiter` — sliding window rate limiting (no Redis needed)

---

## Layer 2 — Cloud AI Layer

Receives only sanitized, structured summaries. Never receives raw secrets.

**Responsibilities:**
- Accept structured prompt messages from the local layer
- Generate professional documentation using LLM

**Technologies:**
- Groq API (`llama-3.3-70b-versatile`)
- Google Gemini (`gemini-1.5-flash` / `gemini-2.0-flash`)
- OpenRouter (`meta-llama/llama-3.3-70b-instruct`)
- Ollama (local — `tinyllama`)
- `LLMProviderService` — shared HTTP/SDK client with retry logic
- `LLMService` — high-level generate/validate API

**Key security property:** The prompt sent to Groq contains only AST summaries (function names, class names, routes, imports, env var names) — never raw file contents with secrets.

---

## Layer 3 — Publishing Layer

**Responsibilities:**
- Write generated documentation to `docs/` directory
- Deploy automatically to GitHub Pages via CI/CD
- Build and push Docker images (backend + frontend) with Trivy vulnerability scanning

**Technologies:**
- GitHub Actions — automation pipeline (`generate-docs.yml`)
- GitHub Pages — static hosting
- Docker Hub — container image registry (`docker-ci.yml`)
- Trivy — container vulnerability scanner
- `peaceiris/actions-gh-pages` — deployment action

---

## Service Architecture

```
src/
├── app.js                          ← Express server, routes, middleware, helmet, CORS
├── controllers/
│   └── generator.controller.js     ← Pipeline orchestration, API key handling
├── models/                         ← OOP domain models (Repository, User, ProjectFile, ...)
└── services/
    ├── sanitizer.service.js        ← Secret detection + redaction (per-session vault)
    ├── sanitizer-session.js        ← Per-request vault isolation
    ├── sanitizer-session-store.js  ← Session lifecycle management
    ├── audit-store.service.js      ← SQLite-persisted audit log with auto-eviction
    ├── llm-provider.service.js     ← Shared provider config (Groq/Gemini/OpenRouter/Ollama) + retry
    ├── llm.service.js              ← High-level generate/validate API
    ├── ast-parser.service.js       ← JS/TS/Python AST extraction
    ├── llm-input-builder.service.js ← Prompt builder (AST + raw modes)
    ├── log-sanitizer.js            ← Global console.error secret stripping
    └── rate-limiter.middleware.js  ← Sliding window rate limiter
```

---

## Data Flow

```
GitHub URL
    ↓
Repository.FetchFiles()     → Fetch repo via Octokit, decode base64 files
    ↓
SanitizerService.anonymize() → Redact secrets (47+ patterns), vault tokenization
    ↓
ASTParserService            → Extract classes, functions, routes, imports, env vars
    ↓
LLMInputBuilderService      → Build structured prompt (AST or raw mode)
    ↓
LLMService.generate()       → POST to provider API via shared LLMProviderService
    ↓
Documentation output        → Returned to client or written to docs/
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

## Per-Endpoint Body Size Limits

| Endpoint | Max Body | Reason |
|----------|----------|--------|
| `/fetch` | 2 MB | Small GitHub URL payload |
| `/build` | 15 MB | Large file content |
| `/generate-docs` | 2 MB | Chunked messages |
| `/validate-key` | 100 KB | Single API key string |
| `/rules` POST | 10 KB | Single regex pattern |
| `/rules/test` | 100 KB | Sample text |