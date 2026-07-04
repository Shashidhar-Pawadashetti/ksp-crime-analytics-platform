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
| Orchestration | Catalyst Functions (routing, tool-calling), Circuits (multi-step pipeline) |
| AI/ML | QuickML (RAG/LLM), Zia AutoML (tabular models), Zia Services (voice/translation) |
| Data | Data Store (relational schema), NoSQL (PersonMaster), Cache (session state) |
| Response Assembly | Circuits explanation step |
| Supporting | Stratus, SmartBrowz, Cron, Signals, Mail/Push |

**Governing principle:** *The language model narrates, it never computes.* Every statistic, risk score, or prediction originates from a deterministic query or trained model — the LLM only translates questions and narrates answers with citations.

---

## Repository Structure

```
ksp-crime-analytics-platform/
├── .catalystrc                  # Catalyst project config (project ID, environment)
├── catalyst.json                # Functions deployment config
├── package.json                 # Root dependencies (zcatalyst-sdk-node)
│
├── functions/                   # Catalyst Functions (runtime application)
│   ├── test/                    #   Placeholder function (node24, advancedio)
│   │   ├── index.js
│   │   ├── package.json
│   │   └── catalyst-config.json
│   ├── query_exec/              # [WIP] Query executor (WBS 3.1)
│   ├── classifier/              # [WIP] Intent classifier (WBS 3.3)
│   ├── nl_sql/                  # [WIP] NL-to-SQL translator (WBS 3.2)
│   ├── session/                 # [WIP] Session manager (WBS 3.4)
│   └── rag/                     # [WIP] RAG dispatcher (WBS 3.5)
│
├── data_pipeline/               # Synthetic data generation & import
│   ├── src/
│   │   ├── index.js             #   Phase 1: 16 lookup table generators
│   │   ├── generators/          #   Individual table generators (state, district, crimeHead, etc.)
│   │   └── helpers/csv.js       #   CSV writer utility
│   ├── mappings/                #   ROWID mappings (Catalyst internal IDs)
│   ├── generate_phase2b.cjs     #   Unit + Court generator
│   ├── generate_phase4.cjs      #   CaseMaster generator (3,000 FIR records)
│   ├── generate_phase5.cjs      #   Complainant, Victim, Accused, Chargesheet generator
│   ├── generate_phase6.cjs      #   ArrestSurrender generator
│   ├── generate_rowid_mappings.js # ROWID mapping fetcher
│   ├── run_phase.js             #   Catalyst import orchestrator
│   ├── validate_mappings.cjs    #   FK validation script
│   ├── validate_phase5.cjs      #   Phase 5 output validator
│   ├── generate_data.cjs        #   Legacy all-in-one generator
│   └── package.json
│
└── README.md
```

---

## Data Flow

```
Data Store (relational SQL, system of record)
    ↑ CSV import via data_pipeline/
    ↓ read by Functions (query_exec, nl_sql, rag)

Entity Resolution Engine (WBS 4.0)
    ↓ reads Accused/Victim/Complainant from Data Store
    ↓ writes PersonMaster documents to NoSQL

PersonMaster (NoSQL derived store)
    ↓ read by network traversal & risk scoring
    ↓ adjacency lists for graph traversal

QuickML Vector Store
    ↓ indexed from CaseMaster.BriefFacts
    ↓ read by RAG dispatcher for narrative queries

Zia AutoML Models
    ↓ trained on schedule (Cron) using Data Store + NoSQL features
    ↓ risk scores written back to PersonMaster
```

---

## Database Schema (27 tables)

### Lookup / Master Tables (16)
State, District, CaseCategory, GravityOffence, CrimeHead, CrimeSubHead, Act, Section, CrimeHeadActSection, ReligionMaster, CasteMaster, OccupationMaster, CaseStatusMaster, UnitType, Rank, Designation

### Reference Tables (4)
Unit (122 police units with hierarchy), Court (50 courts), Employee (~1,000), PersonMaster (NoSQL)

### Core Tables (2)
CaseMaster (3,000 FIR records with lat/lng, BriefFacts text)

### Case-Dependent Tables (5)
ComplainantDetails, Victim, Accused, ActSectionAssociation, ArrestSurrender, ChargesheetDetails

---

## Technology Stack

| Component | Technology |
|---|---|
| Platform | Zoho Catalyst |
| Functions Runtime | Node.js 24 (AdvancedIO) |
| Functions SDK | zcatalyst-sdk-node |
| Relational DB | Catalyst Data Store |
| Document Store | Catalyst NoSQL |
| Cache | Catalyst Cache |
| LLM / RAG | Catalyst QuickML |
| Tabular ML | Catalyst Zia AutoML |
| Blob Storage | Catalyst Stratus |
| PDF Rendering | Catalyst SmartBrowz |
| CLI | zcatalyst-cli |
| Data Pipeline | Node.js, @faker-js/faker, csv-writer |

---

## Getting Started

### Prerequisites

- Node.js 24+
- [zcatalyst-cli](https://www.npmjs.com/package/zcatalyst-cli) installed globally
- Catalyst project credentials (`.catalystrc` + `CATALYST_PROJECT_KEY` env var)

### Install Dependencies

```bash
# Root (Functions SDK)
npm install

# Data pipeline
cd data_pipeline && npm install
```

### Generate & Load Synthetic Data

```bash
# Phase 1: Generate lookup tables and import to Data Store
cd data_pipeline
node run_phase.js phase1

# Generate remaining tables
node generate_phase2b.cjs
node generate_phase4.cjs
node generate_phase5.cjs
node generate_phase6.cjs
```

### Deploy Functions

```bash
catalyst deploy
```

---

## WBS 3.0 — Core Conversational Platform (In Progress)

| Module | Function | Status | Dependencies |
|---|---|---|---|
| 3.1 Query Executor | `query_exec` | Planned | Data Store |
| 3.2 NL-to-SQL | `nl_sql` | Planned | QuickML, query_exec |
| 3.3 Intent Classifier | `classifier` | Planned | QuickML |
| 3.4 Session Manager | `session` | Planned | Cache |
| 3.5 RAG Dispatcher | `rag` | Planned | QuickML, Data Store |

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
