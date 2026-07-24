# KSP Crime Analytics Platform

> **Built for:** Datathon 2026 (Hack2skill x Karnataka State Police), Challenge 1
> **Platform:** Catalyst by Zoho (Node.js 24, AdvancedIO)
> **Repository:** [ksp-crime-analytics-platform](https://github.com/Shashidhar-Pawadashetti/ksp-crime-analytics-platform)

## Problem Statement

The Karnataka State Police (KSP) crime database spans 24+ relational tables
(CaseMaster, Accused, Victim, ComplainantDetails, CrimeHead, Unit, District,
Employee, etc.) with complex foreign-key chains. Investigators, analysts, and
policymakers need to query this data using **natural language** — not SQL — and
receive structured answers, narrative summaries, network graphs, risk scores,
and crime trends.

## Solution

A conversational AI and analytics platform with a React frontend that:

- Accepts natural-language queries via a chat interface
- Classifies intent using keyword heuristics (fast path) or GLM LLM (fallback)
- Routes to 5 handler types: structured (SQL), narrative (RAG), network
  (graph), risk (scoring), and analytical (trends)
- Resolves person identities across source tables using a 5-stage entity
  matching engine (normalize \u2192 phonetic \u2192 block \u2192 score \u2192 threshold)
- Builds a person-centric graph (PersonMaster nodes, 4 edge types) stored in
  Catalyst NoSQL
- Exposes graph traversal (BFS, max 3 hops) and visualization (Cytoscape.js
  export) via REST APIs
- Provides an analytics dashboard with D3.js charts (trends, breakdowns,
  seasonal analysis) and a hotspot map

**Governing principle:** The language model narrates, it never computes. Every
statistic, risk score, or prediction originates from a deterministic query or
trained model.

## Key Features

| Feature | Description |
|---------|-------------|
| **Chat Interface** | Conversational AI with session memory, intent classification, cited answers |
| **5 Query Intents** | Structured, Narrative, Network, Risk, Analytical |
| **Analytics Dashboard** | Crime trends, breakdowns, location analysis, seasonal patterns, risk-ranked persons, hotspot map |
| **Entity Resolution** | 5-stage pipeline (normalize \u2192 phonetic \u2192 block \u2192 score \u2192 threshold), 4 Indian-script transliterators, Soundex + Indian Metaphone, Union-Find clustering |
| **Graph Analytics** | PersonMaster nodes, 4 edge types, BFS traversal (max 3 hops), Cytoscape.js export |
| **REST APIs** | 7 endpoints: person profile, associates, co-accused, victims, network summary, graph visualization |
| **Synthetic Data** | 9-phase generator producing 24+ tables with 3,000+ cases, 5,000+ accused, 150 habitual offenders with name variations |
| **Incremental Sync** | Real-time signal-based update of PersonMaster documents when source records are added |

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 19, Vite 8, Tailwind CSS 4, D3.js 7, Cytoscape.js, Leaflet |
| Platform | Zoho Catalyst |
| Functions Runtime | Node.js 24 (AdvancedIO) |
| Functions SDK | zcatalyst-sdk-node (v3.4.0) |
| Relational DB | Catalyst Data Store (ZCQL V2) |
| Document Store | Catalyst NoSQL (PersonMaster table) |
| Cache | Catalyst Cache (session TTL: 1 hour) |
| LLM | Catalyst QuickML \u2014 `crm-di-glm47b_30b_it` |
| CLI | zcatalyst-cli (v1.26.2) |
| Data Pipeline | Node.js, @faker-js/faker, csv-writer |

## Architecture

```
                    User query (chat UI)
                       |
                       v
           pipeline/query (orchestrator)
                       |
               classifier (inline)
               /    |    |    |    \
         struct narr network risk analytical
               |    |    |    |    |
               v    v    v    v    v
           ZCQL  GLM  Graph  Score  Agg
            SQL   RAG  BFS   Calc   SQL
               |    |    |    |    |
               v    v    v    v    v
           Catalyst Data Store / NoSQL / Cache
```

The platform deploys as **16 Catalyst Functions** across 6 layers:

| Layer | Functions |
|-------|-----------|
| **Edge** | entity-matching-engine, graph-service, graph-traversal |
| **Frontend/REST** | network-analysis (5 endpoints), graph-visualization (2 endpoints), graph-service-api |
| **Orchestration** | pipeline (full orchestrator, inline handlers) |
| **AI/ML** | classifier, nl_sql, rag |
| **Data** | query_exec, session, dashboard |
| **Supporting** | personmaster-builder, personmaster-writer, personmaster-api, sync-full, sync-incremental |

## Repository Structure

```
ksp-crime-analytics-platform/
\u251c\u2500\u2500 catalyst.json                # 16-function deployment manifest
\u251c\u2500\u2500 AGENTS.md                    # AI agent onboarding
\u251c\u2500\u2500 ONBOARDING.md                # Human team guide
\u251c\u2500\u2500 README.md                   # This file
\u2502
\u251c\u2500\u2500 client/                      # React frontend (Vite + Tailwind)
\u2502   \u251c\u2500\u2500 src/
\u2502   \u2502   \u251c\u2500\u2500 components/       # React components by view
\u2502   \u2502   \u2502   \u251c\u2500\u2500 Chat/          # Conversational AI chat interface
\u2502   \u2502   \u2502   \u251c\u2500\u2500 Dashboard/     # Analytics dashboard (D3.js charts)
\u2502   \u2502   \u2502   \u251c\u2500\u2500 Graph/          # Network graph visualization
\u2502   \u2502   \u2502   \u251c\u2500\u2500 Layout/         # App shell (sidebar, header)
\u2502   \u2502   \u2502   \u251c\u2500\u2500 Citations/      # Source citation display
\u2502   \u2502   \u2502   \u2514\u2500\u2500 ui/             # shadcn/ui primitives
\u2502   \u2502   \u251c\u2500\u2500 contexts/        # React context providers
\u2502   \u2502   \u251c\u2500\u2500 hooks/           # Custom React hooks
\u2502   \u2502   \u251c\u2500\u2500 services/        # API client functions
\u2502   \u2502   \u251c\u2500\u2500 utils/           # Constants and helpers
\u2502   \u2502   \u2514\u2500\u2500 __tests__/       # Vitest test suites (178 tests)
\u2502   \u2514\u2500\u2500 package.json
\u2502
\u251c\u2500\u2500 functions/                    # 16 Catalyst Function directories
\u2502   \u251c\u2500\u2500 classifier/            # Intent classification
\u2502   \u251c\u2500\u2500 nl_sql/                # NL-to-ZCQL generation + execution
\u2502   \u251c\u2500\u2500 rag/                   # BriefFacts search + narrative
\u2502   \u251c\u2500\u2500 pipeline/              # Full orchestrator (inline handlers)
\u2502   \u251c\u2500\u2500 session/               # Conversation memory (Cache CRUD)
\u2502   \u251c\u2500\u2500 query_exec/            # Raw ZCQL executor with safety
\u2502   \u251c\u2500\u2500 dashboard/             # Analytics aggregation queries
\u2502   \u251c\u2500\u2500 test/                  # Health check
\u2502   \u251c\u2500\u2500 entity-matching-engine/ # Person dedup library modules
\u2502   \u251c\u2500\u2500 graph-service/         # Graph data structure (nodes, edges)
\u2502   \u251c\u2500\u2500 graph-traversal/       # BFS traversal (max 3 hops)
\u2502   \u251c\u2500\u2500 graph-visualization/   # Cytoscape.js export helpers
\u2502   \u251c\u2500\u2500 graph-service-api/     # Graph REST API (Cytoscape format)
\u2502   \u251c\u2500\u2500 network-analysis/      # Network analysis REST API
\u2502   \u251c\u2500\u2500 personmaster-writer/   # PersonMaster NoSQL batch writer
\u2502   \u251c\u2500\u2500 personmaster-api/      # PersonMaster HTTP endpoint
\u2502   \u251c\u2500\u2500 sync-full/             # Full graph rebuild pipeline
\u2502   \u2514\u2500\u2500 sync-incremental/      # Incremental entity signal processing
\u2502
\u2514\u2500\u2500 data_pipeline/               # Synthetic data generation (9 phases, 24+ tables)
```

## Quick Start

### Prerequisites

- Node.js 24+
- `zcatalyst-cli` installed globally: `npm i -g zoho-catalyst-cli`
- Catalyst project credentials
- Zoho Self Client OAuth token for QuickML

### Frontend

```bash
cd client
npm install
npm run dev        # Dev server at localhost:5173
npm test           # Run 178 test suites
```

### Functions

```bash
# Install function dependencies
Push-Location functions/pipeline; npm install; Pop-Location
Push-Location functions/classifier; npm install; Pop-Location
Push-Location functions/nl_sql; npm install; Pop-Location
Push-Location functions/rag; npm install; Pop-Location
Push-Location functions/session; npm install; Pop-Location
Push-Location functions/query_exec; npm install; Pop-Location

# Deploy all functions
catalyst deploy
```

### Post-Deploy

After `catalyst deploy`, re-add `QUICKML_TOKEN` in Catalyst Console for these
4 functions: **classifier**, **nl_sql**, **rag**, **pipeline**.

### Environment Variables

| Variable | Required By | Notes |
|----------|-------------|-------|
| `QUICKML_TOKEN` | classifier, nl_sql, rag, pipeline | Self Client OAuth (1hr expiry) |
| `CATALYST_ORG` | All QuickML callers | Default: `60073929329` |

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full architecture, data flows, sequence diagrams, design decisions |
| [docs/API.md](docs/API.md) | Complete REST API reference with examples |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Development guide, code conventions, commit patterns |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment guide, env vars, troubleshooting |
| [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) | Step-by-step onboarding for new team members |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Configuration reference for all components |
| [docs/UAT-TEST-QUERIES.md](docs/UAT-TEST-QUERIES.md) | Postman-ready test queries for all endpoints |
| [client/README.md](client/README.md) | Frontend UI documentation |
| [functions/README.md](functions/README.md) | Backend function catalog |

## Stats

| Metric | Value |
|--------|-------|
| Total tests | 178+ |
| Catalyst Functions | 16 deployed |
| REST Endpoints | 7+ |
| ZCQL Tables | 24+ |
| Frontend Views | 5 (Chat, Dashboard, Graph, Person Search, Hotspot Map) |
| PersonMaster clusters | 481 |
| PersonMaster members | 10,487 |

## License

ISC

## Team

Built for **Datathon 2026** by the KSP Crime Analytics team.
