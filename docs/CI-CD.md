# CI/CD Pipeline

## Overview

A single GitHub Actions workflow handles the entire CI/CD pipeline — lint, security scans,
tests, Docker build/scan, versioning, and deployment.

---

## Workflow

| Event | Jobs |
|-------|------|
| **Pull request to `main`** | Lint → Secrets scan → SAST → Commitlint → Dependency scan → Unit tests → Coverage → Build images → Scan images → Summary |
| **Push to `main`** | Everything above, plus Push & release (Docker Hub push, semantic versioning, Render deploy) |

---

## Pipeline Steps

```text
Trigger: push/PR to main
    ↓
Lint (ESLint)
Secrets scan (Gitleaks)
SAST (Semgrep)
Commitlint (conventional commits)
    ↓
Dependency scan (Trivy filesystem)
    ↓
Unit tests (Jest)
Coverage (Jest --coverage)
    ↓
Build Docker images (backend + frontend)
    ↓
Scan Docker images (Trivy)
    ↓
[Push to main only]
  → Push to Docker Hub
  → Semantic Release (version bump + tag)
  → Tag images with semver
  → Trigger Render deploy
```
