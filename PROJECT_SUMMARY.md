# KSP Crime Analytics Platform — Documentation Index

> **Built for:** Datathon 2026 (Hack2skill x Karnataka State Police), Challenge 1
> **Platform:** Catalyst by Zoho (Node.js 24, AdvancedIO)
> **Repository:** [ksp-crime-analytics-platform](https://github.com/Shashidhar-Pawadashetti/ksp-crime-analytics-platform)
> **Branch:** `feature/core_conversational_platform`

A conversational AI and analytics platform that allows investigators,
analysts, and policymakers to query the KSP crime database using natural
language. Supports 5 query intents, entity resolution across 24+ tables,
graph analytics, and REST APIs.

## Quick Stats

| Metric | Value |
|--------|-------|
| Total tests | 265+ |
| Test LOC | ~2,390 |
| Total LOC | ~18,958 |
| Catalyst Functions | 12 deployed |
| REST Endpoints | 7 |
| ZCQL Tables | 24+ |
| PersonMaster clusters | 481 |

## Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Project overview, features, tech stack, quick start |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full architecture, data flows, sequence diagrams, design decisions |
| [API.md](API.md) | Complete REST API reference with examples and OpenAPI spec |
| [ENTITY_RESOLUTION.md](ENTITY_RESOLUTION.md) | Entity matching engine, clustering, edge building, sync |
| [DATA_PIPELINE.md](DATA_PIPELINE.md) | Synthetic data generation, 9-phase process, ROWID mapping |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment guide, env vars, OAuth, troubleshooting |
| [TESTING.md](TESTING.md) | Test suites, running tests, integration strategy |

## Additional Files

| File | Description |
|------|-------------|
| [AGENTS.md](AGENTS.md) | AI agent onboarding context |
| [ONBOARDING.md](ONBOARDING.md) | Human team onboarding guide |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/production-auth.md](docs/production-auth.md) | OAuth migration guide |
| [catalyst.json](catalyst.json) | 17-function deployment manifest |
