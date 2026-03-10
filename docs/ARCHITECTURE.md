# Architecture

## Overview

Auto-Doc uses a three-layer architecture combining local code processing, cloud-based AI generation, and automated publishing. The entire stack runs on Node.js with Express.

---

## Layer 1 — Local Processing Layer

Runs entirely on the server. No sensitive data leaves this layer unfiltered.

**Responsibilities:**
- Fetch repository content from GitHub via Octokit REST API
- Parse code structure using a custom regex-based AST parser (no ts-morph, no external parser dependency)
- Detect and redact sensitive data using 20+ built-in regex patterns
- Build structured LLM prompts (AST mode or raw mode)
- Log every sanitization event to the in-memory audit log

**Technologies:**
- Node.js / Express
- @octokit/rest — GitHub API client
- Custom `ASTParserService` — regex-based JS/TS and Python parser
- Custom `SanitizerService` — secret detection and redaction
- Custom `LLMInputBuilderService` — prompt construction
- Custom `AuditLogService` — in-memory audit trail
- Custom `RateLimiter` — sliding window rate limiting (no Redis needed)

---

## Layer 2 — Cloud AI Layer

Receives only sanitized, structured summaries. Never receives raw secrets.

**Responsibilities:**
- Accept structured prompt messages from the local layer
- Generate professional documentation using LLM

**Technologies:**
- Groq API (`llama-3.3-70b-versatile` model)
- Axios — HTTP client for Groq API calls

**Key security property:** The prompt sent to Groq contains only AST summaries (function names, class names, routes, imports, env var names) — never raw file contents with secrets.

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

```
src/
├── app.js                          ← Express server, routes, middleware
├── controllers/
│   └── generator.controller.js     ← Pipeline orchestration, API key handling
└── services/
    ├── github.service.js           ← Octokit repo fetcher
    ├── sanitizer.service.js        ← Secret detection + redaction
    ├── ast-parser.service.js       ← JS/TS/Python AST extraction
    ├── llm-input-builder.service.js ← Prompt builder (AST + raw modes)
    ├── llm.service.js              ← Groq API client
    ├── audit-log.service.js        ← In-memory audit trail
    └── rate-limiter.middleware.js  ← Sliding window rate limiter
```

---

## Data Flow

```
GitHub URL
    ↓
github.service.js         → Fetch repo via Octokit, decode base64 files
    ↓
sanitizer.service.js      → Redact secrets (20+ patterns), log findings
    ↓
ast-parser.service.js     → Extract classes, functions, routes, imports, env vars
    ↓
llm-input-builder.service.js → Build structured prompt (AST or raw mode)
    ↓
llm.service.js            → POST to Groq API (llama-3.3-70b-versatile)
    ↓
Documentation output      → Returned to client or written to docs/
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