# Security Model

## Security Objectives

- Prevent sensitive data leakage
- Protect source code confidentiality
- Ensure safe Cloud LLM usage

---

## Sensitive Data Detection

Detected elements:
- API Keys
- Passwords
- Tokens
- Database credentials

Methods:
- Regex detection
- File filtering
- Custom rules

---

## Cloud Security Strategy

Only safe summarized context is sent to Cloud LLMs.
