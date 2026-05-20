# System Workflow

## Overview

Auto-Doc processes a GitHub repository through an agentic multi-agent pipeline orchestrated by the `EnforcedOrchestrator`.

## Manual Pipeline (Web Interface)

The web UI exposes the pipeline as 3 explicit steps so users can inspect intermediate results before proceeding.

```
Step 1: Fetch & Sanitize
    User pastes GitHub URL → POST /fetch
    ↓
    Repository model fetches all files via Octokit recursively (NO github.service.js)
    SanitizerSession + SanitizerService tokenize secrets (regex + entropy)
    Returns: sanitized markdown blob + preview + size + audit summary

Step 2: Build LLM Input
    POST /build (with sanitized markdown + useAST flag)
    ↓
    llm-input-builder parses files from markdown
    SanitizerSession audit → AuditLog model records findings (pattern names only)
    ast-parser extracts code structure (AST mode) OR truncates (raw mode)
    Builds structured prompt messages in chunks
    Returns: chunks array + audit summary + mode used + vaultSize + sessionId

Step 3: Generate Documentation
    POST /generate-docs (with chunks + sessionId)
    ↓
    llm.service sends prompt to configured LLM (Groq/Gemini/OpenRouter/Ollama)
    SanitizerSession.reintegrate() swaps vault tokens back to original values
    Returns: generated markdown documentation
```

---

## Automated Pipeline (CI/CD)

Triggered on push to `main` or pull request to `main`. Runs lint, security scans, unit tests, Docker build/scan, and (on push only) Docker push + release.

```text
Push/PR to main
    ↓
Lint → Secrets scan → SAST → Commitlint → Dependency scan → Unit tests → Coverage
    ↓
Build Docker images → Scan images
    ↓
[Push to main only] Push & release → Render deploy
```

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
Truncated to MAX_FILE_CHARS (3000) per file
    Total budget MAX_TOTAL_CHARS (20000)
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