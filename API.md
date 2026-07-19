# REST API Reference — KSP Crime Analytics Platform

## Base URL

```
https://datathon2026-60073929329.development.catalystserverless.in/server
```

All requests require `Content-Type: application/json`. Catalyst handles
authentication at the gateway level (no bearer token needed for deployed
functions).

## Endpoints Summary

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| GET | `/test/` | test | Health check |
| POST | `/classifier/classify` | classifier | Classify query intent |
| POST | `/nl_sql/query` | nl_sql | NL → ZCQL generation + execution |
| POST | `/rag/query` | rag | Narrative query via BriefFacts search |
| POST | `/pipeline/query` | pipeline | Full orchestrator (main entry point) |
| POST | `/session/create` | session | Create conversation session |
| GET | `/session/` | session | Get session info |
| POST | `/query_exec/execute` | query_exec | Raw ZCQL execution with safety |
| GET | `/person/:personId` | network-analysis | Person profile |
| GET | `/person/:personId/associates` | network-analysis | Known associates (BFS) |
| GET | `/person/:personId/co-accused` | network-analysis | Co-accused network |
| GET | `/person/:personId/victims` | network-analysis | Victim relationships |
| GET | `/person/:personId/network-summary` | network-analysis | Aggregated network summary |
| GET | `/person/:personId/graph` | graph-visualization | Graph visualization export |
| GET | `/` | graph-visualization | API home/info |

---

## 1. Test — Health Check

```
GET /test/
```

### Response

```json
{
  "status": "ok"
}
```

---

## 2. Classifier — Intent Classification

```
POST /classifier/classify
Content-Type: application/json

{
  "query": "show associates of Ravi"
}
```

### Response

```json
{
  "intent": "network",
  "confidence": 0.95
}
```

**Intents:** `structured`, `narrative`, `network`, `risk`, `analytical`

On GLM failure or low confidence (< 0.6), returns fallback:
```json
{
  "intent": "structured",
  "confidence": 0.5,
  "fallback": true
}
```

---

## 3. NL-to-SQL — Natural Language to ZCQL

```
POST /nl_sql/query
Content-Type: application/json

{
  "query": "count of cases in Bengaluru Urban"
}
```

### Response

```json
{
  "status": "ok",
  "data": {
    "sql": "SELECT COUNT(cm.CaseMasterID) AS case_count FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID WHERE d.DistrictName = 'Bengaluru Urban'",
    "explanation": "Counts total cases in Bengaluru Urban district",
    "rows": [
      {
        "cm": {
          "COUNT(CaseMasterID)": "929"
        }
      }
    ],
    "column_meta": [],
    "source_refs": []
  }
}
```

---

## 4. RAG — Narrative Query via BriefFacts

```
POST /rag/query
Content-Type: application/json

{
  "query": "tell me about theft in Bengaluru"
}
```

### Response

```json
{
  "status": "ok",
  "data": {
    "answer": "Based on the provided excerpts, here is the information regarding theft in Bengaluru:\n\n* **Burglary:** A burglary occurred at a commercial establishment in Yeshwanthpur on December 28, 2025. CCTV footage identified a single accused. (CaseMasterID: 1533)\n* **Identity Theft:** Identity theft was reported in Indiranagar on December 25, 2025...",
    "source_refs": [
      "CaseMasterID:1533",
      "CaseMasterID:1234"
    ]
  }
}
```

On no match:
```json
{
  "status": "ok",
  "data": {
    "answer": "I could not find any case records matching your query in the BriefFacts database.",
    "source_refs": []
  }
}
```

---

## 5. Pipeline — Full Orchestrator (Main Entry Point)

```
POST /pipeline/query
Content-Type: application/json

{
  "query": "count of cases in Bengaluru Urban",
  "employee_id": 1
}
```

Optional field: `"session_id": "uuid"` to continue an existing conversation.

### Response (Structured/Aggregation)

```json
{
  "status": "ok",
  "data": {
    "intent": "structured",
    "answer": "Result: 929",
    "data": [
      { "case_count": "929" }
    ],
    "source_refs": [],
    "confidence": 0.85,
    "session_id": "7f5ef990-5a44-4c36-a389-90161f1da96a"
  }
}
```

### Response (Narrative)

```json
{
  "status": "ok",
  "data": {
    "intent": "narrative",
    "answer": "Based on the records, there was a burglary at a commercial establishment...",
    "data": [],
    "source_refs": ["CaseMasterID:1533"],
    "confidence": 0.85,
    "session_id": "..."
  }
}
```

### Response (Network)

```json
{
  "status": "ok",
  "data": {
    "intent": "network",
    "answer": "Found a network with 2 person(s) connected across 1 case(s).",
    "data": [
      { "nodes": [...], "edges": [...] }
    ],
    "source_refs": [],
    "confidence": 0.95,
    "session_id": "..."
  }
}
```

### Response (Risk)

```json
{
  "status": "ok",
  "data": {
    "intent": "risk",
    "answer": "Risk assessment for \"Ravi\": High (score: 8.5/10)",
    "data": {
      "risk_score": 8.5,
      "severity": "High",
      "factors": ["3 prior cases", "Repeat offender", "Crime types: theft, assault"]
    },
    "source_refs": [],
    "confidence": 0.95,
    "session_id": "..."
  }
}
```

### Response (Analytical)

```json
{
  "status": "ok",
  "data": {
    "intent": "analytical",
    "answer": "Crime analysis in Bengaluru This year (2026): 0 total case(s). Top crime type: N/A. Highest crime district: N/A. Trend: stable.",
    "data": {
      "total_cases": 0,
      "top_crime_type": "N/A",
      "direction": "stable",
      "crime_type_breakdown": [],
      "monthly_trend": [],
      "location_breakdown": []
    },
    "source_refs": [],
    "confidence": 0.95,
    "session_id": "..."
  }
}
```

### Error Response

```json
{
  "status": "error",
  "error_code": "MISSING_EMPLOYEE_ID",
  "message": "employee_id is required",
  "fallback_answer": "I was unable to process your request at this time."
}
```

**Error codes:** `MISSING_EMPLOYEE_ID`, `MISSING_QUERY`, `CLASSIFICATION_FAILED`

---

## 6. Session — Conversation Memory

### Create Session

```
POST /session/create
Content-Type: application/json

{
  "employee_id": 1
}
```

**Response:**
```json
{
  "status": "ok",
  "data": {
    "session_id": "7f5ef990-5a44-4c36-a389-90161f1da96a",
    "employee_id": 1,
    "rank_hierarchy": null,
    "unit_hierarchy": null,
    "unit_id": null,
    "district_id": null,
    "turns": []
  }
}
```

### Get Session

```
GET /session/?employee_id=1&session_id=7f5ef990-5a44-4c36-a389-90161f1da96a
```

---

## 7. Query Exec — ZCQL Executor

```
POST /query_exec/execute
Content-Type: application/json

{
  "sql": "SELECT DistrictID, DistrictName FROM District WHERE StateID = '1' LIMIT 10"
}
```

### Error (unsafe SQL)

```json
{
  "status": "error",
  "error_code": "VALIDATION_ERROR",
  "message": "UNSAFE_SQL: DROP not allowed"
}
```

**Blocked keywords:** `DROP`, `DELETE`, `INSERT`, `UPDATE`, `TRUNCATE`, `ALTER`,
`CREATE`, `EXEC`, `EXECUTE`. Only `SELECT` queries are allowed.

---

## 8. Network Analysis — Person Endpoints

### 8.1 Get Person Profile

```
GET /person/:personId
```

**Path parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `personId` | string | yes | PersonMaster ID (e.g., `PM_000001`) |

**Example:**
```
GET /person/PM_000001
```

**Response:**
```json
{
  "status": "ok",
  "data": {
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
    "degree": {
      "total": 5,
      "CO_ACCUSED": 3,
      "ACCUSED_TO_VICTIM": 1,
      "SHARED_LOCATION": 1,
      "UNCONFIRMED_MATCH": 0
    },
    "source_records_count": 4
  }
}
```

**HTTP status codes:**
- `200` — Person found
- `404` — Person not found
- `400` — Invalid personId

---

### 8.2 Get Known Associates

```
GET /person/:personId/associates
```

**Path parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `personId` | string | yes | — | PersonMaster ID |
| `max_hops` | integer | no | `2` | Max BFS depth (1-3) |
| `include_unconfirmed` | boolean | no | `false` | Include UNCONFIRMED_MATCH edges |
| `edge_type_filter` | string | no | — | Comma-separated edge types to include |

**Example:**
```
GET /person/PM_000001/associates?max_hops=2&edge_type_filter=CO_ACCUSED,SHARED_LOCATION
```

**Response:**
```json
{
  "status": "ok",
  "data": {
    "root": "PM_000001",
    "max_hops": 2,
    "associates": [
      {
        "person_id": "PM_000015",
        "canonical_name": "Suresh Babu",
        "roles_summary": {
          "accused_count": 1,
          "victim_count": 0,
          "complainant_count": 0
        },
        "degree": {
          "total": 2,
          "CO_ACCUSED": 2,
          "ACCUSED_TO_VICTIM": 0,
          "SHARED_LOCATION": 0,
          "UNCONFIRMED_MATCH": 0
        },
        "hop_distance": 1
      }
    ],
    "edges": [
      {
        "edge_id": "E-001",
        "source": "PM_000001",
        "target": "PM_000015",
        "edge_type": "CO_ACCUSED",
        "weight": 1,
        "occurrence_count": 2
      }
    ],
    "statistics": {
      "nodes_visited": 2,
      "edges_traversed": 1,
      "elapsed_ms": 1
    }
  }
}
```

---

### 8.3 Get Co-Accused Network

```
GET /person/:personId/co-accused
```

**Path parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `personId` | string | yes | PersonMaster ID |

**Response:** Similar structure to associates, but only includes `CO_ACCUSED`
edge type, traversed up to depth 3.

---

### 8.4 Get Victim Relationships

```
GET /person/:personId/victims
```

**Path parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `personId` | string | yes | PersonMaster ID |

**Response:** Similar to associates, but only includes `ACCUSED_TO_VICTIM`
edge type, traversed up to depth 3.

---

### 8.5 Get Network Summary

```
GET /person/:personId/network-summary
```

**Path parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `personId` | string | yes | PersonMaster ID |

**Response:**
```json
{
  "status": "ok",
  "data": {
    "person": {
      "person_id": "PM_000001",
      "canonical_name": "Ramesh Kumar",
      "roles_summary": {
        "accused_count": 3,
        "victim_count": 0,
        "complainant_count": 1
      }
    },
    "degree": {
      "total": 5,
      "CO_ACCUSED": 3,
      "ACCUSED_TO_VICTIM": 1,
      "SHARED_LOCATION": 1,
      "UNCONFIRMED_MATCH": 0
    },
    "known_associates": 4,
    "victim_links": 1,
    "co_accused": 3,
    "edge_breakdown": {
      "CO_ACCUSED": 3,
      "ACCUSED_TO_VICTIM": 1,
      "SHARED_LOCATION": 1
    }
  }
}
```

---

## 9. Graph Visualization — Cytoscape.js Export

### 9.1 Get Graph

```
GET /person/:personId/graph
```

**Path parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `personId` | string | yes | — | PersonMaster ID |
| `format` | string | no | `cytoscape` | Output format: `cytoscape`, `compact`, `debug` |
| `max_hops` | integer | no | `2` | Max BFS depth (1-3) |
| `include_unconfirmed` | boolean | no | `false` | Include UNCONFIRMED_MATCH edges |
| `edge_type_filter` | string | no | — | Comma-separated edge types |

**Output formats:**

- `cytoscape` (default) — `{ elements: { nodes: [...], edges: [...] }, style: [...] }`
- `compact` — Simplified nested structure with counts
- `debug` — Full metadata including internal indices

**Example:**
```
GET /person/PM_000001/graph?format=cytoscape&max_hops=2
```

**Response (cytoscape format):**
```json
{
  "status": "ok",
  "data": {
    "elements": {
      "nodes": [
        {
          "data": {
            "id": "PM_000001",
            "label": "Ramesh Kumar",
            "roles_summary": {
              "accused_count": 3,
              "victim_count": 0,
              "complainant_count": 1
            },
            "node_style": {
              "size": 50,
              "color": "#E53935",
              "borderColor": "#B71C1C",
              "icon": "user-tie"
            }
          }
        }
      ],
      "edges": [
        {
          "data": {
            "id": "E-001",
            "source": "PM_000001",
            "target": "PM_000015",
            "label": "Co-Accused",
            "edge_style": {
              "color": "#E53935",
              "width": 3,
              "style": "solid",
              "label": "Co-Accused"
            }
          }
        }
      ]
    },
    "style": [
      {
        "selector": "node",
        "css": {
          "background-color": "#E53935",
          "width": 50,
          "height": 50,
          "border-color": "#B71C1C",
          "border-width": 2
        }
      },
      {
        "selector": "edge",
        "css": {
          "line-color": "#E53935",
          "width": 3,
          "line-style": "solid"
        }
      }
    ]
  }
}
```

### 9.2 API Home/Info

```
GET /
```

**Response:**
```json
{
  "service": "Graph Visualization",
  "version": "1.0.0",
  "endpoints": {
    "GET /person/:personId/graph": "Export graph visualization data",
    "GET /person/:personId/graph?format=compact": "Compact format",
    "GET /person/:personId/graph?format=debug": "Debug format with metadata"
  },
  "queryParameters": {
    "format": { "type": "string", "values": ["cytoscape", "compact", "debug"], "default": "cytoscape" },
    "max_hops": { "type": "integer", "min": 1, "max": 3, "default": 2 },
    "include_unconfirmed": { "type": "boolean", "default": false },
    "edge_type_filter": { "type": "string", "description": "Comma-separated edge types" }
  }
}
```

## Error Response Format

All endpoints return errors in this format:

```json
{
  "status": "error",
  "error_code": "ERROR_CODE",
  "message": "Human-readable error description",
  "fallback_answer": "Optional fallback message for the user"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Validation error (invalid parameters) |
| 404 | Person or route not found |
| 500 | Internal server error |

## OpenAPI Specification

```yaml
openapi: 3.0.0
info:
  title: KSP Crime Analytics Platform API
  version: 1.0.0
  description: REST APIs for person network analysis and graph visualization
servers:
  - url: https://datathon2026-60073929329.development.catalystserverless.in/server
    description: Development server
paths:
  /test/:
    get:
      summary: Health check
      responses:
        '200':
          description: OK
  /classifier/classify:
    post:
      summary: Classify query intent
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                query:
                  type: string
      responses:
        '200':
          description: Intent classification result
  /nl_sql/query:
    post:
      summary: NL-to-ZCQL generation and execution
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                query:
                  type: string
      responses:
        '200':
          description: SQL, explanation, and result rows
  /rag/query:
    post:
      summary: Narrative query via BriefFacts search
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                query:
                  type: string
      responses:
        '200':
          description: Narrative answer with source references
  /pipeline/query:
    post:
      summary: Full orchestrator
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [query, employee_id]
              properties:
                query:
                  type: string
                employee_id:
                  type: integer
                session_id:
                  type: string
      responses:
        '200':
          description: Processed query result
        '400':
          description: Validation error
  /session/create:
    post:
      summary: Create conversation session
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                employee_id:
                  type: integer
      responses:
        '200':
          description: Session created
  /session/:
    get:
      summary: Get session info
      parameters:
        - name: employee_id
          in: query
          required: true
          schema:
            type: integer
        - name: session_id
          in: query
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Session data
  /query_exec/execute:
    post:
      summary: Execute raw ZCQL query
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                sql:
                  type: string
      responses:
        '200':
          description: ZCQL result rows
        '400':
          description: Validation error
  /person/{personId}:
    get:
      summary: Get person profile
      parameters:
        - name: personId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Person profile with degree info
        '404':
          description: Person not found
  /person/{personId}/associates:
    get:
      summary: Get known associates via BFS
      parameters:
        - name: personId
          in: path
          required: true
          schema:
            type: string
        - name: max_hops
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 3
            default: 2
        - name: include_unconfirmed
          in: query
          schema:
            type: boolean
            default: false
        - name: edge_type_filter
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Associates with edges and statistics
  /person/{personId}/co-accused:
    get:
      summary: Get co-accused network
      parameters:
        - name: personId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Co-accused network with edges
  /person/{personId}/victims:
    get:
      summary: Get victim relationships
      parameters:
        - name: personId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Victim relationships with edges
  /person/{personId}/network-summary:
    get:
      summary: Get aggregated network summary
      parameters:
        - name: personId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Aggregated network statistics
  /person/{personId}/graph:
    get:
      summary: Export graph visualization
      parameters:
        - name: personId
          in: path
          required: true
          schema:
            type: string
        - name: format
          in: query
          schema:
            type: string
            enum: [cytoscape, compact, debug]
            default: cytoscape
        - name: max_hops
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 3
            default: 2
        - name: include_unconfirmed
          in: query
          schema:
            type: boolean
            default: false
        - name: edge_type_filter
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Graph visualization data
  /:
    get:
      summary: API home/info
      responses:
        '200':
          description: Service info and available endpoints
```
