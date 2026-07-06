# KSP Crime Analytics Platform

**Intelligent Conversational AI & Crime Analytics Platform** — Built for **Datathon 2026** (Hack2skill × Karnataka State Police), Challenge 1.

A conversational AI and analytics platform that allows investigators, analysts, and policymakers to query and analyze the KSP crime database (FIR records and related entities) using natural language. Supports network analysis, pattern detection, risk scoring, and crime forecasting.

**Platform constraint:** All components deploy on **Catalyst by Zoho**.

---

## Architecture Overview

The system follows a 7-tier layered architecture:

| Tier | Components |
|---|---|
| Edge | Catalyst Authentication, API Gateway |
| Frontend | Slate / Web Client Hosting (chat UI, network graph, dashboards) |
| Orchestration | Catalyst Functions (routing, tool-calling), pipeline function |
| AI/ML | QuickML (GLM chat LLM), Zia AutoML (tabular models), Zia Services |
| Data | Data Store (relational), NoSQL (PersonMaster), Cache (session state) |
| Response Assembly | pipeline formatting (evidence trail, citations) |
| Supporting | Stratus, SmartBrowz, Cron, Signals, Mail/Push |

**Governing principle:** *The language model narrates, it never computes.* Every statistic, risk score, or prediction originates from a deterministic query or trained model — the LLM only translates questions and narrates answers with citations.

---

## Data Flow

```
User Query
  │
  ▼
session.createSession(employee_id) → resolves rank/unit/district hierarchy
  │
  ▼
classifier.classifyIntent(query)
  │  keyword match → returns instantly
  │  ambiguous     → GLM LLM fallback (enable_thinking: false)
  ▼
  ┌─ structured → nl_sql.translate() → query_exec.execute() → ZCQL result
  ├─ narrative  → rag.searchBriefFacts() → GLM answer generation
  ├─ network    → pipeline network handler → structured graph data
  ├─ risk       → pipeline risk handler    → recidivism-based score
  └─ analytical → pipeline analytical handler → aggregation trends
  │
  ▼
pipeline formats response + appends turns to session (Cache, 1hr TTL)
  │
  ▼
Response to user (JSON with intent, answer, data, source_refs, confidence)
```

---

## Repository Structure

```
ksp-crime-analytics-platform/
├── .catalystrc                  # Catalyst project config
├── catalyst.json                # Functions deployment targets (7 functions)
├── AGENTS.md                    # AI agent context file
├── CHANGELOG.md                 # Version history
├── ONBOARDING.md                # Team onboarding guide
├── TODO.md                      # Task tracker
├── README.md                    # This file
├── .env                         # Local secrets (gitignored)
├── .env.example                 # Template for .env (committed)
│
├── functions/                   # 7 Catalyst Functions (Node.js 24, AdvancedIO)
│   ├── classifier/              #   Intent classifier (deployed, working)
│   │   ├── index.js             #   2-stage: keyword heuristic + GLM fallback
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── nl_sql/                  #   NL-to-ZCQL translator (deployed, partial)
│   │   ├── index.js             #   Generates SQL from natural language
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── rag/                     #   RAG dispatcher (deployed)
│   │   ├── index.js             #   BriefFacts LIKE search + GLM answer
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── session/                 #   Session manager (deployed, working)
│   │   ├── index.js             #   Cache-backed CRUD + RBAC hierarchy resolution
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── query_exec/              #   Query executor (deployed)
│   │   ├── index.js             #   ZCQL validation + execution + RBAC scope injection
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── pipeline/                #   Orchestrator (deployed, partial)
│   │   ├── index.js             #   Classify → route → execute → format → session
│   │   ├── catalyst-config.json
│   │   └── package.json
│   └── test/                    #   Health check placeholder (deployed)
│       ├── index.js
│       ├── catalyst-config.json
│       └── package.json
│
├── data_pipeline/               # Synthetic data generation & import
│   ├── src/
│   │   ├── index.js             #   Phase 1: 16 lookup table generators
│   │   ├── generators/          #   Individual table generators (16 files)
│   │   └── helpers/csv.js       #   CSV writer utility
│   ├── mappings/                #   ROWID mappings (business ID ↔ Catalyst ROWID)
│   ├── generate_*.cjs           #   Phase 2-6 generators
│   ├── run_phase.js             #   Catalyst import orchestrator
│   └── validate_*.cjs           #   Validation scripts
│
├── docs/                        # Documentation
│   └── production-auth.md       #   OAuth migration guide (Self Client → Server App)
│
├── ../KSP_Datathon_FRD.md       # Functional Requirements Document
├── ../KSP_Datathon_HLD.md       # High-Level Design / Architecture
├── ../KSP_Datathon_LLD.md       # Low-Level Design (module specs, pseudocode)
└── ../KSP_Datathon_WBS.md       # Work Breakdown Structure
```

---

## Functions — Roles & Status

| Function | WBS | Role | Status | Endpoint |
|----------|-----|------|--------|----------|
| **classifier** | 3.3 | Intent routing (keyword + GLM) | ✅ Deployed, working | `POST /classifier/classify` |
| **nl_sql** | 3.2 | NL → ZCQL translation | ✅ Deployed, needs execute step | `POST /nl_sql/translate` |
| **rag** | 3.5 | BriefFacts search + narrative answers | ✅ Deployed, no data yet | `POST /rag/query` |
| **session** | 3.4 | Conversation memory (Cache, 1hr TTL) | ✅ Deployed, working | `GET /session/`, `POST /session/create` |
| **query_exec** | 3.1 | ZCQL execution + RBAC scope | ✅ Deployed | `POST /query_exec/` |
| **pipeline** | 7.0 | Full orchestrator (classify → route → execute → format) | ✅ Deployed, 3 stubs remain | `POST /pipeline/query` |
| **test** | — | Health check | ✅ Deployed | `GET /test/` |

---

## Pipeline — Intent Routing

| Intent | Matched by | Routes to | Status |
|--------|------------|-----------|--------|
| `structured` | keyword: how many, count, list, show, FIR details | nl_sql → query_exec | ✅ Complete |
| `narrative` | keyword: describe, what happened, tell me about, modus operandi | rag (BriefFacts + GLM) | ✅ Complete (no data) |
| `network` | keyword: associates, linked to, co-accused, network | pipeline inline handler | ✅ Complete |
| `risk` | keyword: risk score, high-risk, repeat offender | pipeline inline handler | ✅ Complete |
| `analytical` | keyword: predict, forecast, hotspot, trend | pipeline inline handler | ✅ Complete |

---

## Technology Stack

| Component | Technology |
|---|---|
| Platform | Zoho Catalyst |
| Functions Runtime | Node.js 24 (AdvancedIO) |
| Functions SDK | zcatalyst-sdk-node (v3.4.0) |
| Relational DB | Catalyst Data Store (ZCQL) |
| Document Store | Catalyst NoSQL |
| Cache | Catalyst Cache (TTL in hours) |
| LLM | Catalyst QuickML — model: `crm-di-glm47b_30b_it` |
| Tabular ML | Catalyst Zia AutoML |
| CLI | zcatalyst-cli (v1.26.2) |
| Data Pipeline | Node.js, @faker-js/faker, csv-writer |

---

## Environment Variables (Catalyst Console)

Set per-function via Catalyst Console → Functions → {name} → Environment Variables:

| Variable | Required For | Notes |
|----------|--------------|-------|
| `QUICKML_TOKEN` | classifier, nl_sql, rag, pipeline | Self Client OAuth (1hr expiry) |
| `CATALYST_ORG` | All QuickML callers | Reserved keyword — set via Console only, NOT in catalyst-config.json. Default: `60073929329` |

---

## Getting Started

### Prerequisites

- Node.js 24+
- zcatalyst-cli installed globally: `npm i -g zoho-catalyst-cli`
- Catalyst project credentials

### Quick Start

```bash
# 1. Install function dependencies
foreach ($fn in @("classifier","nl_sql","rag","session","query_exec","pipeline")) {
  Push-Location "functions/$fn"
  npm install
  Pop-Location
}

# 2. Deploy all functions
catalyst deploy

# 3. Set QUICKML_TOKEN in Catalyst Console for each function that needs it
```

See `ONBOARDING.md` for detailed setup steps.

---

## Design Documents

| Document | Description |
|---|---|
| `../KSP_Datathon_FRD.md` | Functional Requirements Document |
| `../KSP_Datathon_HLD.md` | High-Level Design / Architecture |
| `../KSP_Datathon_LLD.md` | Low-Level Design (module specs, pseudocode) |
| `../KSP_Datathon_WBS.md` | Work Breakdown Structure |

---

## License

ISC
