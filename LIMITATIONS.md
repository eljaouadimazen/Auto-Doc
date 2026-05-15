# Known Limitations

This document covers known limitations of the sanitization engine and AST parser.
These are documented transparently for evaluation purposes.

## 1. Regex-Based Sanitization — False Positives

The sanitizer uses regex patterns to detect secrets. While effective for most real secrets, several patterns will produce false positives in certain contexts.

### High False Positive Patterns

| Pattern | Regex | False Positive Risk | Example |
|---|---|---|---|
| `heroku_api_key` | `[0-9a-f]{8}-[0-9a-f]{4}-...` | **Very High** — matches ANY UUID | `const id = "550e8400-e29b-41d4-a716-446655440000"` (database ID, not a key) |
| `passport` | `[A-Z]{1,2}[0-9]{6,9}` | **Very High** — matches IDs, codes, hex | `"AB123456"` (version number, serial code) |
| `ip_address` | Full IPv4 validation | **High** — matches ALL valid IPs including localhost | `127.0.0.1`, `192.168.1.1` in config examples |
| `email` | Standard email regex | **Medium** — flags emails in README, docs, tests | `user@example.com` in documentation |

### Why This Design

Regex-based detection is a **trade-off**: it's fast, doesn't require external dependencies, and catches the most common secret patterns. A production-grade system would use:

- **Entropy-based detection** (high Shannon entropy = likely secret)
- **Context-aware scanning** (is this in a `.env` file vs. a README?)
- **Allowlist configuration** (skip known test files, documentation)
- **Multiple detection strategies** (regex + entropy + keyword proximity)

For this project's scope, regex provides adequate coverage with known, documented false positive rates.

### Mitigation

- False positives are **non-destructive** — tokens are stored in the vault and can be reintegrated
- Users can review the audit log to see which patterns triggered
- Custom rules can be removed if they cause excessive noise
- The system errs on the side of caution: better to flag a false positive than miss a real secret

## 2. AST Parser — Regex-Based, Not a Real Parser

The `ast-parser.service.js` uses regex to extract code structure (imports, exports, classes, functions, routes). It is **not** a true AST parser like Babel, Esprima, or Tree-sitter.

### What It Handles Well

- Standard ES modules: `import { x } from 'y'`
- CommonJS: `require('module')`
- Class declarations with methods
- Express route definitions: `app.get('/path', handler)`
- JSDoc comments
- Environment variable access: `process.env.VAR`
- Python imports, classes, functions

### Known Limitations

| Feature | Support | Issue |
|---|---|---|
| TypeScript decorators | ❌ | `@Injectable()` patterns not recognized |
| Complex generics | ❌ | `function foo<T extends Record<string, any>>()` may misparse |
| Dynamic requires | ❌ | `require(\`./modules/${name}\`)` not detected |
| Template literal imports | ❌ | Not supported |
| Braces in strings/comments | ⚠️ | `extractBlock()` counts `{`/`}` without string awareness |
| Python decorators | ⚠️ | Basic `@decorator` detection, misses complex cases |
| Python type hints | ⚠️ | Partial support for `def foo(x: int) -> str:` |
| Dynamic Express routes | ⚠️ | `app.use('/api', router)` partially detected |

### Fallback Behavior

When the AST parser fails to parse a file (line 211 of `scripts/semantic-diff.js`), it **defaults to assuming a structural change**. This is safe — it may trigger unnecessary doc regeneration, but it never misses a real structural change.

### Why This Design

A full AST parser would require:
- `@babel/parser` for JavaScript/TypeScript (~15MB dependency)
- `ast` or `lib2to3` for Python
- Language detection and parser selection logic
- Version compatibility management

For this project's scope (primarily JS/TS + basic Python), regex provides sufficient structural analysis with zero additional dependencies. The semantic diff is used in CI to avoid unnecessary LLM calls for purely cosmetic changes — the fallback-to-regenerate behavior is the correct safe default.

## 3. In-Memory State

### Audit Logs
- **Current**: In-memory array per Repository instance, lost on server restart
- **No SQLite**: Despite plans documented elsewhere, there is NO SQLite dependency or implementation. `package.json` has no `sqlite3` or `better-sqlite3` package.

### Sanitizer Custom Rules
- Custom rules added at runtime are lost on server restart
- No persistence layer for user-defined patterns
- Mitigation: Max 50 rules enforced; users can re-add via API after restart

### Sanitizer Custom Rules
- Custom rules added at runtime are lost on server restart
- No persistence layer for user-defined patterns
- Mitigation: Max 50 rules enforced; users can re-add via API after restart

## 4. LLM Provider Quirks

### Gemini API Key in URL (Validation Only)
- Key validation uses `?key=` query parameter in URL
- This can leak in proxy/server logs
- Mitigation: Only used during `/validate-key` endpoint, not during generation

### No Rate Limit Coordination
- Both the classic pipeline (`llm.service.js`) and agentic pipeline (`base.agent.js`) can fire concurrent requests
- No shared rate limiter between the two paths
- Mitigation: Per-provider retry logic with exponential backoff

## 5. Security Headers

The following HTTP security headers are not yet implemented:
- `Content-Security-Policy` (CSP)
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`

These are planned for a future iteration. In production, a reverse proxy (nginx, Cloudflare) should provide these headers.

## 6. Test Suite

The project **has** an automated test suite:
- `jest.config.js` exists with coverage thresholds
- `ci.yml` runs `npm test` and `npm run test:coverage`
- `package.json` has `jest` and `supertest` in devDependencies

**Note:** This supersedes earlier claims that no test suite existed.
