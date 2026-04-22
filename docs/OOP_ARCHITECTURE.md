# OOP Architecture & Multi-Agent System

> This document covers all features introduced **after** the original documentation set (ARCHITECTURE.md, WORKFLOW.md, SECURITY.md, CI-CD.md). It documents the Object-Oriented refactoring, the multi-agent AI pipeline, the React frontend, dual LLM provider support, entropy-based detection, and the fingerprint service.

---

## Table of Contents

1. [Object-Oriented Domain Models](#1-object-oriented-domain-models)
2. [MVC Controller Layer](#2-mvc-controller-layer)
3. [Multi-Agent System](#3-multi-agent-system)
4. [Agent Communication Protocol](#4-agent-communication-protocol)
5. [Orchestrator Pipelines](#5-orchestrator-pipelines)
6. [Fingerprint Service](#6-fingerprint-service)
7. [Entropy-Based Detection](#7-entropy-based-detection)
8. [Dual LLM Provider Support](#8-dual-llm-provider-support)
9. [React Frontend (Client)](#9-react-frontend-client)
10. [Updated Project Structure](#10-updated-project-structure)
11. [Class Diagram](#11-class-diagram)
12. [Agentic Data Flow](#12-agentic-data-flow)

---

## 1. Object-Oriented Domain Models

The codebase has been refactored from loose singleton services into encapsulated **domain model classes** inside `src/models/`. Each class owns its data and behavior through JavaScript private fields (`#field`).

### 1.1 `User` — `src/models/user.model.js`

Represents the authenticated operator running the system.

| Member | Visibility | Type | Description |
|--------|-----------|------|-------------|
| `#id` | private | `string` | User identifier (derived from request IP) |
| `#apiKey` | private | `string` | Groq API key provided via `x-api-key` header |
| `#rules` | private | `SanitizationRule[]` | Loaded from built-in + custom patterns at construction |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `SubmitRepository(url)` | `Repository` | Creates a `Repository`, fetches its files, sanitizes each `ProjectFile` using `this.#rules`, records findings to the repository's `AuditLog`, and returns the fully processed aggregate |
| `ValidateKey(llmServiceProxy)` | `Object` | Delegates API key validation to the LLM service |
| `ViewAuditLogs(repository)` | `Object` | Returns the `AuditLog` summary of a given repository |
| `ManageRules(action, data)` | `Object\|boolean` | Adds or removes `SanitizationRule` objects; synchronizes with the legacy `SanitizerService` for backward compatibility |
| `_loadGlobalRules()` | `SanitizationRule[]` | Maps built-in regex patterns and user-defined custom rules into OOP `SanitizationRule` instances |

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

Represents an individual file within a repository. Encapsulates its own sanitization and AST parsing.

| Member | Visibility | Type | Description |
|--------|-----------|------|-------------|
| `#path` | private | `string` | File path relative to repository root |
| `#rawContent` | private | `string` | File content (mutated in-place by `Sanitize`) |
| `#extension` | private | `string` | File extension (e.g., `.js`) |
| `#size` | private | `number` | File size in bytes |
| `#isSanitized` | private | `boolean` | Whether `Sanitize()` has been called |
| `#astTree` | private | `Object\|null` | Parsed AST structure |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `Sanitize(rules)` | `string[]` | Iterates over `SanitizationRule[]`, applies regex matching and replacement on `#rawContent`, returns list of matched pattern names for audit logging |
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

### 1.5 `SanitizationRule` — `src/models/sanitization-rule.model.js`

Encapsulates a single regex-based detection pattern.

| Member | Visibility | Type | Description |
|--------|-----------|------|-------------|
| `#id` | private | `string` | Unique identifier |
| `#name` | private | `string` | Human-readable pattern name |
| `#pattern` | private | `string` | Regex pattern source string |
| `#flags` | private | `string` | Regex flags (default: `gi`) |
| `#regex` | private | `RegExp` | Compiled `RegExp` instance |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `TestMatch(content)` | `boolean` | Tests if the regex matches the given text (resets `lastIndex` to avoid stateful bugs) |
| `Apply(content)` | `string` | Replaces all matches with `[REDACTED_SECRET]` |

---

### 1.6 `Documentation` — `src/models/documentation.model.js`

Represents the final generated markdown documentation artifact.

| Member | Visibility | Type | Description |
|--------|-----------|------|-------------|
| `#content` | private | `string` | Generated markdown content |
| `#generatedAt` | private | `Date` | Timestamp of generation |
| `#stats` | private | `Object` | Generation metadata (mode, sections, token usage) |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `SaveToDisk(repoName)` | `string` | Writes the documentation to `public/docs/` and returns the relative URL path |
| `PublishToPages()` | `boolean` | Placeholder for direct GitHub Pages deployment |

---

## 2. MVC Controller Layer

### `GeneratorController` — `src/controllers/generator.controller.js`

The sole controller class, exported as a singleton instance. It acts as a thin orchestrator delegating all business logic to domain models.

**Key Design Decisions:**

- A `User` object is constructed per-request from `req.ip` and `req.headers['x-api-key']` via the `getUserContext(req)` factory function.
- `Repository.fromDTO()` is used to reconstruct domain state across stateless HTTP boundaries for multi-step pipelines.
- The controller differentiates between `classic` and `agentic` generation modes via the `x-mode` header.
- The controller differentiates between `groq` and `ollama` providers via the `x-provider` header.

**Endpoint Mapping:**

| HTTP Method | Route | Controller Method | Description |
|-------------|-------|-------------------|-------------|
| `POST` | `/fetch` | `fetchRepo` | Fetches a GitHub repo via `User.SubmitRepository()`, returns sanitized files |
| `POST` | `/build` | `buildInput` | Builds LLM prompt messages via `LLMInputBuilder` |
| `POST` | `/generate-docs` | `generateDocs` | Generates documentation (classic or agentic mode) |
| `POST` | `/generate` | `generate` | Full pipeline in a single request |
| `POST` | `/validate-key` | `validateKey` | Validates a Groq API key via `User.ValidateKey()` |
| `GET` | `/audit` | `getAuditLogs` | Returns audit log info (per-repository in OOP mode) |
| `GET` | `/rules` | `listRules` | Lists all sanitization rules for the current user context |
| `POST` | `/rules` | `addRule` | Adds a custom rule via `User.ManageRules('add', ...)` |
| `DELETE` | `/rules/:id` | `removeRule` | Removes a custom rule via `User.ManageRules('remove', ...)` |
| `POST` | `/rules/test` | `testRule` | Tests a regex pattern against sample text using `SanitizationRule` |

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

### 3.4 `ArchitectureAgent` — `src/agents/architecture.agent.js`

Receives **all** `CodeIntelligenceAgent` results and builds a cross-file architecture map. This agent does NOT analyze individual files — it synthesizes results from all previous agents into a holistic view.

**Questions it answers:**
- What are the entry points of this application?
- How do services depend on each other?
- What is the data flow from request to response?
- What architectural patterns were used?
- What layers exist in this codebase?

**Output Schema:**
```json
{
  "repository": "repo name",
  "projectType": "web-api | cli | library | fullstack | microservice | other",
  "entryPoints": ["main entry files"],
  "layers": {
    "presentation": ["..."],
    "business": ["..."],
    "data": ["..."],
    "infrastructure": ["..."]
  },
  "serviceMap": [{ "service": "...", "file": "...", "dependsOn": [...], "exposedTo": [...] }],
  "dataFlow": "Step-by-step request flow",
  "patterns": ["MVC", "Service Layer", "..."],
  "apiSurface": { "totalRoutes": 0, "routes": [...] },
  "externalDependencies": { "llm": [...], "database": [...], "http": [...], "auth": [...], "other": [...] },
  "environmentConfig": [{ "var": "...", "purpose": "...", "required": true }],
  "securityPosture": "...",
  "strengths": ["..."],
  "gaps": ["..."],
  "summary": "3-4 sentence overview"
}
```

**Configuration:** `temperature: 0.1`, `maxTokens: 2000`, `maxRetries: 2`

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

Selects the optimal documentation template based on the project's nature and logic signals.

**Available Templates:**

| Template | Description | Use Case |
|----------|-------------|----------|
| `FULL_SOFTWARE` | Overview, Architecture, API, Setup, Technical Specs | Executable software projects |
| `RESOURCE_LIST` | Overview, Categorization, Contribution Guide (NO Architecture) | Documentation/resource repositories |
| `LIBRARY` | Overview, Installation, API Reference, Usage Examples | Reusable libraries |

**Output Schema:**
```json
{
  "templateId": "FULL_SOFTWARE",
  "requiredSections": ["Overview", "Architecture", "..."],
  "forbiddenSections": ["..."],
  "reasoning": "Why this template was selected"
}
```

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

### 5.1 `OrchestratorAgent` — `src/agents/orchestrator.agent.js`

The **full 5-phase pipeline** with batching, rate limiting, and parallel execution.

```
Phase 1: Filtrage & Prioritization
    → Filter files (skip node_modules, binaries, empty files)
    → Sort by importance: app.js → index.js → controllers → services → other

Phase 1.5: Fingerprint & Strategy Detection
    → FingerprintService identifies project nature (backend/frontend/devops)
    → Detect if project has executable code → choose FULL_ARCH or RESOURCE_ONLY

Phase 2: Security (Parallel)
    → Run SecurityAgent on ALL eligible files simultaneously
    → Regex sanitizer runs first, agent confirms and deepens
    → Files with "do_not_send" recommendation are blocked

Phase 3: Code Intelligence (Batched)
    → Run CodeIntelligenceAgent on safe files only
    → Batch size: 3 files per batch (configurable)
    → Batch delay: 12 seconds between batches (Groq rate limit)
    → Max files: 15 (configurable)

Phase 4: Architecture
    → ArchitectureAgent synthesizes all Code Intelligence results
    → Builds cross-file dependency map, data flow, and patterns

Phase 5: Writer
    → WriterAgent generates final markdown documentation
    → Adapts strategy based on project nature and analysis results
```

**Configuration:**

| Option | Default | Description |
|--------|---------|-------------|
| `batchSize` | 3 | Files per concurrent LLM batch |
| `batchDelayMs` | 12000 | Delay between batches (respects Groq rate limits) |
| `maxFiles` | 15 | Maximum files to analyze |
| `onProgress` | `() => {}` | Callback for pipeline progress events |

---

### 5.2 `EnforcedOrchestrator` — `src/agents/enforced-orchestrator.agent.js`

A **simplified 4-stage certified pipeline** designed to prevent hallucinated documentation.

```
Stage 1: RETRIEVER
    → Select high-signal files (.js, .ts, .py, .json, .md, .tf, .yml)
    → Skip node_modules, limit to 25 files

Stage 2: REPO ANALYZER (anti-hallucination)
    → RepoAnalyzerAgent classifies project nature
    → Extracts ground-truth logic signals
    → Prevents the writer from inventing features

Stage 3: TEMPLATE SELECTOR
    → TemplateSelectorAgent chooses the documentation schema
    → Defines required and forbidden sections

Stage 4: WRITER
    → WriterAgent generates final documentation
    → Constrained by the selected template
```

---

## 6. Fingerprint Service

`src/services/fingerprint.service.js` — Identifies the project nature (Backend, Frontend, DevOps) without hardcoded lists, using a **weighted scoring system**.

### Signature Definitions

| Nature | Key Files | Key Directories | Weight |
|--------|-----------|-----------------|--------|
| **Frontend** | `package.json`, `webpack.config.js`, `tailwind.config.js`, `next.config.js` | `src/components`, `public`, `assets` | 1.0 |
| **Backend** | `pom.xml`, `build.gradle`, `go.mod`, `composer.json`, `requirements.txt`, `prisma.schema` | `src/main`, `controllers`, `models`, `api`, `routes` | 1.1 |
| **DevOps** | `main.tf`, `docker-compose.yml`, `Dockerfile`, `Chart.yaml`, `ansible.cfg` | `terraform`, `kubernetes`, `.github/workflows`, `docker` | 1.5 |

### Scoring

- **+5 points** for each critical file match
- **+2 points** for each directory structure match
- Scores are multiplied by the nature's **weight** before comparison
- Returns the winning nature along with confidence level (`high` if score > 0, `low` otherwise)

---

## 7. Entropy-Based Detection

The `SanitizerService` includes a **Shannon entropy analysis** module (`shannonEntropy()` + `detectHighEntropyStrings()`) that catches high-entropy strings that no regex pattern can match.

### How It Works

1. Splits text into lines
2. Skips known safe high-entropy patterns (base64 data URIs, git SHA hashes, SHA256 hashes)
3. Looks for assignment patterns (`key = value` or `key: value`)
4. Calculates the Shannon entropy of the assigned value
5. Flags values with **entropy > 4.2** (statistically likely to be secrets or random tokens)

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
  "sanitizedContent": "..."
}
```

### Extended Pattern Set (40+ patterns)

Beyond the original 21 built-in patterns documented in SECURITY.md, the sanitizer now includes:

| Pattern | What it detects |
|---------|----------------|
| `email` | Email addresses |
| `phone_us` | US phone numbers |
| `phone_intl` | International phone numbers |
| `ssn` | Social Security Numbers |
| `credit_card` | Credit card numbers (Visa, MC, AMEX, Discover) |
| `ip_address` | IPv4 addresses |
| `ipv6` | IPv6 addresses |
| `mac_address` | MAC addresses |
| `iban` | International Bank Account Numbers |
| `date_of_birth` | Date of birth fields |
| `passport` | Passport numbers |
| `national_id` | National ID / CIN numbers |
| `stripe_key` | Stripe API keys |
| `twilio_sid` | Twilio Account SIDs |
| `twilio_token` | Twilio Auth Tokens |
| `firebase_key` | Firebase server keys |
| `jwt_token` | JSON Web Tokens |
| `basic_auth_url` | URLs with embedded credentials |
| `ssh_private_key` | OpenSSH private keys |
| `heroku_api_key` | UUID-shaped API keys |
| `npm_token` | NPM access tokens |
| `cloudinary_url` | Cloudinary URLs |
| `sendgrid_key` | SendGrid API keys |

---

## 8. Dual LLM Provider Support

The system supports two LLM providers, selectable per request via the `x-provider` header.

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

### Component Architecture

```
client/src/
├── App.jsx              ← Main application component, pipeline orchestration
├── main.jsx             ← React DOM entry point
├── index.css            ← Global styles
└── components/
    ├── KeyPanel.jsx     ← API key input & validation UI
    ├── PipelineSteps.jsx ← Visual pipeline progress indicator
    ├── PipelineState.jsx ← Pipeline state management
    ├── OutputPanel.jsx  ← Documentation output display
    ├── AuditPanel.jsx   ← Sanitization audit log viewer
    ├── RulesPanel.jsx   ← Custom sanitization rules management UI
    └── StatusBar.jsx    ← Connection status & provider indicator
```

---

## 10. Updated Project Structure

```
safe-file-generator/
├── src/
│   ├── app.js                              ← Express server entry point
│   ├── controllers/
│   │   └── generator.controller.js         ← MVC controller (thin orchestrator)
│   ├── models/                             ← OOP Domain Models [NEW]
│   │   ├── user.model.js                   ← User aggregate
│   │   ├── repository.model.js             ← Repository aggregate root
│   │   ├── project-file.model.js           ← File entity with self-sanitization
│   │   ├── audit-log.model.js              ← Per-repo audit trail
│   │   ├── sanitization-rule.model.js      ← Regex rule value object
│   │   └── documentation.model.js          ← Generated doc artifact
│   ├── agents/                             ← Multi-Agent System [NEW]
│   │   ├── base.agent.js                   ← Abstract base (LLM, retry, tracing)
│   │   ├── protocol.js                     ← AgentInput/AgentOutput contract
│   │   ├── orchestrator.agent.js           ← Full 5-phase pipeline
│   │   ├── enforced-orchestrator.agent.js  ← Certified 4-stage pipeline
│   │   ├── code-intelligence.agent.js      ← LLM-powered code understanding
│   │   ├── security.agent.js               ← Semantic secret detection
│   │   ├── architecture.agent.js           ← Cross-file architecture synthesis
│   │   ├── writer.agent.js                 ← Documentation generation
│   │   ├── repo-analyzer.agent.js          ← Project classification
│   │   └── template-selector.agent.js      ← Template selection
│   ├── services/
│   │   ├── github.service.js               ← Octokit GitHub API client
│   │   ├── sanitizer.service.js            ← Regex + entropy detection (40+ patterns)
│   │   ├── ast-parser.service.js           ← Regex-based JS/TS/Python parser
│   │   ├── llm-input-builder.service.js    ← Prompt builder (AST + raw modes)
│   │   ├── llm.service.js                  ← Dual provider: Groq + Ollama
│   │   ├── audit-log.service.js            ← Legacy in-memory audit trail
│   │   ├── fingerprint.service.js          ← Project nature detection [NEW]
│   │   └── rate-limiter.middleware.js       ← Sliding window rate limiter
│   └── views/
│       ├── index.ejs                       ← Legacy EJS template
│       └── error.ejs                       ← Error page template
├── client/                                 ← React Frontend [NEW]
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css
│   │   └── components/ (7 components)
│   ├── vite.config.js
│   └── package.json
├── scripts/
│   ├── generate-docs-ci.js                 ← CI headless pipeline runner
│   └── semantic-diff.js                    ← AST-based smart trigger
├── docs/                                   ← Documentation
│   ├── ARCHITECTURE.md                     ← System layers and data flow
│   ├── WORKFLOW.md                         ← Step-by-step pipeline description
│   ├── SECURITY.md                         ← Secret detection model (original)
│   ├── CI-CD.md                            ← GitHub Actions automation
│   └── OOP_ARCHITECTURE.md                 ← This document
└── package.json
```

---

## 11. Class Diagram

```
┌─────────────────────┐       owns        ┌──────────────────────┐
│        User          │──────────────────▶│   SanitizationRule   │
│─────────────────────│       0..*        │──────────────────────│
│ - #id: string        │                   │ - #id: string        │
│ - #apiKey: string    │                   │ - #name: string      │
│ - #rules: Rule[]     │                   │ - #pattern: string   │
│─────────────────────│                   │ - #flags: string     │
│ + SubmitRepository() │                   │ - #regex: RegExp     │
│ + ValidateKey()      │                   │──────────────────────│
│ + ViewAuditLogs()    │                   │ + TestMatch(content) │
│ + ManageRules()      │                   │ + Apply(content)     │
└────────┬────────────┘                   └──────────────────────┘
         │ creates
         ▼
┌─────────────────────┐       owns        ┌──────────────────────┐
│    Repository        │──────────────────▶│     ProjectFile      │
│─────────────────────│       0..*        │──────────────────────│
│ - #url: string       │                   │ - #path: string      │
│ - #owner: string     │                   │ - #rawContent: string│
│ - #name: string      │                   │ - #extension: string │
│ - #files: File[]     │                   │ - #isSanitized: bool │
│ - #documentation     │                   │ - #astTree: Object   │
│ - #auditLog          │                   │──────────────────────│
│ - #octokit           │                   │ + Sanitize(rules)    │
│─────────────────────│                   │ + ExtractAST()       │
│ + FetchFiles()       │                   │ + toJSON()           │
│ + GenerateDocumentation()│               └──────────────────────┘
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
│ + PublishToPages()   │
└─────────────────────┘
```

### Agent Hierarchy

```
┌────────────────────────┐
│       BaseAgent        │ ◄── Abstract (LangChain + Groq + retry + tracing)
│────────────────────────│
│ + run(agentInput)      │
│ + callLLM(prompt)      │
│ + callLLMJSON(prompt)  │
│ + truncate(text)       │
└────────┬───────────────┘
         │ extends
    ┌────┴────┬───────────┬───────────────┬──────────────┬────────────────┬──────────────────┐
    ▼         ▼           ▼               ▼              ▼                ▼                  ▼
Security   CodeIntel   Architecture    Writer     RepoAnalyzer    TemplateSelector    Orchestrators
 Agent      Agent        Agent         Agent       Agent             Agent           (x2 variants)
```

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
│  EnforcedOrchestrator / OrchestratorAgent                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Stage 1: FILE RETRIEVAL                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Filter high-signal files (.js, .ts, .py, .json, .md) │    │
│  │ Skip node_modules, limit budget                       │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Stage 2: REPO ANALYSIS                                      │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ RepoAnalyzerAgent                                     │    │
│  │ ► FingerprintService (structural scoring)             │    │
│  │ ► ASTParserService (logic signal extraction)          │    │
│  │ ► LLM classification → projectNature, logicSignals    │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Stage 3: TEMPLATE SELECTION                                 │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ TemplateSelectorAgent                                 │    │
│  │ ► Chooses: FULL_SOFTWARE | RESOURCE_LIST | LIBRARY    │    │
│  │ ► Defines required/forbidden sections                 │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Stage 4: DOCUMENTATION GENERATION                           │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ WriterAgent                                           │    │
│  │ ► Generates sections in parallel (Promise.allSettled) │    │
│  │ ► Adapts to project nature and selected template      │    │
│  │ ► Output: Final markdown documentation                │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           ▼                                  │
│  Return: { documentation, stats }                            │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
              Documentation Model
              ► .content (markdown)
              ► .stats (metadata)
              ► .SaveToDisk()
```

### Full OrchestratorAgent (5-Phase) — Additional Stages

```
Phase 2: SECURITY (Parallel)
    ┌───────────────────────────────────────────────┐
    │ For each file (concurrent):                   │
    │   1. SanitizerService.audit() → regex pass    │
    │   2. SecurityAgent.run() → semantic AI pass   │
    │   3. Merge findings → recommendation          │
    │   4. Block "do_not_send" files                │
    └───────────────────────────────────────────────┘

Phase 3: CODE INTELLIGENCE (Batched)
    ┌───────────────────────────────────────────────┐
    │ For each safe file (batches of 3):            │
    │   1. ASTParserService.parseFiles() → syntax   │
    │   2. ASTParserService.toSummary() → compact   │
    │   3. CodeIntelligenceAgent.run() → semantics  │
    │   4. Wait 12s between batches (rate limit)    │
    └───────────────────────────────────────────────┘
```
