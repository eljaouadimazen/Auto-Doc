# Architecture Design

## Overview

Auto-Doc uses a hybrid architecture combining local code processing and cloud-based AI documentation generation.

---

## Local Layer

Responsibilities:
- Scan repository
- Analyze code using AST parsing
- Detect sensitive data
- Generate secure context file

Technologies:
- Node.js
- TypeScript
- ts-morph

---

## Cloud Layer

Responsibilities:
- Generate human-readable documentation
- Format documentation structure

Technologies:
- GPT API
- Gemini API

---

## Publishing Layer

Responsibilities:
- Store generated documentation
- Version documentation

Technologies:
- GitHub Pages
- Markdown
