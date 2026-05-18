# 🔒 Security Audit Report: Auto-Doc

## Summary
| Metric | Value |
|---|---|
| Files Scanned | 80 |
| Files with Secrets | 25 |
| Total Redactions | 231 |

## Findings
### `README.md`
- Redacted patterns: api_key, dotenv_value
### `client/index.html`
- Redacted patterns: basic_auth_url
### `client/package-lock.json`
- Redacted patterns: basic_auth_url, high_entropy (score: 5.43), high_entropy (score: 5.50), high_entropy (score: 5.45), high_entropy (score: 5.46), high_entropy (score: 5.53), high_entropy (score: 5.50), high_entropy (score: 5.49), high_entropy (score: 5.37), high_entropy (score: 5.43), high_entropy (score: 5.32), high_entropy (score: 5.47), high_entropy (score: 5.42), high_entropy (score: 5.52), high_entropy (score: 5.35), high_entropy (score: 5.53), high_entropy (score: 5.53), high_entropy (score: 5.54), high_entropy (score: 5.52), high_entropy (score: 5.46), high_entropy (score: 5.52), high_entropy (score: 5.41), high_entropy (score: 5.39), high_entropy (score: 5.50), high_entropy (score: 5.47), high_entropy (score: 5.52), high_entropy (score: 5.61), high_entropy (score: 5.54), high_entropy (score: 5.66), high_entropy (score: 5.41), high_entropy (score: 5.56), high_entropy (score: 5.42), high_entropy (score: 5.51), high_entropy (score: 5.45), high_entropy (score: 5.55), high_entropy (score: 5.52), high_entropy (score: 5.54), high_entropy (score: 5.47), high_entropy (score: 5.47), high_entropy (score: 5.31), high_entropy (score: 5.61), high_entropy (score: 5.53), high_entropy (score: 5.43), high_entropy (score: 5.57), high_entropy (score: 5.38), high_entropy (score: 5.53), high_entropy (score: 5.43), high_entropy (score: 5.48), high_entropy (score: 5.56), high_entropy (score: 5.59), high_entropy (score: 5.49), high_entropy (score: 5.58), high_entropy (score: 5.41), high_entropy (score: 5.46), high_entropy (score: 5.36), high_entropy (score: 5.46), high_entropy (score: 5.50), high_entropy (score: 5.52), high_entropy (score: 5.45), high_entropy (score: 5.46), high_entropy (score: 5.50), high_entropy (score: 5.63), high_entropy (score: 5.36), high_entropy (score: 5.50), high_entropy (score: 5.45), high_entropy (score: 5.54), high_entropy (score: 5.47), high_entropy (score: 5.66), high_entropy (score: 5.49), high_entropy (score: 5.59), high_entropy (score: 5.48), high_entropy (score: 5.53), high_entropy (score: 5.40), high_entropy (score: 5.34), high_entropy (score: 5.64), high_entropy (score: 5.56), high_entropy (score: 5.59), high_entropy (score: 5.44), high_entropy (score: 5.51), high_entropy (score: 5.48), high_entropy (score: 5.43), high_entropy (score: 5.55), high_entropy (score: 5.68), high_entropy (score: 5.53), high_entropy (score: 5.40), high_entropy (score: 5.51), high_entropy (score: 5.38), high_entropy (score: 5.37), high_entropy (score: 5.38), high_entropy (score: 5.59), high_entropy (score: 5.53), high_entropy (score: 5.47), high_entropy (score: 5.38), high_entropy (score: 5.61), high_entropy (score: 5.55), high_entropy (score: 5.41), high_entropy (score: 5.57), high_entropy (score: 5.54), high_entropy (score: 5.35), high_entropy (score: 5.52), high_entropy (score: 5.36), high_entropy (score: 5.62), high_entropy (score: 5.39), high_entropy (score: 5.54), high_entropy (score: 5.48), high_entropy (score: 5.52), high_entropy (score: 5.49), high_entropy (score: 5.51), high_entropy (score: 5.47), high_entropy (score: 5.44), high_entropy (score: 5.48), high_entropy (score: 5.52), high_entropy (score: 5.49), high_entropy (score: 5.57), high_entropy (score: 5.51), high_entropy (score: 5.39), high_entropy (score: 5.55), high_entropy (score: 5.55), high_entropy (score: 5.47), high_entropy (score: 5.39), high_entropy (score: 5.57), high_entropy (score: 5.49), high_entropy (score: 5.49), high_entropy (score: 5.55), high_entropy (score: 5.56), high_entropy (score: 5.57), high_entropy (score: 5.47), high_entropy (score: 5.40), high_entropy (score: 5.50), high_entropy (score: 5.56), high_entropy (score: 5.59), high_entropy (score: 5.64), high_entropy (score: 5.42), high_entropy (score: 5.44), high_entropy (score: 5.55), high_entropy (score: 5.49), high_entropy (score: 5.49), high_entropy (score: 5.52), high_entropy (score: 5.47), high_entropy (score: 5.51), high_entropy (score: 5.60), high_entropy (score: 5.47), high_entropy (score: 5.43), high_entropy (score: 5.55), high_entropy (score: 5.47), high_entropy (score: 5.52), high_entropy (score: 5.50), high_entropy (score: 5.41), high_entropy (score: 5.57), high_entropy (score: 5.43), high_entropy (score: 5.43), high_entropy (score: 5.49), high_entropy (score: 5.56), high_entropy (score: 5.33), high_entropy (score: 5.58), high_entropy (score: 5.31), high_entropy (score: 5.47), high_entropy (score: 5.52), high_entropy (score: 5.55), high_entropy (score: 5.64), high_entropy (score: 5.42), high_entropy (score: 5.52), high_entropy (score: 5.44), high_entropy (score: 5.37), high_entropy (score: 5.50), high_entropy (score: 5.41), high_entropy (score: 5.36), high_entropy (score: 5.41)
### `client/src/App.css`
- Redacted patterns: basic_auth_url
### `client/src/index.css`
- Redacted patterns: basic_auth_url
### `docs/OOP_ARCHITECTURE.md`
- Redacted patterns: aws_key, private_key_block, phone_us, high_entropy (score: 4.38)
### `public/assets/index-BWWuwl8-.css`
- Redacted patterns: basic_auth_url
### `public/index.html`
- Redacted patterns: basic_auth_url
### `scripts/generate-docs-ci.js`
- Redacted patterns: basic_auth_url
### `scripts/semantic-diff.js`
- Redacted patterns: phone_us
### `src/agents/base.agent.js`
- Redacted patterns: api_key, basic_auth_url
### `src/agents/enforced-orchestrator.agent.js`
- Redacted patterns: api_key
### `src/agents/protocol.js`
- Redacted patterns: api_key
### `src/controllers/generator.controller.js`
- Redacted patterns: api_key
### `src/models/repository.model.js`
- Redacted patterns: api_key
### `src/services/llm.service.js`
- Redacted patterns: basic_auth_url
### `src/services/sanitizer-session.js`
- Redacted patterns: token
### `src/services/sanitizer.service.js`
- Redacted patterns: private_key_block, ssh_private_key, certificate
### `tests/enforced-orchestrator.agent.test.js`
- Redacted patterns: api_key
### `tests/llm.service.test.js`
- Redacted patterns: api_key
### `tests/log-sanitizer.test.js`
- Redacted patterns: secret_key, token, password, github_pat, aws_key, groq_key, mongodb_uri, private_key_block, email, phone_us, jwt_token, high_entropy (score: 4.79), high_entropy (score: 5.17), high_entropy (score: 4.52), high_entropy (score: 4.52)
### `tests/rate-limiter.middleware.test.js`
- Redacted patterns: ip_address
### `tests/sanitizer.test.js`
- Redacted patterns: api_key, token, password, github_pat, github_actions, aws_key, groq_key, mongodb_uri, private_key_block, email, phone_us, jwt_token, high_entropy (score: 5.05), high_entropy (score: 5.13), high_entropy (score: 5.11), high_entropy (score: 5.17), high_entropy (score: 4.37), high_entropy (score: 4.36)
### `tests/session-store.test.js`
- Redacted patterns: aws_key, phone_us
### `tests/user.model.test.js`
- Redacted patterns: ip_address

---
*This report confirms that all secrets were anonymized locally before LLM processing.*