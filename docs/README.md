# Auto-Doc Documentation

## Documentation Sections

- [Architecture](ARCHITECTURE.md) — system layers and data flow
- [Workflow](WORKFLOW.md) — step-by-step pipeline description
- [Security](SECURITY.md) — secret detection and sanitization model
- [CI/CD Pipeline](CI-CD.md) — GitHub Actions automation

---

## Purpose

Auto-Doc is a secure AI-powered documentation generator for GitHub repositories. It fetches a public repository, analyzes its code structure using a custom regex-based AST parser, sanitizes any sensitive data, and generates professional documentation using the Groq LLM API (llama-3.3-70b-versatile).

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Add GROQ_API_KEY and optionally GITHUB_TOKEN to .env

# Run locally
npm run dev

# Run CI pipeline headlessly
npm run generate:ci
```

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/fetch` | Fetch and sanitize a GitHub repo |
| POST | `/build` | Build LLM input from raw markdown |
| POST | `/generate-docs` | Call Groq LLM and return documentation |
| POST | `/generate` | Full pipeline in one request |
| POST | `/validate-key` | Validate a Groq API key via /models endpoint |
| GET | `/audit` | Retrieve sanitization audit logs |
| GET | `/rules` | List custom sanitization rules |
| POST | `/rules` | Add a custom sanitization rule |
| DELETE | `/rules/:id` | Remove a custom rule |
| POST | `/rules/test` | Test a regex pattern against sample text |
| GET | `/health` | Health check |