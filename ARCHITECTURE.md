# Architecture — KSP Crime Analytics Platform

## High-Level Architecture

```
                           ┌──────────────────────────────┐
                           │       User / Client           │
                           │   (Slate UI / Postman / CLI)  │
                           └──────────────┬───────────────┘
                                          │ POST /pipeline/query
                                          ▼
                    ┌─────────────────────────────────────────┐
                    │         Layer 3: Orchestration          │
                    │    ┌───────────────────────────────┐    │
                    │    │        pipeline/index.js       │    │
                    │    │  - Input validation            │    │
                    │    │  - Session (get-or-create)     │    │
                    │    │  - Classifier (inline)         │    │
                    │    │  - Route to 5 handlers         │    │
                    │    │  - Session persistence         │    │
                    │    └───────────────────────────────┘    │
                    └──────────────────┬──────────────────────┘
                                       │
              ┌────────────────────────┼──────────────────────┐
              │                        │                      │
              ▼                        ▼                      ▼
   ┌──────────────────┐   ┌──────────────────────┐  ┌──────────────────────┐
   │  Layer 4: AI/ML  │   │  Layer 1: Edge       │  │  Layer 5: Data       │
   │                  │   │                      │  │                      │
   │ classifier/index │   │ entity-matching-eng  │  │ query_exec/index.js  │
   │ nl_sql/index.js  │   │ graph-service/       │  │ session/index.js     │
   │ rag/index.js     │   │ graph-traversal/     │  │                      │
   └──────────────────┘   └──────────────────────┘  └──────────────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────┐
                          │  Layer 2: Frontend/REST  │
                          │  network-analysis/       │
                          │  graph-visualization/    │
                          └──────────────────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────┐
                          │  Layer 6: Supporting     │
                          │  personmaster-builder/   │
                          │  personmaster-writer/    │
                          │  sync-full/              │
                          │  sync-incremental/       │
                          └──────────────────────────┘
                                       │
                                       ▼
           ┌──────────────────────────────────────────────┐
           │    Catalyst Platform Services                │
           │  ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
           │  │ Data     │ │ NoSQL    │ │ Cache       │  │
           │  │ Store    │ │ PersonM. │ │ (session)   │  │
           │  │ (ZCQL)   │ │          │ │             │  │
           │  └──────────┘ └──────────┘ └─────────────┘  │
           │  ┌──────────────────────────────────────┐   │
           │  │ QuickML (GLM LLM)                     │   │
           │  │ crm-di-glm47b_30b_it                  │   │
           │  └──────────────────────────────────────┘   │
           └──────────────────────────────────────────────┘
```

## Low-Level Component Architecture

### Entity Resolution Subsystem

```
CSV Records (Accused / Victim / Complainant)
  │
  ▼
┌──────────────────────────────────────────────────────┐
│            entity-matching-engine/                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │normaliser│>│ phonetic │>│ blocking │>│ scorer  │ │
│  │ .js      │ │ .js      │ │ .js      │ │ .js     │ │
│  └──────────┘ └──────────┘ └──────────┘ └────┬────┘ │
│                                               │      │
│                                         ┌─────▼────┐ │
│                                         │threshold │ │
│                                         │ .js      │ │
│                                         └──────────┘ │
└──────────────────────┬────────────────────────────────┘
                       │ matched pairs
                       ▼
┌──────────────────────────────────────────────────────┐
│             personmaster-builder/                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │clusterBuilder│>│documentBuild │>│ edgeBuilder   │ │
│  │ (Union-Find) │ │ er.js        │ │ .js          │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ │
└──────────────────────┬────────────────────────────────┘
                       │ PersonMaster docs + edges
                       ▼
┌──────────────────────────────────────────────────────┐
│            personmaster-writer/                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ writer.js    │ │ batch.js     │ │ validator.js │ │
│  │ (batch=75)   │ │              │ │              │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ │
└──────────────────────┬────────────────────────────────┘
                       │ Catalyst NoSQL (PersonMaster table)
                       ▼
┌──────────────────────────────────────────────────────┐
│ sync-incremental/ (real-time signal handler)         │
│ candidateLoader → incrementalResolver → personUpdater│
│                                      → edgeUpdater   │
└──────────────────────────────────────────────────────┘
```

### Graph & Network Subsystem

```
PersonMaster documents (NoSQL / flat files)
  │
  ▼
┌────────────────────────────────────────────────────┐
│              graph-service/                         │
│  ┌──────────────┐ ┌──────────┐ ┌────────────────┐ │
│  │graphRepositor│>│  cache   │>│ graphService   │ │
│  │ y.js         │ │  .js     │ │ .js (singleton)│ │
│  └──────────────┘ └──────────┘ └────────────────┘ │
│  ┌──────────────┐                                 │
│  │ statistics.js│                                 │
│  └──────────────┘                                 │
└──────────────────────┬─────────────────────────────┘
                       ▼
┌────────────────────────────────────────────────────┐
│              graph-traversal/                       │
│  ┌──────────┐ ┌────────────────┐ ┌──────────────┐ │
│  │ bfs.js   │>│ traversalServ  │>│ pathUtils.js │ │
│  │ (queue)  │ │ ice.js         │ │ (DFS paths)  │ │
│  └──────────┘ └────────────────┘ └──────────────┘ │
│  ┌──────────────┐                                 │
│  │ validation.js│                                 │
│  └──────────────┘                                 │
└──────┬──────────────────────────────────┬──────────┘
       │                                  │
       ▼                                  ▼
┌────────────────────┐    ┌──────────────────────────┐
│ network-analysis/  │    │ graph-visualization/      │
│ REST API           │    │ Cytoscape.js export       │
│ 5 endpoints        │    │ 3 format modes            │
└────────────────────┘    └──────────────────────────┘
```

## Folder Responsibilities

| Directory | Responsibility | Depends On |
|-----------|---------------|------------|
| `entity-matching-engine/` | Person dedup (standalone, no ZCQL/GLM) | — |
| `graph-service/` | In-memory graph data structure | personmaster-builder output |
| `graph-traversal/` | BFS traversal, path finding | graph-service |
| `network-analysis/` | REST API for network/person queries | graph-traversal |
| `graph-visualization/` | REST API for Cytoscape.js export | graph-traversal |
| `pipeline/` | Full orchestrator (classify → route → execute → format) | classifier, nl_sql, rag, session |
| `classifier/` | Intent classification (keyword + GLM) | — |
| `nl_sql/` | NL → ZCQL generation + execution | — |
| `rag/` | BriefFacts search + narrative answer | — |
| `session/` | Conversation memory (Cache CRUD) | — |
| `query_exec/` | Raw ZCQL executor with safety validation | — |
| `test/` | Health check | — |
| `personmaster-builder/` | Build PersonMaster clusters from entity matches | entity-matching-engine |
| `personmaster-writer/` | Write PersonMaster to Catalyst NoSQL | personmaster-builder |
| `personmaster-api/` | STUB — no REST endpoints implemented | — |
| `sync-full/` | Full end-to-end pipeline (one-time/recurring) | personmaster-builder, personmaster-writer |
| `sync-incremental/` | Real-time signal-based incremental sync | entity-matching-engine, graph-traversal |

## Data Flows

### User Query Lifecycle

```
1. User sends POST /pipeline/query { query, employee_id }
       │
2. Parse URL, validate inputs
       │
3. Session: get-or-create via Catalyst Cache
   - Load employee hierarchy (rank, unit, district) via ZCQL
       │
4. Classify intent: keyword patterns → GLM fallback
       │
5. Route to handler:
       │
   ├─ Structured:  translateToSQL(query) → GLM generates ZCQL
   │               → executeSQL() with auto-retry on error
   │               → flat-merge rows, check for aggregation
   │
   ├─ Narrative:   Extract keywords → BriefFacts LIKE search
   │               → top 3 excerpts → GLM summarization with citation
   │
   ├─ Network:     Extract person name → search Accused/Victim/Complainant
   │               → build {nodes, edges} graph
   │
   ├─ Risk:        Extract person name → count accused cases
   │               → score = min(10, cases*2.5 + recidivism*2 + crimeTypes)
   │               → severity: >=7 High, >=4 Medium, else Low
   │
   └─ Analytical:  Extract location + time → 3 parallel aggregation queries
                   → crime type breakdown, monthly trend, location breakdown
       │
6. Format JSON response
       │
7. Append user + assistant turns to session Cache (1hr TTL)
```

### Entity Resolution Pipeline

```
CSV records from Accused, Victim, ComplainantDetails tables
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 1: Normaliser (normaliser.js)                    │
│ - Unicode NFC normalization                            │
│ - Kannada transliteration (31 base consonants)         │
│ - Devanagari transliteration (34 base consonants)      │
│ - Salutation stripping (sri, shri, smt, mr, mrs, ...) │
│ - Common suffix stripping (kumar, bai, devi, ...)      │
│ - Strip non-alpha chars, lowercase                    │
└─────────────────────────┬───────────────────────────────┘
                          │ normalized_name
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 2: Phonetic (phonetic.js)                        │
│ - Soundex key (first token)                            │
│ - Indian Metaphone key (first token)                   │
│ - Combined: "S530 XK"                                  │
└─────────────────────────┬───────────────────────────────┘
                          │ phonetic_key
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 3: Blocking (blocking.js)                        │
│ 4 strategies applied in parallel:                      │
│ - firstTokenPhoneticKey                                 │
│ - lastTokenPhoneticKey                                  │
│ - firstInitialSurnameKey                                │
│ - surnameAgeBandKey                                     │
│ Pairs deduplicated via source_id::source_id set        │
└─────────────────────────┬───────────────────────────────┘
                          │ candidate pairs
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 4: Scorer (scorer.js)                            │
│ Composite score =                                       │
│   name_score * 0.45 +                                   │
│   age_score * 0.20 +                                    │
│   gender_score * 0.20 +                                 │
│   location_score * 0.15                                 │
│ Sub-scores: Jaro-Winkler, token sort ratio,            │
│ age delta, gender match, location proximity            │
└─────────────────────────┬───────────────────────────────┘
                          │ composite score (0.0-1.0)
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 5: Threshold (threshold.js)                      │
│ >= 0.78 → CONFIRMED (auto-merge)                       │
│ >= 0.55 → UNCONFIRMED (manual review)                  │
│ < 0.55  → DISCARD                                      │
└─────────────────────────┬───────────────────────────────┘
                          │ matched pairs (CONFIRMED + UNCONFIRMED)
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 6: Clustering (clusterBuilder.js)                │
│ Union-Find DSU with path compression + union by rank   │
│ Groups matching pairs into connected components        │
│ Result: 481 clusters, 10,487 members                   │
└─────────────────────────┬───────────────────────────────┘
                          │ person clusters
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 7: Document Building (documentBuilder.js)        │
│ Per cluster:                                            │
│ - PersonMaster ID: PM_XXXXXX                           │
│ - Canonical name: most frequent full name              │
│ - Aliases: all variant names                           │
│ - Demographics: majority vote gender/age               │
│ - Roles summary: accused/victim/complainant counts     │
└─────────────────────────┬───────────────────────────────┘
                          │ PersonMaster documents
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 8: Edge Building (edgeBuilder.js)                │
│ 4 edge types:                                           │
│ - CO_ACCUSED (same case, undirected)                   │
│ - ACCUSED_TO_VICTIM (accused→victim, directed)         │
│ - SHARED_LOCATION (same police station, undirected)    │
│ - UNCONFIRMED_MATCH (below threshold, undirected)      │
│ Deduplicated via occurrence_count                      │
└─────────────────────────┬───────────────────────────────┘
                          │ edges + adjacency map
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 9: NoSQL Writer (writer.js)                      │
│ - Batch writes (size 75)                               │
│ - Retry with exponential backoff (max 3 retries)       │
│ - Writes to PersonMaster table                         │
│ - Builds adjacency list per person                     │
└─────────────────────────┬───────────────────────────────┘
                          │ Catalyst NoSQL
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 10: Graph Service Load (graph-service/)          │
│ Loads PersonMaster documents + edges into memory       │
│ Builds node index, edge index, degree index            │
└─────────────────────────────────────────────────────────┘
```

## Sequence Diagrams

### Query Lifecycle Sequence

```
User         pipeline       classifier      GLM LLM      ZCQL        Cache
 │              │              │              │            │           │
 │ POST /query  │              │              │            │           │
 │─────────────>│              │              │            │           │
 │              │ validate     │              │            │           │
 │              │──────────────│              │            │           │
 │              │ get-or-create│              │            │           │
 │              │ session      │              │            │           │
 │              │──────────────────────────────────────────────>│        │
 │              │<──────────────────────────────────────────────│        │
 │              │              │              │            │           │
 │              │ classify     │              │            │           │
 │              │─────────────>│              │            │           │
 │              │              │─ keyword    │            │           │
 │              │              │  match → instant return │           │
 │              │<─────────────│              │            │           │
 │              │              │              │            │           │
 │              │ route to handler            │            │           │
 │              │              │              │            │           │
 │              │ (if structured)             │            │           │
 │              │────────────────────────────>│            │           │
 │              │              │              │ translateToSQL         │
 │              │              │              │───────────>│           │
 │              │              │              │<───────────│           │
 │              │              │              │ executeSQL │           │
 │              │              │              │──────────────────────>│
 │              │              │              │<──────────────────────│
 │              │     retry on error (1x)     │            │           │
 │              │              │              │            │           │
 │              │ append turns                │            │           │
 │              │─────────────────────────────────────────────────────>│
 │              │<─────────────────────────────────────────────────────│
 │<─────────────│              │              │            │           │
 │ JSON response│              │              │            │           │
```

### Entity Resolution Sequence

```
CSV Loader    normaliser    phonetic    blocking    scorer    threshold    DSU
    │             │            │           │           │         │         │
    │ load records             │           │           │         │         │
    │────────────│             │           │           │         │         │
    │────────────│─────────────│           │           │         │         │
    │────────────│─────────────│───────────│           │         │         │
    │             │            │           │           │         │         │
    │   normalise │            │           │           │         │         │
    │────────────>│            │           │           │         │         │
    │<────────────│            │           │           │         │         │
    │             │            │           │           │         │         │
    │             │  phonetic  │           │           │         │         │
    │             │───────────>│           │           │         │         │
    │             │<───────────│           │           │         │         │
    │             │            │           │           │         │         │
    │             │   block    │           │           │         │         │
    │             │──────────────────────>│           │         │         │
    │             │<──────────────────────│           │         │         │
    │             │            │           │           │         │         │
    │             │   score    │           │           │         │         │
    │             │──────────────────────────────────>│         │         │
    │             │<──────────────────────────────────│         │         │
    │             │            │           │           │         │         │
    │             │  threshold │           │           │         │         │
    │             │───────────────────────────────────────────>│         │
    │             │<───────────────────────────────────────────│         │
    │             │            │           │           │         │         │
    │             │  cluster   │           │           │         │         │
    │             │──────────────────────────────────────────────────────>│
    │             │<──────────────────────────────────────────────────────│
```

## Design Decisions

### 1. Inline Pipeline Handlers

All 5 query handlers reside in `pipeline/index.js` rather than making HTTP
calls to separate functions. This avoids inter-function latency (30s total
timeout limit) but means each function has its own copy of shared logic
(e.g., `callQuickML`, `extractGLMContent`). This is an accepted trade-off for
independent deployment.

### 2. `enable_thinking: false` is MANDATORY

Every GLM call must include `chat_template_kwargs: { enable_thinking: false }`.
Without it, the model outputs chain-of-thought reasoning before the JSON
payload, breaking `JSON.parse()`.

### 3. ZCQL V2 JOINs are Explicit

All queries use explicit `INNER JOIN ... ON` syntax. Comma-separated FROM
clauses (implicit joins) are not supported in ZCQL V2.

### 4. Union-Find for Clustering

Disjoint Set Union with path compression and union by rank provides O(alpha(n))
near-constant time per operation — important when clustering 10,000+ records.

### 5. Max 3 Hops for BFS

Graph traversal is capped at 3 hops to limit computational complexity and
ensure response relevance. The traversal queue is bounded, and visited sets
prevent cycles.

### 6. PersonMaster ID Format: PM_XXXXXX

Sequential 6-digit zero-padded IDs (e.g., `PM_000001`) provide simple,
human-readable, debuggable identifiers.

### 7. Batch Writes with Retry

NoSQL writes use batch size 75 with exponential backoff (max 3 retries). This
prevents timeout failures when writing large PersonMaster datasets.

### 8. Entity Matching Engine is Standalone

The engine has zero external dependencies (no ZCQL, no GLM). It operates purely
on in-memory arrays and string operations, making it portable and fast.

### 9. Aggregation Display Logic

If the generated SQL contains `COUNT`, `SUM`, or `AVG`, the pipeline shows
`"Result: {value}"` instead of the default `"Found N record(s)."` message.

### 10. SQL Auto-Retry

If ZCQL execution fails, the error is sent back to GLM with a fix-prompt.
One retry attempt only (bounded by the 30s function timeout).

## Graph Schema

### PersonMaster Document (NoSQL)

```json
{
  "person_id": "PM_000001",
  "canonical_name": "Ramesh Kumar",
  "aliases": ["Ramesh K", "Ramesh Kumar"],
  "roles_summary": {
    "accused_count": 3,
    "victim_count": 0,
    "complainant_count": 1
  },
  "demographics": {
    "gender": "M",
    "estimated_age": 34,
    "district_id": "D-07",
    "unit_id": "PS-042"
  },
  "source_records": [
    { "table": "Accused", "source_id": "A-101", "case_id": "C-201", "role": "accused" }
  ],
  "confidence": { "cluster_size": 2, "avg_match_score": 0.85 },
  "meta": { "created_at": "...", "algorithm_version": "1.0" }
}
```

### Edge Types

| Type | Direction | Description | Visual Style |
|------|-----------|-------------|-------------|
| `CO_ACCUSED` | Undirected | Both accused in same case | Red solid line |
| `ACCUSED_TO_VICTIM` | Directed | Accused -> victim | Orange solid line |
| `SHARED_LOCATION` | Undirected | Cases at same police station | Blue dotted line |
| `UNCONFIRMED_MATCH` | Undirected | Entity match below threshold | Grey dashed line |

## Valid Edge Types for Filtering

When querying graph traversal, the `edge_type_filter` parameter accepts
comma-separated values from the 4 types above. By default `UNCONFIRMED_MATCH`
edges are excluded unless `include_unconfirmed=true`.
