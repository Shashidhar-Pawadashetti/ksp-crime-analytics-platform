# KSP Crime Analytics Platform

> **Built for:** Datathon 2026 (Hack2skill x Karnataka State Police), Challenge 1
> **Platform:** Catalyst by Zoho (Node.js 24, AdvancedIO)
> **Repository:** [ksp-crime-analytics-platform](https://github.com/Shashidhar-Pawadashetti/ksp-crime-analytics-platform)
> **Branch:** `feature/core_conversational_platform`

## Problem Statement

The Karnataka State Police (KSP) crime database spans 24+ relational tables
(CaseMaster, Accused, Victim, ComplainantDetails, CrimeHead, Unit, District,
Employee, etc.) with complex foreign-key chains. Investigators, analysts, and
policymakers need to query this data using **natural language** — not SQL — and
receive structured answers, narrative summaries, network graphs, risk scores,
and crime trends.

## Solution

A conversational AI and analytics platform that:

- Accepts natural-language queries via REST API
- Classifies intent using keyword heuristics (fast path) or GLM LLM (fallback)
- Routes to 5 handler types: structured (SQL), narrative (RAG), network
  (graph), risk (scoring), and analytical (trends)
- Resolves person identities across source tables using a 5-stage entity
  matching engine (normalize → phonetic → block → score → threshold)
- Builds a person-centric graph (PersonMaster nodes, 4 edge types) stored in
  Catalyst NoSQL
- Exposes graph traversal (BFS, max 3 hops) and visualization (Cytoscape.js
  export) via REST APIs

**Governing principle:** The language model narrates, it never computes. Every
statistic, risk score, or prediction originates from a deterministic query or
trained model.

## Key Features

| Feature | Description |
|---------|-------------|
| **5 Query Intents** | Structured, Narrative, Network, Risk, Analytical |
| **Entity Resolution** | 5-stage pipeline (normalize → phonetic → block → score → threshold), 4 Indian-script transliterators, Soundex + Indian Metaphone, Union-Find clustering |
| **Graph Analytics** | PersonMaster nodes (481 clusters, 10,487 members), 4 edge types, BFS traversal (max 3 hops), Cytoscape.js export |
| **REST APIs** | 7 endpoints: person profile, associates, co-accused, victims, network summary, graph visualization |
| **Synthetic Data** | 9-phase generator producing 24+ tables with 3,000+ cases, 5,000+ accused, 150 habitual offenders with name variations |
| **Incremental Sync** | Real-time signal-based update of PersonMaster documents when source records are added |

## Technology Stack

| Component | Technology |
|-----------|------------|
| Platform | Zoho Catalyst |
| Functions Runtime | Node.js 24 (AdvancedIO) |
| Functions SDK | zcatalyst-sdk-node (v3.4.0) |
| Relational DB | Catalyst Data Store (ZCQL V2) |
| Document Store | Catalyst NoSQL (PersonMaster table) |
| Cache | Catalyst Cache (session TTL: 1 hour) |
| LLM | Catalyst QuickML — `crm-di-glm47b_30b_it` |
| CLI | zcatalyst-cli (v1.26.2) |
| Data Pipeline | Node.js, @faker-js/faker, csv-writer |

## Architecture

```
                   User query
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

The platform deploys as **12 Catalyst Functions** across 6 layers:

| Layer | Functions |
|-------|-----------|
| **Edge** | entity-matching-engine, graph-service, graph-traversal |
| **Frontend/REST** | network-analysis (5 endpoints), graph-visualization (2 endpoints) |
| **Orchestration** | pipeline (full orchestrator, inline handlers) |
| **AI/ML** | classifier, nl_sql, rag |
| **Data** | query_exec, session |
| **Supporting** | personmaster-builder, personmaster-writer, personmaster-api, sync-full, sync-incremental |

## Repository Structure

```
ksp-crime-analytics-platform/
├── catalyst.json                # 17-function deployment manifest
├── AGENTS.md                    # AI agent onboarding
├── ONBOARDING.md                # Human team guide
│
├── functions/                   # 12 Catalyst Function directories
│   ├── entity-matching-engine/  # Person dedup (normalise / phonetic / block / score / threshold)
│   ├── graph-service/           # Graph data structure (nodes, edges, adjacency)
│   ├── graph-traversal/         # BFS traversal (max 3 hops)
│   ├── network-analysis/        # REST API (5 endpoints)
│   ├── graph-visualization/     # REST API (Cytoscape.js export)
│   ├── pipeline/                # Full orchestrator (inline handlers)
│   ├── classifier/              # Intent classification (keyword + GLM)
│   ├── nl_sql/                  # NL-to-ZCQL generation + execution
│   ├── rag/                     # BriefFacts search + narrative
│   ├── session/                 # Conversation memory (Cache CRUD)
│   ├── query_exec/              # Raw ZCQL executor with safety
│   └── test/                    # Health check
│
├── data_pipeline/               # Synthetic data generation (9 phases, 24+ tables)
├── docs/                        # Documentation
│   ├── images/                  # Screenshots and diagrams
│   └── production-auth.md       # OAuth migration guide
└── knowlede.md                  # Knowledge base
```

## Quick Start

### Prerequisites

- Node.js 24+
- `zcatalyst-cli` installed globally: `npm i -g zoho-catalyst-cli`
- Catalyst project credentials
- Zoho Self Client OAuth token for QuickML

### Install & Deploy

```bash
# Clone the repository
git clone https://github.com/Shashidhar-Pawadashetti/ksp-crime-analytics-platform.git
cd ksp-crime-analytics-platform

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
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full architecture, data flows, sequence diagrams, design decisions |
| [API.md](API.md) | Complete REST API reference with examples |
| [ENTITY_RESOLUTION.md](ENTITY_RESOLUTION.md) | Entity matching engine, clustering, edge building |
| [DATA_PIPELINE.md](DATA_PIPELINE.md) | Synthetic data generation, 9-phase process |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment guide, env vars, troubleshooting |
| [TESTING.md](TESTING.md) | Test suites, running tests, integration strategy |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | Quick index with links to all docs |

## Screenshots

<!-- TODO: Add screenshots -->
<!-- ![Pipeline Query Response](docs/images/pipeline-response.png) -->
<!-- ![Network Graph Visualization](docs/images/network-graph.png) -->
<!-- ![Entity Resolution Pipeline](docs/images/entity-resolution.png) -->

## Demo

<!-- TODO: Add demo video/gif link -->

## Stats

| Metric | Value |
|--------|-------|
| Total tests | 265+ |
| Test LOC | ~2,390 |
| Total LOC | ~18,958 |
| Catalyst Functions | 12 deployed |
| REST Endpoints | 7 |
| ZCQL Tables | 24+ |
| PersonMaster clusters | 481 |
| PersonMaster members | 10,487 |

## License

ISC

## Team

Built for **Datathon 2026** by the KSP Crime Analytics team.
