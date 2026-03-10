# Security Model

## Security Objectives

- Prevent sensitive data from reaching the Groq LLM API
- Protect source code confidentiality
- Provide full auditability of what was detected and redacted
- Allow users to extend detection with custom rules at runtime

---

## Sensitive Data Detection

The `SanitizerService` runs two passes — once on the raw markdown blob returned by GitHub, and once per-file before building the LLM prompt. This double-pass ensures no secrets slip through.

### Built-in Detection Patterns (21 patterns)

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
| `private_key` | PEM private keys (RSA, EC, OpenSSH) |
| `certificate` | PEM certificates |
| `dotenv_value` | `.env` file key=value pairs (8+ char values) |

All detected values are replaced with `[REDACTED_SECRET]`. For `.env` patterns, the key name is preserved: `MY_KEY=[REDACTED]`.

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

## Audit Log

Every pipeline run is recorded in the `AuditLogService` (in-memory, 500 entry rolling cap).

Each audit entry contains:
- Timestamp and repository name
- IP address (masked to first two octets: `192.168.x.x`)
- Mode used (`ast` or `raw`)
- Which files had findings
- Which pattern types matched (never the actual secret values)
- Total redaction count

Retrievable via:
```http
GET /audit?limit=50&onlyIssues=true
```

---

## API Key Security

- User-provided Groq API keys are sent via `x-api-key` header on each request
- Keys are never stored server-side — not in memory, not in logs
- The server's own key (from `.env`) is used only as fallback
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