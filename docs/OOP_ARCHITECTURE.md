# OOP Architecture & Multi-Agent System

> This document covers all features introduced **after** the original documentation set (ARCHITECTURE.md, WORKFLOW.md, SECURITY.md, CI-CD.md). It documents the Object-Oriented refactoring, the multi-agent AI pipeline (including `DiagramAgent`), the React frontend, dual LLM provider support, vault-based secret anonymization, entropy detection, and the fingerprint service.

---

## Table of Contents

1. [Object-Oriented Domain Models](#1-object-oriented-domain-models)
2. [MVC Controller Layer](#2-mvc-controller-layer)
2.5. [API Wire Format](#25-api-wire-format)
3. [Multi-Agent System](#3-multi-agent-system)
4. [Agent Communication Protocol](#4-agent-communication-protocol)
5. [Orchestrator Pipelines](#5-orchestrator-pipelines)
6. [Fingerprint Service](#6-fingerprint-service)
7. [Entropy-Based Detection & Vault Anonymization](#7-entropy-based-detection--vault-anonymization)
8. [Dual LLM Provider Support](#8-dual-llm-provider-support)
9. [React Frontend (Client)](#9-react-frontend-client)
10. [Updated Project Structure](#10-updated-project-structure)
11. [Class Diagram](#11-class-diagram)
12. [Agentic Data Flow](#12-agentic-data-flow)

---

## 1. Object-Oriented Domain Models

The codebase uses **domain model classes** inside `src/models/`. Each class owns its data and behavior through JavaScript private fields (`#field`).

### 1.1 `User` — `src/models/user.model.js`

Represents the authenticated operator running the system.

| Member | Visibility | Type | Description |
|--------|-----------|------|-------------|
| `#id` | private | `string` | User identifier (derived from request IP) |
| `#apiKey` | private | `string` | API key provided via `x-api-key` header (for Groq, Gemini, or OpenRouter) |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `SubmitRepository(url)` | `Repository` | Creates a `Repository`, fetches its files, and returns the fully processed aggregate |
| `ValidateKey(llmServiceProxy)` | `Object` | Delegates API key validation to the LLM service |
| `ViewAuditLogs(repository)` | `Object` | Returns the `AuditLog` summary of a given repository |

---

### 1.2 `Repository` — `src/models/repository.model.js`

Represents a fetched GitHub repository. Acts as the **aggregate root** of the domain model.

| Member | Visibility | Type | Description |
|--------|-----------|------|-------------|
| `#url` | private | `string` | Full GitHub URL |
| `#owner` | private | `string` | GitHub owner (parsed from URL) |
| `#name` | private | `string` | Repository name (parsed from URL) |
| `#files` | private | `ProjectFile[]` | Collection of fetched and processed files |
| `#documentation` | private | `Documentation\|null` | Generated documentation artifact |
| `#auditLog` | private | `AuditLog` | Per-repository security audit trail |
| `#octokit` | private | `Octokit` | Encapsulated GitHub API client |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `FetchFiles()` | `ProjectFile[]` | Recursively fetches all eligible files from GitHub via the Octokit REST API |
| `GenerateDocumentation(mode, provider)` | `Documentation` | Generates docs via the classic pipeline or the agentic multi-agent pipeline depending on `mode` |
| `static fromDTO(name, serializedFiles)` | `Repository` | Reconstructs a `Repository` from a client-side JSON payload (stateless HTTP boundary crossing) |
| `_recursiveFetchFiles(owner, repo, path)` | `void` | Internal recursive traversal of the GitHub directory tree |
| `_fetchFileContent(owner, repo, filePath)` | `string\|null` | Fetches and base64-decodes individual file content |

**Filtering Constants:**

| Constant | Value | Purpose |
|----------|-------|---------|
| `ALLOWED_EXTENSIONS` | `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.java`, `.go`, `.rb`, `.json`, `.md`, `.html`, `.css` | Only these file types are fetched |
| `SKIP_DIRS` | `node_modules`, `dist`, `build`, `.git`, `.github`, `vendor` | Directories skipped during traversal |
| `MAX_FILE_SIZE` | `100,000` bytes | Files larger than this are ignored |

---

### 1.3 `ProjectFile` — `src/models/project-file.model.js`

Represents an individual file within a repository. AST parsing is delegated to `ASTParserService`.

| Member | Visibility | Type | Description |
|--------|-----------|------|-------------|
| `#path` | private | `string` | File path relative to repository root |
| `#rawContent` | private | `string` | Raw file content |
| `#extension` | private | `string` | File extension (e.g., `.js`) |
| `#size` | private | `number` | File size in bytes |
| `#astTree` | private | `Object\|null` | Parsed AST structure (populated by `ExtractAST()`) |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `ExtractAST()` | `void` | Delegates to `ASTParserService` to populate `#astTree` |
| `toJSON()` | `Object` | Serializes to a plain object for HTTP transport or LLM input |

---

### 1.4 `AuditLog` — `src/models/audit-log.model.js`

Per-repository security monitoring trail. Each `Repository` instance owns its own `AuditLog`, eliminating the global singleton race conditions.

| Method | Returns | Description |
|--------|---------|-------------|
| `RecordEntry(file, findings)` | `void` | Records a sanitization event (file path + matched pattern names) |
| `IncrementScanned()` | `void` | Increments the scanned file counter |
| `GetSummary()` | `Object` | Returns `{ timestamp, filesScanned, filesAffected, totalRedacted, findings }` |

---

---

### 1.5 `Documentation` — `src/models/documentation.model.js`

Represents the final generated markdown documentation artifact.

| Member | Visibility | Type | Description |
|--------|-----------|------|-------------|
| `#content` | private | `string` | Generated markdown content |
| `#generatedAt` | private | `Date` | Timestamp of generation |
| `#stats` | private | `Object` | Generation metadata (mode, sections, token usage) |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `SaveToDisk(repoName)` | `string` | Generates an HTML viewer and writes to `public/docs/` via `ViewerGeneratorService` |
| `GeneratePdf(repoName)` | `Buffer` | Generates a PDF via `PdfGeneratorService` (Puppeteer + Mermaid rendering) |
| `PublishToPages(targetRepo, githubToken, repoName)` | `Object` | Deploys to GitHub Pages via `PublisherService` (Octokit, creates/updates `gh-pages` branch) |

---

## 2. MVC Controller Layer

### `GeneratorController` — `src/controllers/generator.controller.js`

The sole controller class, exported as a singleton instance. It acts as a thin orchestrator delegating all business logic to domain models.

**Key Design Decisions:**

- A `User` object is constructed per-request from `req.ip` and `req.headers['x-api-key']` via the `getUserContext(req)` factory function.
- `Repository.fromDTO()` is used to reconstruct domain state across stateless HTTP boundaries for multi-step pipelines.
- The controller differentiates between `classic` and `agentic` generation modes via the `x-mode` header.
- The controller differentiates between four providers (`groq`, `gemini`, `openrouter`, `ollama`) via the `x-provider` header.

**Endpoint Mapping:**

| HTTP Method | Route | Controller Method | Description |
|-------------|-------|-------------------|-------------|
| `POST` | `/fetch` | `fetchRepo` | Fetches a GitHub repo via `User.SubmitRepository()`, returns sanitized files |
| `POST` | `/build` | `buildInput` | Builds LLM prompt messages via `LLMInputBuilder` |
| `POST` | `/generate-docs` | `generateDocs` | Generates documentation (classic or agentic mode) |
| `POST` | `/generate` | `generate` | Full pipeline in a single request |
| `POST` | `/analyze-nature` | `analyzeNature` | Classifies project nature via `RepoAnalyzerAgent` |
| `POST` | `/publish` | `publishDocs` | Publishes docs to GitHub Pages via `Documentation.PublishToPages()` |
| `GET` | `/job/:jobId` | `getJobStatus` | Polls async job status (graphify-backed generation) |
| `POST` | `/validate-key` | `validateKey` | Validates an API key for the chosen provider |
| `GET` | `/audit` | `getAuditLogs` | Returns audit logs from `AuditStore` |
| `GET` | `/rules` | `listRules` | Lists all sanitization rules (built-in + custom) |
| `POST` | `/rules` | `addRule` | Adds a custom rule to `SanitizerService` |
| `DELETE` | `/rules/:id` | `removeRule` | Removes a custom rule from `SanitizerService` |
| `POST` | `/rules/test` | `testRule` | Tests a regex pattern against sample text |

---

## 2.5 API Wire Format

### Sentinel Serialization Format

Files are serialized using **sentinel delimiters** (`<<<CONTENT>>>` / `<<<END>>>`) instead of markdown code fences. This prevents silent file drops when content contains triple-backticks, PEM blocks, or other multiline structures.

```
## File: src/config.js
<<<CONTENT>>>
const AWS_KEY = "FAKE_AWS_KEY_EXAMPLE";
// FAKE_PRIVATE_KEY_EXAMPLE
<<<END>>>

## File: package.json
<<<CONTENT>>>
{ "name": "my-app", "version": "1.0.0" }
<<<END>>>
```

The sentinel strings cannot appear in any real source file, guaranteeing every file parses correctly. This format is used in `fetchRepo` response, `buildInput`, and `GenerateDocumentation`.

### Chunk-Based `buildInput` API

`POST /build` now returns **chunks** instead of a single `messages` array. This supports large repositories that exceed LLM context limits:

```json
{
  "step": "build",
  "chunks": [
    {
      "messages": [{ "role": "system", "content": "..." }, { "role": "user", "content": "..." }],
      "chunkIndex": 0,
      "totalChunks": 2,
      "fileCount": 8,
      "charCount": 18500
    }
  ],
  "totalChunks": 2,
  "mode": "ast",
  "vaultSize": 12,
  "auditSummary": { "filesScanned": 15, "filesAffected": 3, "totalRedacted": 12 }
}
```

Each chunk contains a self-contained `messages` array. `POST /generate-docs` iterates over chunks sequentially, generating documentation per-chunk and re-integrating vault tokens after each LLM call. Results are joined with `---` separators.

---

## 3. Multi-Agent System

The `src/agents/` directory contains a complete **multi-agent AI pipeline** built on LangChain and Groq. Agents communicate through a strict standardized protocol and are coordinated by orchestrator classes.

### 3.1 `BaseAgent` — `src/agents/base.agent.js`

Abstract base class that **every agent extends**. Provides:

| Feature | Implementation |
|---------|---------------|
| **LLM Access** | Initializes `ChatGroq` from LangChain with configurable `temperature`, `maxTokens`, and `model` |
| **Retry Logic** | Exponential backoff up to `maxRetries` attempts (default: 2) |
| **LangSmith Tracing** | Optional observability via `LANGCHAIN_API_KEY` environment variable |
| **Protocol Compliance** | Wraps results in standardized `AgentOutput` objects via `protocol.buildSuccess()` / `protocol.buildFailure()` |
| **JSON Parsing** | `callLLMJSON()` strips markdown fences and extracts JSON from LLM responses |
| **Token Management** | `truncate(text, maxTokens)` estimates at 1 token ≈ 4 characters |

**Configuration:**

```javascript
constructor(name, systemPrompt, {
  maxRetries   = 2,
  temperature  = 0.1,
  maxTokens    = 2048
})
```

**Abstract Method:** Subclasses must implement `execute(agentInput)`.

---

### 3.2 `SecurityAgent` — `src/agents/security.agent.js`

Adds a **semantic AI layer** on top of the existing regex sanitizer. The regex sanitizer runs first (fast, reliable); this agent runs second for deeper context-aware inspection.

**What it understands that regex cannot:**
- `const x = 'sk-abc123'` → detected as an OpenAI key even if the variable isn't named `api_key`
- `// example: password=test123` → recognized as a false positive (it's a comment example)
- Hardcoded URLs with embedded credentials

**Decision Logic (`shouldReview`):**
- Files flagged by regex → agent confirms and searches for more
- Files matching high-risk name patterns (`.env`, `config`, `credential`, `secret`, `auth`, `key`, `token`, `password`, `setting`) → always reviewed

**Output Schema:**
```json
{
  "path": "file path",
  "riskLevel": "clean | low | medium | high | critical",
  "confirmedSecrets": [{ "type": "...", "location": "...", "shouldRedact": true }],
  "falsePositives": [{ "regexPattern": "...", "reason": "..." }],
  "missedByRegex": [{ "type": "...", "location": "...", "shouldRedact": true }],
  "recommendation": "safe_to_send | redact_and_send | do_not_send",
  "notes": "..."
}
```

**Configuration:** `temperature: 0.0` (deterministic), `maxTokens: 1000`, `maxRetries: 2`

---

### 3.3 `CodeIntelligenceAgent` — `src/agents/code-intelligence.agent.js`

Replaces the regex-based AST parser with **LLM-powered code understanding**. Instead of extracting syntax, this agent understands **meaning**: what does this file actually do, what is the purpose of each class/function, what architectural decisions were made.

**Supported Extensions:** `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.py`, `.java`, `.go`

**Output Schema:**
```json
{
  "path": "file path",
  "language": "JavaScript | TypeScript | Python | ...",
  "purpose": "One sentence — what this file does",
  "type": "controller | service | middleware | utility | config | test | other",
  "responsibilities": ["..."],
  "classes": [{ "name": "...", "role": "...", "methods": [...] }],
  "functions": [{ "name": "...", "purpose": "...", "async": false }],
  "dependencies": ["external imports"],
  "internalDependencies": ["local imports"],
  "routes": [{ "method": "GET", "path": "/...", "purpose": "..." }],
  "envVars": ["ENV_VAR_NAMES"],
  "securityRelevant": false,
  "keyDecisions": ["..."],
  "complexity": "low | medium | high",
  "summary": "2-3 sentences for documentation"
}
```

**Configuration:** `temperature: 0.1`, `maxTokens: 1500`, `maxRetries: 2`

---

### 3.4 `ArchitectureAgent` — REMOVED

**Note: `src/agents/architecture.agent.js` does NOT exist in the codebase.**

Cross-file architecture synthesis has been absorbed by:
- `RepoAnalyzerAgent` — Project nature classification
- `CodeIntelligenceAgent` — Individual file analysis
- `WriterAgent` — Synthesizes architecture sections during documentation writing

The functionality described above is now distributed across these three agents.

---

### 3.5 `WriterAgent` — `src/agents/writer.agent.js`

Generates the **final documentation** in markdown, adapting its output strategy based on the project type.

**Two Strategies:**

| Strategy | Trigger | Sections Generated |
|----------|---------|-------------------|
| `FULL_ARCH` | Project has executable code | Overview, Architecture, API Reference, Security Notes, Setup & Usage, Technical Specs |
| `RESOURCE_ONLY` | Project is a resource/docs collection | Overview, Project Structure, Technical Specs (no architecture section) |

**Section Writers:** Each documentation section is generated by a dedicated async method (`writeOverview`, `writeArchitecture`, `writeAPIReference`, `writeSecurityNotes`, `writeSetupUsage`, `writeTechnicalSpecs`) using `Promise.allSettled` for parallel execution with fault tolerance.

**Configuration:** `temperature: 0.1`, `maxTokens: 3500`, `maxRetries: 2`

---

### 3.6 `RepoAnalyzerAgent` — `src/agents/repo-analyzer.agent.js`

Classifies the target repository by fusing structural fingerprinting with AST logic signals. Prevents hallucinated documentation by grounding the pipeline in verified facts.

**Classification Process:**
1. Runs `FingerprintService.identify()` for structural classification
2. Extracts logic signals via `ASTParserService.parseFiles()`
3. Detects whether executable code exists
4. Calls the LLM to produce a final classification

**Output Schema:**
```json
{
  "projectNature": "BACKEND | FRONTEND | DEVOPS | RESOURCE_LIST | LIBRARY",
  "hasExecutableCode": true,
  "logicSignals": ["database", "network", "security"],
  "summary": "Short 1-sentence technical essence"
}
```

---

### 3.7 `TemplateSelectorAgent` — `src/agents/template-selector.agent.js`

An LLM-powered agent for selecting documentation templates based on project nature and logic signals. The file exists in the codebase but is **not currently used** by `EnforcedOrchestrator` — which uses a deterministic `selectTemplate()` function instead.

**Note:** The agent is available as a future alternative for LLM-driven template selection. Currently, template+diagram selection is handled deterministically inside `orchestrator.agent.js` via a hardcoded mapping of `projectNature → { templateId, diagramType }`.

**Available Templates (for reference):**

| Template | Description | Use Case |
|----------|-------------|----------|
| `FULL_SOFTWARE` | Overview, Architecture, API, Setup, Technical Specs | Executable software projects |
| `RESOURCE_LIST` | Overview, Categorization, Contribution Guide (NO Architecture) | Documentation/resource repositories |
| `LIBRARY` | Overview, Installation, API Reference, Usage Examples | Reusable libraries |

---

### 3.8 `DiagramAgent` — `src/agents/diagram.agent.js`

Generates **Mermaid.js architectural diagrams** (CLASS, COMPONENT, or PIPELINE) using a **two-pass approach** aligned with gitdiagram's technique:

**Pass 1 — Explain:** Reads the file tree + key file snippets and writes a plain-English architecture explanation. This grounds the LLM in real names and structure before drawing.

**Pass 2 — Generate:** Uses the explanation + file tree to produce valid Mermaid syntax. Separating "understand" from "draw" prevents hallucinated or syntactically broken output.

**Diagram Types:**

| Type | Mermaid Syntax | Focus |
|------|---------------|-------|
| `CLASS` | `classDiagram` | Classes, methods, inheritance, composition, dependencies |
| `COMPONENT` | `graph TD` | UI components, state flow, parent-child hierarchy |
| `PIPELINE` | `flowchart LR` | CI/CD stages, triggers, deployment environments |

**Configuration:** `temperature: 0.1`, `maxTokens: 3000`, `maxRetries: 2`

---

## 4. Agent Communication Protocol

`src/agents/protocol.js` defines the strict communication contract between all agents. Every agent receives `AgentInput` and returns `AgentOutput`.

### AgentInput

```javascript
{
  task: string,              // What the agent must do
  context: {
    repository: string,      // Repository name
    runId: string,           // Unique pipeline run ID (e.g., "run_1713625293_a8f3k2")
    previous: Object         // Results from previous agents
  },
  input: any                 // Agent-specific input data
}
```

### AgentOutput

```javascript
{
  agentName: string,         // Name of the agent that produced this
  status: 'success' | 'failed' | 'skipped',
  result: any,               // Agent-specific result data
  meta: {
    tokensUsed: number,
    durationMs: number,
    attempts: number          // How many retries were needed
  },
  error: string | null
}
```

### Protocol Functions

| Function | Description |
|----------|-------------|
| `buildInput(task, context, input)` | Constructs a standardized `AgentInput` |
| `buildSuccess(agentName, result, meta)` | Wraps a successful result in `AgentOutput` |
| `buildFailure(agentName, error, meta)` | Wraps a failure in `AgentOutput` |
| `buildSkipped(agentName, reason, cachedResult)` | Wraps a skipped result (e.g., cached) |
| `validateOutput(output)` | Validates that an agent output conforms to the protocol schema |
| `generateRunId()` | Generates a unique run ID for tracing |

---

## 5. Orchestrator Pipelines

Two orchestrator implementations coordinate the agent pipeline.

### 5.1 `OrchestratorAgent` — REMOVED

**Note: `src/agents/orchestrator.agent.js` does NOT exist in the codebase.**

Only `EnforcedOrchestrator` exists (see Section 5.2). The old 5-phase `OrchestratorAgent` has been completely removed.

**Historical Note:** The 5-phase pipeline described below was replaced by the certified 7-stage `EnforcedOrchestrator`:
- Phase 1-2 (Filter/Security) → Stage 1-2 (File Retrieval + Security Gate)
- Phase 1.5 (Fingerprint) → Stage 3 (Repo Analyzer)
- Phase 3 (Code Intelligence) → Stage 6
- Phase 4 (Architecture) → Absorbed by WriterAgent
- Phase 5 (Writer) → Stage 7

---

### 5.2 `EnforcedOrchestrator` — `src/agents/orchestrator.agent.js`

A **certified 7-stage pipeline** designed to prevent hallucinated documentation and generate architectural diagrams.

```
Stage 1: FILE RETRIEVAL
    → Select high-signal files (.js, .ts, .py, .yml)
    → Skip node_modules, dist, build, .git
    → Limit to 25 files, sorted by importance

Stage 2: SECURITY GATE
    → SanitizerService.audit() on each file (regex + entropy)
    → Files with no findings pass immediately
    → Flagged files sent to SecurityAgent for semantic review
    → "do_not_send" files blocked; "redact_and_send" files anonymized

Stage 3: REPO ANALYZER (anti-hallucination)
    → RepoAnalyzerAgent classifies project nature
    → FingerprintService + ASTParserService for ground-truth signals
    → Outputs: projectNature, logicSignals, hasExecutableCode

Stage 4: TEMPLATE SELECTOR
    → TemplateSelectorAgent chooses documentation schema
    → Defines required/forbidden sections + diagramType (CLASS/COMPONENT/PIPELINE/NONE)

Stage 5: DIAGRAM GENERATION (conditional)
    → Triggered only if diagramType != NONE and hasExecutableCode
    → DiagramService selects top 8 high-signal files for the diagram type
    → DiagramAgent runs two-pass explain-then-draw pipeline
    → Output: valid Mermaid code embedded in documentation

Stage 6: CODE INTELLIGENCE (batched)
    → CodeIntelligenceAgent on up to 10 safe files
    → Semantic understanding: purpose, classes, routes, dependencies, complexity

Stage 7: WRITER
    → WriterAgent generates final markdown documentation
    → Adapts to project nature, selected template, and diagram output
    → Sections generated in parallel via Promise.allSettled
```

---

## 6. Fingerprint Service — ABSORBED

**Note: `src/services/fingerprint.service.js` does NOT exist in the codebase.**

Project nature classification has been **absorbed into `RepoAnalyzerAgent`** (`src/agents/repo-analyzer.agent.js`). The agent:
1. Performs structural file/directory pattern matching
2. Extracts AST logic signals via `ASTParserService`
3. Calls LLM for final classification

### Classification Logic (in RepoAnalyzerAgent)

| Nature | Key Files | Key Directories |
|--------|-----------|-----------------|
| **Frontend** | `package.json`, `webpack.config.js`, `tailwind.config.js`, `next.config.js` | `src/components`, `public`, `assets` |
| **Backend** | `pom.xml`, `build.gradle`, `go.mod`, `composer.json`, `requirements.txt`, `prisma.schema` | `src/main`, `controllers`, `models`, `api`, `routes` |
| **DevOps** | `main.tf`, `docker-compose.yml`, `Dockerfile`, `Chart.yaml`, `ansible.cfg` | `terraform`, `kubernetes`, `.github/workflows`, `docker` |

---

## 7. Entropy-Based Detection & Vault Anonymization

The sanitization system uses **two tiers**:

1. **`SanitizationRule` model** — Destructive `[REDACTED_SECRET]` replacement (used in `ProjectFile.Sanitize()`)
2. **`SanitizerSession` service** — Vault-based tokenization (re-integrable, used in HTTP pipeline)

The `SanitizerService` combines **34 built-in regex patterns** with a **Shannon entropy analysis** pass and a **vault-based token anonymization** pipeline via `SanitizerSession`.

### Vault-Based Anonymization (Key Architectural Shift)

Instead of destructive `[REDACTED_SECRET]` replacement, the sanitizer uses a vault (`Map<token, originalValue>`):

```
Input:  AWS_KEY=FAKE_AWS_KEY_EXAMPLE
Output: AWS_KEY=[TOKEN_AWS_KEY_a7b2]
Vault:  { "[TOKEN_AWS_KEY_a7b2]" → "FAKE_AWS_KEY_EXAMPLE" }
```

- The LLM receives context-rich tokens it can reason about
- After generation, `reintegrate(llmOutput)` swaps tokens back locally
- The vault is cleared between requests via `resetVault()` (session isolation)
- Identical values in the same session get the same token (deduplication)

### How Entropy Detection Works

1. Splits text into lines
2. Skips known safe high-entropy patterns (base64 data URIs, git SHA hashes, SHA256 hashes)
3. Looks for assignment patterns (`key = value` or `key: value`)
4. Calculates the Shannon entropy of the assigned value
5. Flags values with **entropy > 4.2** (statistically likely to be secrets or random tokens)
6. Tokenizes hits the same way as regex matches — they enter the vault

### Security Report

The `SanitizerService.report()` method produces a structured security report per file:

```json
{
  "filePath": "src/config.js",
  "timestamp": "2026-04-20T...",
  "hasSensitiveData": true,
  "summary": {
    "secrets": ["api_key", "jwt_token"],
    "pii": ["email"],
    "highEntropyHits": 2
  },
  "details": {
    "matchedPatterns": ["api_key", "email", "jwt_token"],
    "highEntropyStrings": [{ "value": "...", "entropy": "4.85", "line": 12 }]
  },
  "anonymizedContent": "..."
}
```

### Full Pattern Set

See [SECURITY.md](SECURITY.md) for the complete list of 40+ built-in patterns, organized by category (secrets, PII, certificates).

---

## 8. Quad LLM Provider Support

The system supports **four** LLM providers, selectable per request via the `x-provider` header.

### 8.1 Groq (Cloud) — Default

| Configuration | Value |
|---------------|-------|
| API Endpoint | `https://api.groq.com/openai/v1/chat/completions` |
| Default Model | `llama-3.3-70b-versatile` (configurable via `GROQ_MODEL`) |
| Temperature | 0.2 |
| Max Tokens | 4096 |
| Timeout | 30 seconds |
| Error Handling | 401 → Invalid key, 413 → Prompt too large, 429 → Rate limited |

### 8.2 Ollama (Local)

| Configuration | Value |
|---------------|-------|
| API Endpoint | `http://localhost:11434/v1/chat/completions` |
| Default Model | `tinyllama` (configurable via `OLLAMA_MODEL`) |
| Temperature | 0.2 |
| Max Tokens | 1024 |
| Timeout | 240 seconds (4 min — local is slower) |
| Error Handling | `ECONNREFUSED` → "Ollama is not running — start it with: `ollama serve`" |

### Token Budget Adaptation

The `LLMInputBuilder` adjusts its token budget based on the provider:

| Budget | Groq (Cloud) | Ollama (Local) |
|--------|-------------|----------------|
| Max chars per file | 3,000 | 800 |
| Max total chars | 20,000 | 4,000 |
| Prompt style | Full detailed prompt | Short concise prompt |

---

## 9. React Frontend (Client)

The `client/` directory contains a **React + Vite** single-page application that communicates with the Express backend.

### Technology Stack

| Technology | Purpose |
|------------|---------|
| React | UI component framework |
| Vite | Build tool and dev server |
| JSX | Component templating |
| shadcn/ui | Primitive UI components (button, card, input, tabs, etc.) |
| Lucide React | Icon library |
| marked | Markdown rendering |
| Mermaid | Diagram rendering in doc viewer |
| DOMPurify | HTML sanitization in doc viewer |

### Component Architecture

Layout-level components (`Navbar`, `Pipeline`, `Features`, `Footer`) are inlined in `App.jsx`, while reusable/complex components live in `components/`:

```
client/src/
├── App.jsx              ← Layout components: Navbar, Pipeline, Features, Footer
├── main.jsx             ← React DOM entry point
├── index.css            ← Global styles
├── App.css              ← App-specific styles
├── components/
│   ├── DocViewer.jsx    ← Interactive documentation viewer (TOC, search, themes, Mermaid)
│   ├── AuditPanel.jsx   ← Sanitization audit log viewer (accordion, findings summary)
│   └── ui/              ← shadcn/ui primitives (9 files)
│       ├── button.jsx, card.jsx, input.jsx, badge.jsx
│       ├── tabs.jsx, select.jsx, switch.jsx
│       ├── accordion.jsx, progress.jsx
├── lib/
│   └── utils.js         ← cn() classname utility
└── assets/              ← Static assets
```

### Pipeline Component (App.jsx)

The `Pipeline` component in `App.jsx` integrates all elements of the 3-step workflow into a single UI:

| Feature | Description |
|---------|-------------|
| Provider selection | Dropdown for Groq / Gemini / OpenRouter / Ollama |
| Pipeline mode toggle | Agentic (multi-agent pipeline) vs Classic (chunk-based LLM calls) |
| API key input | Password field with live validation via debounced `/validate-key` |
| Project nature selector | User selects project type upfront (Backend, Frontend, Fullstack, etc.) |
| Doc type | README (.md) or PDF |
| Target audience | Tailors content depth (User, Developer, Project Manager, Product Owner) |
| Business model / Progress | Optional context fields for PM/PO audiences |
| Step buttons | Fetch → Build Input → Generate Docs with progress indicator |
| Output tabs | Raw (source), Rendered (HTML), Interactive (DocViewer), Audit |
| GitHub Pages publish | Inline publish form with target repo + token |

---

## 10. Updated Project Structure

```
safe-file-generator/
├── src/
│   ├── app.js                              ← Express server entry point
│   ├── controllers/
│   │   └── generator.controller.js         ← MVC controller (thin orchestrator)
│   ├── models/                             ← OOP Domain Models (5 files)
│   │   ├── user.model.js                   ← User aggregate
│   │   ├── repository.model.js             ← Repository aggregate root (Octokit built-in)
│   │   ├── project-file.model.js           ← File entity with AST extraction
│   │   ├── audit-log.model.js              ← Per-repo IN-MEMORY audit trail (no SQLite)
│   │   └── documentation.model.js          ← Generated doc artifact
│   ├── agents/                             ← Multi-Agent System (9 files)
│   │   ├── base.agent.js                   ← Abstract base (LLM, retry, tracing, 4 providers)
│   │   ├── protocol.js                     ← AgentInput/AgentOutput contract
│   │   ├── orchestrator.agent.js           ← EnforcedOrchestrator (pipeline coordinator)
│   │   ├── code-intelligence.agent.js      ← LLM-powered code understanding
│   │   ├── security.agent.js               ← Semantic secret detection
│   │   ├── writer.agent.js                 ← Documentation generation
│   │   ├── repo-analyzer.agent.js          ← Project classification (absorbed fingerprint)
│   │   ├── template-selector.agent.js      ← LLM template selection (currently unused)
│   │   └── diagram.agent.js                ← Mermaid diagram generation (two-pass)
│   ├── services/                           ← Infrastructure Services (15 files)
│   │   ├── sanitizer.service.js            ← Pattern registry + session factory (48 built-in patterns)
│   │   ├── sanitizer-session.js            ← Per-request vault tokenization
│   │   ├── sanitizer-session-store.js      ← Session persistence across HTTP requests
│   │   ├── audit-store.service.js          ← Audit log storage by session ID
│   │   ├── log-sanitizer.js                ← Global console.error secret stripping
│   │   ├── ast-parser.service.js           ← Regex-based JS/TS/Python parser
│   │   ├── llm-input-builder.service.js    ← Prompt builder (AST + raw modes, chunks)
│   │   ├── llm.service.js                  ← 4 providers: Groq, Gemini, OpenRouter, Ollama
│   │   ├── diagram.service.js              ← High-signal file selector for diagrams
│   │   ├── graph.service.js                ← Knowledge graph querying (graphify output)
│   │   ├── job-queue.service.js            ← Async job management with 1hr TTL
│   │   ├── pdf-generator.service.js        ← Puppeteer-based PDF generation
│   │   ├── publisher.service.js            ← GitHub Pages deployment via Octokit
│   │   ├── viewer-generator.service.js     ← HTML documentation viewer generator
│   │   └── rate-limiter.middleware.js      ← Sliding window rate limiter
│   └── views/
│       ├── index.ejs                       ← Legacy EJS template
│       └── error.ejs                       ← Error page template
├── client/                                 ← React + Vite Frontend
│   ├── src/
│   │   ├── App.jsx                         ← Navbar, Pipeline, Features, Footer
│   │   ├── main.jsx                        ← Entry point
│   │   ├── index.css, App.css
│   │   ├── components/
│   │   │   ├── DocViewer.jsx               ← Interactive doc viewer (TOC, search, Mermaid)
│   │   │   ├── AuditPanel.jsx              ← Audit log viewer
│   │   │   └── ui/                         ← shadcn/ui primitives (9 files)
│   │   ├── lib/
│   │   │   └── utils.js                    ← cn() helper
│   │   └── assets/
│   ├── vite.config.js                      ← outDir: '../public'
│   └── package.json
├── devops/                                 ← Docker + Env config
│   ├── .env                                ← Environment variables loaded HERE
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
├── scripts/
│   ├── generate-docs-ci.js                 ← CI headless pipeline runner
│   └── semantic-diff.js                    ← AST-based smart trigger
├── .github/workflows/
│   ├── generate-docs.yml                   ← Doc generation pipeline
│   ├── ci.yml                               ← Tests, lint, Docker build/scan/push
│   └── deploy.yml                           ← Deployment
├── docs/                                   ← Documentation
│   ├── ARCHITECTURE.md                     ← System layers and data flow
│   ├── WORKFLOW.md                         ← Step-by-step pipeline description
│   ├── SECURITY.md                         ← Secret detection model (original)
│   ├── CI-CD.md                            ← GitHub Actions automation
│   └── OOP_ARCHITECTURE.md                 ← This document
├── render.yaml                             ← Render.com deployment config
├── jest.config.js                          ← Test config (tests DO exist)
├── .env.example                            ← Example env vars (4 providers)
└── package.json
```

**Files that DO NOT exist (documented incorrectly elsewhere):**
- `src/services/github.service.js` — GitHub fetching is in `repository.model.js`
- `src/services/audit-log.service.js` — Audit log is a model, not service
- `src/services/fingerprint.service.js` — Absorbed by `repo-analyzer.agent.js`
- `src/models/sanitization-rule.model.js` — Rules live in `sanitizer.service.js`, not a standalone model
- `src/agents/architecture.agent.js` — Never implemented; absorbed by WriterAgent + RepoAnalyzerAgent

---

## 11. Class Diagram

```
┌─────────────────────┐
│        User          │
│─────────────────────│
│ - #id: string        │
│ - #apiKey: string    │
│─────────────────────│
│ + SubmitRepository() │
│ + ValidateKey()      │
│ + ViewAuditLogs()    │
└────────┬────────────┘
         │ creates
         ▼
┌─────────────────────┐       owns        ┌──────────────────────┐
│    Repository        │──────────────────▶│     ProjectFile      │
│─────────────────────│       0..*        │──────────────────────│
│ - #url: string       │                   │ - #path: string      │
│ - #owner: string     │                   │ - #rawContent: string│
│ - #name: string      │                   │ - #extension: string │
│ - #files: File[]     │                   │ - #size: number      │
│ - #documentation     │                   │ - #astTree: Object   │
│ - #auditLog          │                   │──────────────────────│
│ - #octokit           │                   │ + ExtractAST()       │
│─────────────────────│                   │ + toJSON()           │
│ + FetchFiles()       │                   └──────────────────────┘
│ + GenerateDocumentation()│
│ + static fromDTO()   │
└────────┬────────────┘
         │ owns                            ┌──────────────────────┐
         ├────────────────────────────────▶│      AuditLog        │
         │         1                       │──────────────────────│
         │                                 │ - #filesScanned      │
         │                                 │ - #totalRedacted     │
         │                                 │ - #entries           │
         │                                 │──────────────────────│
         │                                 │ + RecordEntry()      │
         │                                 │ + IncrementScanned() │
         │                                 │ + GetSummary()       │
         │                                 └──────────────────────┘
         │ creates
         ▼
┌─────────────────────┐
│   Documentation      │
│─────────────────────│
│ - #content: string   │
│ - #generatedAt: Date │
│ - #stats: Object     │
│─────────────────────│
│ + SaveToDisk()       │
│ + GeneratePdf()      │
│ + PublishToPages()   │
└─────────────────────┘
```

### Agent Hierarchy

```
┌────────────────────────┐
│       BaseAgent        │ ◄── Abstract (LangChain + 4 providers + retry + tracing)
│────────────────────────│
│ + run(agentInput)      │
│ + callLLM(prompt)      │
│ + callLLMJSON(prompt)  │
│ + truncate(text)       │
└────────┬───────────────┘
         │ extends
    ┌────┴────┬───────────┬───────────────┬──────────────┬────────────────┬──────────────────┐
    ▼         ▼           ▼               ▼              ▼                ▼                  ▼
 Security   CodeIntel     Writer       RepoAnalyzer   TemplateSelector   DiagramAgent     EnforcedOrchestrator
  Agent      Agent        Agent          Agent             Agent                            (ONLY orchestrator)
```

**Note:** `ArchitectureAgent` and the original `OrchestratorAgent` (5-phase) do NOT exist. Only `EnforcedOrchestrator` is the orchestrator.

---

## 12. Agentic Data Flow

```
GitHub URL
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  GeneratorController.generateDocs()  [mode = 'agentic']      │
│  ► Repository.fromDTO() → Repository.GenerateDocumentation() │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  EnforcedOrchestrator                                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Stage 1: FILE RETRIEVAL                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Filter high-signal files (.js, .ts, .py, .json, .md) │    │
│  │ Skip node_modules, limit budget to 25 files          │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Stage 2: SECURITY GATE                                      │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Regex audit via SanitizerSession                      │    │
│  │ Flagged files → SecurityAgent (semantic AI review)    │    │
│  │ "do_not_send" blocked; "redact_and_send" passed       │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  [Graphify] (if githubUrl provided)                          │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ git clone --depth 1 → graphify CLI → graph.json      │    │
│  │ Loaded into GraphService for relation queries        │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Stage 3: REPO ANALYZER                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ RepoAnalyzerAgent (or user-provided projectNature)    │    │
│  │ ► LLM classification → projectNature, logicSignals    │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Stage 4: TEMPLATE + DIAGRAM DETERMINATION                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ selectTemplate() (deterministic, not LLM)             │    │
│  │ ► Maps projectNature → templateId + diagramType       │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Stage 5: DIAGRAM GENERATION (conditional)                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Only if diagramType != NONE + hasExecutableCode       │    │
│  │ DiagramAgent two-pass (explain → generate Mermaid)    │    │
│  │ Uses graph relationships if available                  │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Stage 6: CODE INTELLIGENCE (batched)                        │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ CodeIntelligenceAgent on up to 10 safe files          │    │
│  │ Semantic understanding: purpose, classes, routes      │    │
│  │ Uses graph relationships for context                   │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Stage 7: WRITER                                            │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ WriterAgent generates final markdown documentation    │    │
│  │ Sections in parallel via Promise.allSettled           │    │
│  │ Adapts to project nature, template, and diagram       │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Return: { documentation, stats, projectNature, diagram }    │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
               Documentation Model
               ► .content (markdown)
               ► .stats (metadata)
               ► .SaveToDisk() / .GeneratePdf() / .PublishToPages()
```

### EnforcedOrchestrator — Security Gate Internals

```
Security Gate:
    ┌───────────────────────────────────────────────┐
    │ For each file (sequential):                   │
    │   1. SanitizerSession.audit() → regex pass    │
    │   2. If no findings → safe, skip to next      │
    │   3. If flagged → SecurityAgent.run() → AI    │
    │   4. Merge findings → recommendation          │
    │   5. Do_not_send → blocked; redact → allowed  │
    └───────────────────────────────────────────────┘

Code Intelligence:
    ┌───────────────────────────────────────────────┐
    │ For each safe file (Promise.allSettled):      │
    │   1. Query graph for related files (if avail) │
    │   2. CodeIntelligenceAgent.run() → semantics  │
    │   3. On failure → fallback to file type infer │
    └───────────────────────────────────────────────┘
```
