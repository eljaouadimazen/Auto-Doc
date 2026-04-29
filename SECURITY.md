# 🔒 Security Audit Report: Auto-Doc

## Summary
| Metric | Value |
|---|---|
| Files Scanned | 45 |
| Files with Secrets | 9 |
| Total Redactions | 13 |

## Findings
### `README.md`
- Redacted patterns: api_key, dotenv_value
### `client/index.html`
- Redacted patterns: basic_auth_url
### `docs/OOP_ARCHITECTURE.md`
- Redacted patterns: phone_us
### `scripts/generate-docs-ci.js`
- Redacted patterns: basic_auth_url
### `scripts/semantic-diff.js`
- Redacted patterns: phone_us
### `src/agents/base.agent.js`
- Redacted patterns: api_key
### `src/controllers/generator.controller.js`
- Redacted patterns: api_key
### `src/services/llm.service.js`
- Redacted patterns: basic_auth_url
### `src/services/sanitizer.service.js`
- Redacted patterns: token, private_key_block, ssh_private_key, certificate

---
*This report confirms that all secrets were anonymized locally before LLM processing.*