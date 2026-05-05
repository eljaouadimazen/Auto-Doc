# System Workflow

## Overview

Auto-Doc processes a GitHub repository through an agentic multi-agent pipeline orchestrated by the `EnforcedOrchestrator`.

## Manual Pipeline (Web Interface)

The web UI exposes the pipeline as 3 explicit steps so users can inspect intermediate results before proceeding.

```
Step 1: Fetch & Sanitize
    User pastes GitHub URL → POST /fetch
    ↓
    Repository.FetchFiles() fetches all files via Octokit recursively
    SanitizerService.createSession() → session.anonymize() redacts secrets (regex-based)
    Returns: sanitized files + preview + size + audit summary

Step 2: Build LLM Input
    POST /build (with sanitized content + useAST flag)
    ↓
    LLMInputBuilder parses files from content
    SanitizerService runs audit → AuditLog records findings
    ASTParser extracts code structure (AST mode) OR truncates (raw mode)
    Builds structured prompt messages
    Returns: chunks array + audit summary + mode used

Step 3: Generate Documentation
    POST /generate-docs (with chunks + sessionId)
    ↓
    LLMService sends prompt to provider (Groq/Gemini/OpenRouter/Ollama via shared LLMProviderService)
    LLM supports retry with exponential backoff on all providers
    Returns: generated markdown documentation
```

---

## Automated Pipeline (CI/CD)

Triggered automatically on push to `main`, `master`, or `dev` when `src/**` or `package.json` changes.

```
Git push to dev/main
    ↓
Layer 1: GitHub path filter
    Did src/**, package.json, or package-lock.json change?
    NO  → pipeline never starts
    YES → continue

Layer 2: Semantic diff (scripts/semantic-diff.js)
    For each changed .js/.ts/.py file:
        Parse AST signature BEFORE (git show baseSHA:file)
        Parse AST signature AFTER (current file)
        Compare: classes, methods, routes, imports, env vars
    ↓
    Only internal logic changed → SKIP (docs still accurate)
    Structural change detected  → GENERATE

Documentation generation (scripts/generate-docs-ci.js)
    Repository model → fetch → sanitize → audit → AST build → LLM
    Provider: Groq/Gemini/OpenRouter (configurable via DOC_PROVIDER)
    Writes to docs/: README.md, index.html, SECURITY.md, pipeline-meta.json

Deploy to GitHub Pages
    peaceiris/actions-gh-pages pushes docs/ to gh-pages branch
    Live at: https://eljaouadimazen.github.io/Auto-Doc/
```

### Docker CI Pipeline

Separate workflow (`docker-ci.yml`) runs on every push to `main`, `master`, `dev`:

```
Git push → Build Docker images (backend + frontend) → Push to Docker Hub → Trivy scan
```

See [CI-CD.md](CI-CD.md) for details.

---

## AST Mode vs Raw Mode

### AST Mode (default, recommended)

```
Raw file (200 lines)
    ↓
ASTParserService extracts:
    - imports (external dependencies)
    - class names + method signatures
    - Express routes
    - env vars accessed
    - JSDoc comments
    ↓
Compact summary (5-10 lines)
    "Class GeneratorController: async fetchRepo(req, res),
     async buildInput(req, res), async generateDocs(req, res)
     Routes: POST /fetch, POST /build, POST /generate-docs
     Env vars: GROQ_API_KEY"
    ↓
~95% token reduction, higher quality LLM output
```

### Raw Mode (fallback)

```
Raw file content
    ↓
Truncated to token budget per file and total
Priority: README → package.json → .ts/.js/.py → other
    ↓
Sent as-is in prompt
```

---

## Documentation Generation Flow (Full)

```
Source Code → GitHub Fetch → Secret Sanitization → AST Parsing
    → Prompt Construction → Groq LLM → Markdown Documentation
    → GitHub Pages Publishing
```