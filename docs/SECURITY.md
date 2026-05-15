# Security Model

## Security Objectives

- Prevent sensitive data from reaching the Groq LLM API
- Protect source code confidentiality
- Provide full auditability of what was detected and redacted
- Allow users to extend detection with custom rules at runtime

---

## Vault-Based Anonymization Pipeline

The `SanitizerService` uses a **vault-based token anonymization** approach instead of destructive redaction. This is a two-phase pipeline:

### Phase 1 — Anonymize (before LLM)
Secrets are replaced with **stable vault tokens** that preserve contextual meaning:

```
OLD: SECRET_KEY=[REDACTED_SECRET]        ← dead text, LLM can't reason about it
NEW: SECRET_KEY=[TOKEN_SECRET_KEY_a7b2]  ← LLM understands this is a secret key
```

The vault (`Map<token, originalValue>`) is cleared between requests via `resetVault()`. Identical values in the same session receive the same token (deduplication).

### Phase 2 — Reintegrate (after LLM)
After the LLM generates documentation, `reintegrate(llmOutput)` swaps every token back to its original value **locally on the server**. The mapping never leaves the server — the LLM never sees real secrets.

### Key Methods

| Method | Description |
|--------|-------------|
| `anonymize(text)` | Scans text, replaces secrets with vault tokens, returns anonymized text |
| `reintegrate(text)` | Swaps vault tokens back to original values in LLM output |
| `resetVault()` | Clears the vault between requests (session isolation) |
| `audit(text)` | Returns list of matched pattern names without modifying text |
| `detectHighEntropyStrings(text)` | Shannon entropy pass for secrets no regex matched |

### All detected values are tokenized — never sent raw to any LLM.

---

## Sensitive Data Detection

### Built-in Detection Patterns (34 built-in patterns)

**Two-tier sanitization system:**
1. **`SanitizationRule.Apply()`** — Destructive replacement with `[REDACTED_SECRET]`
2. **`SanitizerSession`** — Vault-based tokenization with re-integrable tokens

#### Secrets & API Keys (21 patterns)

| Pattern Name | What it detects |
|---|---|
| `api_key` | Generic API key assignments |
| `secret_key` | Generic secret key assignments |
| `access_token` | Generic access token assignments |
| `token` | Generic token assignments (16+ chars) |
| `password` | Password assignments in code |
| `passwd` | passwd assignments in code |
| `github_pat` | GitHub personal access tokens (`ghp_...`) |
| `github_actions` | GitHub Actions tokens (`ghs_...`) |
| `openai_key` | OpenAI API keys (`sk-...`) |
| `slack_token` | Slack tokens (`xox...`) |
| `aws_key` | AWS access key IDs (`AKIA...`) |
| `mailchimp_key` | Mailchimp API keys |
| `google_api_key` | Google API keys (`AIza...`) |
| `groq_key` | Groq API keys (`gsk_...`) |
| `mongodb_uri` | MongoDB connection strings |
| `postgres_uri` | PostgreSQL connection strings |
| `mysql_uri` | MySQL connection strings |
| `redis_uri` | Redis connection strings |
| `private_key_block` | PEM private keys (RSA, EC, OpenSSH) |
| `ssh_private_key` | OpenSSH private keys |
| `certificate` | PEM certificates |
| `dotenv_value` | `.env` file key=value pairs (8+ char values) |
| `stripe_key` | Stripe API keys |
| `twilio_sid` | Twilio Account SIDs |
| `twilio_token` | Twilio Auth Tokens |
| `firebase_key` | Firebase server keys |
| `jwt_token` | JSON Web Tokens |
| `basic_auth_url` | URLs with embedded credentials |
| `heroku_api_key` | UUID-shaped API keys |
| `npm_token` | NPM access tokens |
| `cloudinary_url` | Cloudinary URLs |
| `sendgrid_key` | SendGrid API keys |

#### PII Detection (10 patterns)

| Pattern Name | What it detects |
|---|---|
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

All detected values are replaced with vault tokens (e.g., `[TOKEN_AWS_KEY_a7b2]`). For `.env` patterns, the key name is preserved: `DB_PASSWORD=[TOKEN_DOTENV_VALUE_c3d4]`.

### Shannon Entropy Detection

Beyond regex patterns, a **Shannon entropy analysis** pass catches high-entropy strings that no pattern matches:

1. Splits text into lines, skips known safe contexts (base64 data URIs, git SHAs, SHA-256 hashes)
2. Extracts assignment values (`key = value` or `key: value`)
3. Calculates entropy; flags values with **entropy > 4.2** as likely secrets
4. Tokenizes hits the same way as regex matches

---

## Custom Rules API

Users can add their own detection patterns at runtime without restarting the server.

```http
POST /rules
{ "name": "my_internal_token", "pattern": "INT_[A-Z0-9]{32}", "flags": "g" }

DELETE /rules/:id

POST /rules/test
{ "pattern": "INT_[A-Z0-9]{32}", "sample": "token=INT_ABC123..." }
```

Custom rules are applied alongside built-in patterns in every `clean()` and `audit()` call.

---

## Audit Trail

Every pipeline run records findings in the per-repository `AuditLog` (owned by the `Repository` aggregate). In OOP mode, audit entries are no longer a global singleton — each repository owns its own audit trail.

Each audit entry contains:
- Timestamp and repository name
- Files scanned and files affected
- Which pattern types matched (never the actual secret values or vault tokens)
- Total redaction/tokenization count

Retrievable via:
```http
GET /audit
```

The `SanitizerService` also exposes `getVaultSnapshot()` for debugging — returns a read-only, truncated view of active tokens (values longer than 40 chars are clipped).

---

## API Key Security

- User-provided API keys (Groq/Ollama) are sent via `x-api-key` header on each request
- Keys are never stored server-side — not in memory, not in logs
- For Ollama (local provider), no key is required
- The server's own Groq key (from `.env`) is used only as fallback
- Key validation uses Groq's `/v1/models` endpoint — zero tokens consumed

---

## File Filtering

The following files are never sent to the LLM regardless of content:

- `.env`, `.env.local`, `.env.production`, `.env.development`
- `.npmrc`, `.pypirc`, `credentials`
- `id_rsa`, `id_ed25519`
- `secrets.yaml`, `secrets.json`, `secrets.yml`
- Anything inside `node_modules/`, `/vendor/`, `/dist/`, `/build/`, `/.git/`
- Binary files: images, fonts, archives, executables, compiled assets

---

## Global Log Sanitizer (`log-sanitizer.js`)

**File:** `src/services/log-sanitizer.js`

A critical security feature that intercepts `console.error` globally and strips secrets from error messages before they hit logs.

### How It Works

1. **Applied at startup** (`src/app.js:15`):
   ```javascript
   const { sanitizeLog } = require('./services/log-sanitizer');
   ```

2. **Uses the same regex patterns** as the `SanitizerService` to detect:
   - API keys (`gsk_...`, `sk-...`, `AIza...`)
   - Database URIs with credentials
   - Passwords, tokens, private keys
   - Email addresses, PII

3. **Replaces matches** with `[REDACTED]` in error output

### Protection Scope

| Threat | Mitigation |
|--------|------------|
| Accidental key leakage in stack traces | Secrets stripped before logging |
| Debug output containing credentials | Patterns matched and redacted |
| Third-party library error messages | Global hook intercepts all `console.error` |

---

## Sanitizer Session System

**Files:**
- `src/services/sanitizer-session.js` — Per-request vault
- `src/services/sanitizer-session-store.js` — Session persistence across HTTP requests

This is the **core vault-based tokenization system** that enables the multi-step HTTP pipeline (`/fetch` → `/build` → `/generate-docs`).

### Two-Tier Sanitization Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Two Sanitization Systems                   │
├─────────────────────────────────┬───────────────────────────┤
│  SanitizationRule (Model)       │  SanitizerSession         │
├─────────────────────────────────┼───────────────────────────┤
│  Destructive replacement        │  Vault-based tokenization  │
│  Output: [REDACTED_SECRET]      │  Output: [TOKEN_XXX_a7b2] │
│  Used in: ProjectFile.Sanitize()│  Used in: HTTP pipeline   │
│  Cannot be reversed             │  Re-integrable after LLM   │
└─────────────────────────────────┴───────────────────────────┘
```

### SanitizerSession Features

| Feature | Description |
|---------|-------------|
| **Vault Storage** | `Map<token, originalValue>` — tokens map back to secrets |
| **Token Format** | `[TOKEN_<PATTERN_NAME>_<4char_hash>]` — e.g., `[TOKEN_AWS_KEY_a7b2]` |
| **Deduplication** | Identical values get the same token (reduces token count) |
| **Entropy Detection** | Shannon entropy scan for high-entropy strings regex missed |
| **Session Isolation** | Each request gets its own vault; cleared after `reintegrate()` |

### SanitizerSessionStore Features

| Feature | Description |
|---------|-------------|
| **Cross-Request Persistence** | Sessions stored by `sessionId` across HTTP requests |
| **Multi-Step Pipeline** | Enables `/fetch` → `/build` → `/generate-docs` workflow |
| **Lifecycle** | Created at `/build`, destroyed after `/generate-docs` |
| **Session ID** | Returned in `/build` response; passed back to `/generate-docs` |

### Token Lifecycle

```
1. User POST /fetch
   └── Repository model fetches files
   └── SanitizationRule.Apply() → [REDACTED_SECRET] (destructive)
   └── Returns sanitized files

2. User POST /build
   └── SanitizerSessionStore.createSession() → sessionId
   └── SanitizerSession.anonymize() → vault populated
       ├── Regex patterns matched → tokens
       └── Entropy scan → high-entropy strings tokenized
   └── Returns { chunks, sessionId, vaultSize }

3. User POST /generate-docs (with sessionId)
   └── SanitizerSessionStore.get(sessionId) → vault restored
   └── LLM generates docs using tokens (no real secrets)
   └── SanitizerSession.reintegrate(output) → tokens → secrets
   └── SanitizerSessionStore.destroy(sessionId) → vault cleared
   └── Returns documentation with real values restored
```

### Why This Is Secure

1. **Real secrets never leave the server** — only context-aware tokens
2. **LLM can reason about tokens** — `[TOKEN_AWS_KEY_a7b2]` tells the LLM "this is an AWS key"
3. **Vault is ephemeral** — destroyed after each pipeline run
4. **No persistence** — sessions are in-memory only; lost on server restart