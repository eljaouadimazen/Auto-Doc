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

### Per-Request Session Isolation

Each HTTP request creates an isolated `SanitizerSession` via `sanitizerService.createSession()`. The session owns its own vault (`Map<token, originalValue>`). When the request completes, `session.destroy()` clears the vault. This eliminates race conditions between concurrent requests.

### Key Methods

| Method | Description |
|--------|-------------|
| `anonymize(text)` | Scans text, replaces secrets with vault tokens, returns anonymized text |
| `reintegrate(text)` | Swaps vault tokens back to original values in LLM output |
| `session.destroy()` | Clears the vault when a request completes (session isolation) |
| `resetVault()` | **Deprecated** — no-op, kept for backward compatibility |

### All detected values are tokenized — never sent raw to any LLM.

---

## Sensitive Data Detection

### Built-in Detection Patterns (47 patterns)

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
| `heroku_api_key` | Heroku API keys (requires `HEROKU_API_KEY=` context prefix) |
| `npm_token` | NPM access tokens |
| `cloudinary_url` | Cloudinary URLs |
| `sendgrid_key` | SendGrid API keys |

#### PII Detection (10 patterns)

| Pattern Name | What it detects |
|---|---|
| `email` | Email addresses (word-boundary enforced) |
| `phone_us` | US phone numbers |
| `phone_intl` | International phone numbers |
| `ssn` | Social Security Numbers |
| `credit_card` | Credit card numbers (Visa, MC, AMEX, Discover) |
| `ip_address` | Public IPv4 addresses (excludes private ranges: 10.x, 127.x, 192.168.x, 172.16-31.x) |
| `ipv6` | IPv6 addresses |
| `mac_address` | MAC addresses |
| `iban` | International Bank Account Numbers |
| `date_of_birth` | Date of birth fields |
| `passport` | Passport numbers (requires `passport_no`/`passport number` context prefix) |
| `national_id` | National ID / CIN numbers |

All detected values are replaced with vault tokens (e.g., `[TOKEN_AWS_KEY_a7b2]`). For `.env` patterns, the key name is preserved: `DB_PASSWORD=[TOKEN_DOTENV_VALUE_c3d4]`.

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

Every pipeline run records findings in the per-repository `AuditLog`, which is backed by **SQLite** (`data/audit-log.db`). Each repository owns its own audit session, eliminating global singleton race conditions.

Each audit entry contains:
- Session ID (UUID) and repository URL
- Timestamp (persisted in SQLite)
- Files scanned and files affected
- Which pattern types matched (never the actual secret values or vault tokens)
- Total redaction/tokenization count

**Auto-eviction:** When the database exceeds configured limits (default: 100 sessions, 1000 entries), the oldest records are automatically removed to prevent unbounded growth.

Retrievable via:
```http
GET /audit?limit=10
```

Returns recent audit session summaries. Full findings are available per-session in the `/fetch` and `/build` responses.

---

## Log Sanitization

All `console.error` output is globally sanitized at server startup via a monkey-patch in `app.js`. This ensures that even error paths that forget to call `sanitizeLog()` manually will never leak API keys, secrets, or credentials into server logs or monitoring systems.

Patterns stripped from error output: Groq keys (`gsk_...`), OpenAI keys (`sk-...`), GitHub PATs (`ghp_...`), AWS keys (`AKIA...`), Gemini keys (`AIza...`), Stripe keys, Bearer tokens, database URIs, private keys, and more.

---

## Security Headers

The Express server uses `helmet` middleware to set the following HTTP security headers on every response:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; object-src 'none'; frame-src 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Referrer-Policy` | `no-referrer` |

CORS is configured to allow only `localhost:5173` (Vite dev) and `localhost:3000` by default, configurable via `ALLOWED_ORIGINS` env var.

---

## Per-Endpoint Body Size Limits

Beyond the global 10 MB body limit, individual endpoints enforce stricter caps:

| Endpoint | Max Body |
|----------|----------|
| `/rules` POST | 10 KB |
| `/validate-key` | 100 KB |
| `/rules/test` | 100 KB |
| `/fetch`, `/generate-docs` | 2 MB |
| `/build` | 15 MB |

---

## API Key Security

- User-provided API keys (Groq/Gemini/OpenRouter) are sent via `x-api-key` header on each request
- Keys are never stored server-side — not in memory, not in logs
- For Ollama (local provider), no key is required
- The server's own keys (from `.env`) are used only as fallback
- Key validation uses provider-specific endpoints (`/models` for Groq, `GET /models` for Gemini, `/auth/key` for OpenRouter) — zero tokens consumed

---

## File Filtering

The following files are never sent to the LLM regardless of content:

- `.env`, `.env.local`, `.env.production`, `.env.development`
- `.npmrc`, `.pypirc`, `credentials`
- `id_rsa`, `id_ed25519`
- `secrets.yaml`, `secrets.json`, `secrets.yml`
- Anything inside `node_modules/`, `/vendor/`, `/dist/`, `/build/`, `/.git/`
- Binary files: images, fonts, archives, executables, compiled assets