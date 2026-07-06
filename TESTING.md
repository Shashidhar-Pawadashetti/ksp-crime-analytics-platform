# Test Commands — KSP Crime Analytics Platform

Postman-ready test commands for all 7 Catalyst Functions.

---

## Setup

### Base URL (Development)

```
https://datathon2026-60073929329.development.catalystserverless.in/server
```

### Headers (all requests)

| Key | Value |
|-----|-------|
| `Content-Type` | `application/json` |

### Auth

Catalyst handles auth at the gateway level. No bearer token or API key is needed in Postman for deployed functions.

### Env Var Reminder

After every `catalyst deploy`, re-add `QUICKML_TOKEN` via Catalyst Console for these 4 functions:

- `classifier`
- `nl_sql`
- `rag`
- `pipeline`

Without it, any function that calls the GLM LLM will return a 500 error.

---

## 1. Test Function — Health Check

### Health Check

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `{{BASE}}/test/` |
| **Headers** | — |
| **Body** | — |
| **Auth** | None |

**Expected:**
```json
{
    "status": "ok"
}
```

---

## 2. Classifier — Intent Classification

### Endpoint

```
POST {{BASE}}/classifier/classify
```

### 2.1 Keyword Match — Network

Tests that `NETWORK_PATTERNS` regex fires without GLM call.

**Body:**
```json
{
    "query": "show associates of Ravi"
}
```

**Expected:**
```json
{
    "intent": "network",
    "confidence": 0.95
}
```

---

### 2.2 Keyword Match — Risk

Tests `RISK_PATTERNS` regex.

**Body:**
```json
{
    "query": "risk score of Ravi"
}
```

**Expected:**
```json
{
    "intent": "risk",
    "confidence": 0.95
}
```

---

### 2.3 Keyword Match — Narrative

Tests `NARRATIVE_PATTERNS` regex.

**Body:**
```json
{
    "query": "describe what happened in HSR Layout"
}
```

**Expected:**
```json
{
    "intent": "narrative",
    "confidence": 0.85
}
```

---

### 2.4 Keyword Match — Analytical

Tests `FORECAST_PATTERNS` regex.

**Body:**
```json
{
    "query": "show crime trends in Bengaluru"
}
```

**Expected:**
```json
{
    "intent": "analytical",
    "confidence": 0.95
}
```

---

### 2.5 Keyword Match — Structured

Tests `STRUCTURED_PATTERNS` regex.

**Body:**
```json
{
    "query": "count of cases in Bengaluru Urban"
}
```

**Expected:**
```json
{
    "intent": "structured",
    "confidence": 0.85
}
```

---

### 2.6 GLM Fallback — Ambiguous Query

No keyword pattern matches, so it falls back to GLM LLM.

**Body:**
```json
{
    "query": "what can you tell me about recent crimes"
}
```

**Expected:** One of the 5 intents with `confidence` between `0.6` and `1.0`.
```json
{
    "intent": "analytical",
    "confidence": 0.95
}
```

---

### 2.7 GLM Fallback — No Match

**Body:**
```json
{
    "query": "good morning"
}
```

**Expected:** Falls back to `structured` with `confidence: 0.5` and `fallback: true`.
```json
{
    "intent": "structured",
    "confidence": 0.5,
    "fallback": true
}
```

---

## 3. NL-to-SQL — Natural Language to ZCQL

### Endpoint

```
POST {{BASE}}/nl_sql/query
```

### 3.1 Aggregation — Count

**Body:**
```json
{
    "query": "count of cases in Bengaluru Urban"
}
```

**Expected:**
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

### 3.2 List Query — Theft FIRs

**Body:**
```json
{
    "query": "list FIRs for theft in Bengaluru Urban"
}
```

**Expected:** Returns array of rows with `CaseMasterID`, `CrimeNo`, `CrimeRegisteredDate`, `DistrictName`.

```json
{
    "status": "ok",
    "data": {
        "sql": "SELECT ...",
        "explanation": "...",
        "rows": [ ... ],
        "source_refs": []
    }
}
```

---

### 3.3 With Date Filter

**Body:**
```json
{
    "query": "cases registered in Mysuru last month"
}
```

**Expected:** Filters by district `Mysuru` and date range for last month.

---

### 3.4 Specific Case Query

**Body:**
```json
{
    "query": "details of case 2024-00412"
}
```

**Expected:** Returns single case row or "no records found".

---

### 3.5 Complex JOIN — Accused Details

**Body:**
```json
{
    "query": "list accused in theft cases in Bengaluru Urban"
}
```

**Expected:** JOINs CaseMaster → Accused → Unit → District with `LIKE '*theft*'` filter.

---

## 4. RAG — BriefFacts Narrative Search

### Endpoint

```
POST {{BASE}}/rag/query
```

### 4.1 Match Found — Theft in Bengaluru

**Body:**
```json
{
    "query": "tell me about theft in Bengaluru"
}
```

**Expected:** Returns narrative answer with CaseMasterID citations.
```json
{
    "status": "ok",
    "data": {
        "answer": "Based on the provided excerpts, here is the information regarding theft in Bengaluru:\n\n* **Burglary:** A burglary occurred at a commercial establishment in Yeshwanthpur on December 28, 2025. CCTV footage identified a single accused. (CaseMasterID: 1533)\n* **Identity Theft:** Identity theft was reported in Indiranagar on December 25, 2025, involving the use of victims' Aadhaar details. (CaseMasterID: 1234)",
        "source_refs": [
            "CaseMasterID:1533",
            "CaseMasterID:1234"
        ]
    }
}
```

---

### 4.2 Match Found — Kidnapping in Mysuru

**Body:**
```json
{
    "query": "describe kidnapping in Mysuru"
}
```

**Expected:** Returns excerpts containing "kidnap" and "Mysuru".

---

### 4.3 Match Found — Fraud Cases

**Body:**
```json
{
    "query": "what happened in the HSR Layout fraud case"
}
```

**Expected:** Returns narrative about online fraud / phishing in HSR Layout.

---

### 4.4 No Match — Vague Query

**Body:**
```json
{
    "query": "describe case 2024-00412"
}
```

**Expected:** Keywords "case", "2024", "00412" don't match BriefFacts content.
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

### 4.5 No Match — Gibberish

**Body:**
```json
{
    "query": "xyzzy flurbo garble"
}
```

**Expected:** No keywords survive stop-word filtering + length check.
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

## 5. Pipeline — Full Orchestrator

### Endpoint

```
POST {{BASE}}/pipeline/query
```

**All pipeline requests require:**
```json
{
    "query": "...",
    "employee_id": 1
}
```

Optional: `"session_id": "..."` to continue an existing conversation.

### 5.1 Structured — Aggregation (Simple)

**Body:**
```json
{
    "query": "count of cases in Bengaluru Urban",
    "employee_id": 1
}
```

**Expected:** `"intent": "structured"`, `"answer": "Result: 929"`.

---

### 5.2 Structured — List with JOINs

**Body:**
```json
{
    "query": "list FIRs for theft in Bengaluru Urban",
    "employee_id": 1
}
```

**Expected:** `"intent": "structured"`, `"answer": "Found 43 record(s)."`, first 50 rows in `data` array.

---

### 5.3 Structured — With Date Range

**Body:**
```json
{
    "query": "show cases registered in Mysuru last month",
    "employee_id": 1
}
```

**Expected:** `"intent": "structured"`, filtered by district + date range.

---

### 5.4 Narrative — BriefFacts Search + GLM Answer

**Body:**
```json
{
    "query": "describe what happened in HSR Layout theft cases",
    "employee_id": 1
}
```

**Expected:** `"intent": "narrative"`, answer with case summaries + `CaseMasterID` citations in `source_refs`.

---

### 5.5 Narrative — Specific Question

**Body:**
```json
{
    "query": "tell me about the stamp paper counterfeiting case in Mysuru",
    "employee_id": 1
}
```

**Expected:** `"intent": "narrative"`, answer about the stamp paper racket case.

---

### 5.6 Network — Person Associations

**Body:**
```json
{
    "query": "show associates of Ravi",
    "employee_id": 1
}
```

**Expected:**
```json
{
    "intent": "network",
    "answer": "Found a network with 0 person(s) connected across 0 case(s).",
    "nodes": [],
    "edges": [],
    "source_refs": []
}
```

(Returns empty if "Ravi" doesn't exist in Accused/Victim/Complainant tables.)

---

### 5.7 Network — With Specific Name

**Body:**
```json
{
    "query": "find connections of Kumar",
    "employee_id": 1
}
```

**Expected:** Searches Accused, Victim, Complainant tables for "Kumar". If found, returns nodes + edges graph.

---

### 5.8 Risk — Person Risk Score

**Body:**
```json
{
    "query": "risk score of Ravi",
    "employee_id": 1
}
```

**Expected:**
```json
{
    "intent": "risk",
    "answer": "No criminal history found for \"Ravi\".",
    "risk_score": 0,
    "factors": ["No prior cases"],
    "severity": "Low",
    "source_refs": []
}
```

---

### 5.9 Risk — With Data

**Body:**
```json
{
    "query": "risk score of Kumar",
    "employee_id": 1
}
```

**Expected:** If Kumar exists in Accused table, returns a score 0-10 with factors (recidivism, crime types, severity).

---

### 5.10 Analytical — Crime Trends in Bengaluru

**Body:**
```json
{
    "query": "show crime trends in Bengaluru this year",
    "employee_id": 1
}
```

**Expected:**
```json
{
    "intent": "analytical",
    "answer": "Crime analysis in Bengaluru This year (2026): 0 total case(s). Top crime type: N/A (0 case(s)). Highest crime district: N/A. Trend: stable.",
    "trends": {
        "total_cases": 0,
        "top_crime_type": "N/A",
        "direction": "stable",
        "crime_type_breakdown": [],
        "monthly_trend": [],
        "location_breakdown": []
    },
    "source_refs": []
}
```

(Returns 0 for 2026 if data only exists in 2024-2025.)

---

### 5.11 Analytical — All-Time Patterns

**Body:**
```json
{
    "query": "crime trends in Bengaluru Urban",
    "employee_id": 1
}
```

**Expected:** No time filter, so returns all available data for Bengaluru Urban with crime type breakdown, monthly trend, and location breakdown.

---

### 5.12 Analytical — Crime Comparison

**Body:**
```json
{
    "query": "most common crime types in Mysuru",
    "employee_id": 1
}
```

**Expected:** `"intent": "analytical"` (matched by FORECAST_PATTERNS), returns top crime types for Mysuru.

---

### 5.13 Edge Case — Missing employee_id

**Body:**
```json
{
    "query": "count of cases"
}
```

**Expected:**
```json
{
    "status": "error",
    "error_code": "MISSING_EMPLOYEE_ID",
    "message": "employee_id is required",
    "fallback_answer": "I was unable to process your request at this time."
}
```

---

### 5.14 Edge Case — Empty Query

**Body:**
```json
{
    "query": "",
    "employee_id": 1
}
```

**Expected:**
```json
{
    "status": "error",
    "error_code": "MISSING_QUERY",
    "message": "query field is required",
    "fallback_answer": "I was unable to process your request at this time."
}
```

---

### 5.15 Session Continuity

First call creates a session. Use the returned `session_id` in the second call to continue the conversation.

**Call 1:**
```json
{
    "query": "count of cases in Bengaluru Urban",
    "employee_id": 1
}
```

Copy `session_id` from response, e.g. `"session_id": "7f5ef990-5a44-4c36-a389-90161f1da96a"`.

**Call 2:**
```json
{
    "query": "show me the details",
    "employee_id": 1,
    "session_id": "7f5ef990-5a44-4c36-a389-90161f1da96a"
}
```

**Expected:** Session context is loaded (though the pipeline doesn't yet use history for context — it's stored in Cache).

---

## 6. Session — Conversation Memory

### Endpoint

```
POST {{BASE}}/session/create
```

### 6.1 Create Session

**Body:**
```json
{
    "employee_id": 1
}
```

**Expected:**
```json
{
    "status": "ok",
    "data": {
        "session_id": "uuid-here",
        "employee_id": 1,
        "rank_hierarchy": null,
        "unit_hierarchy": null,
        "unit_id": null,
        "district_id": null,
        "turns": []
    }
}
```

### 6.2 Get Session Info

**Method:** `GET`
**URL:** `{{BASE}}/session/?employee_id=1&session_id={session_id}`

---

## 7. Query Exec — ZCQL Execution

### Endpoint

```
POST {{BASE}}/query_exec/execute
```

### 7.1 Simple SELECT

**Body:**
```json
{
    "sql": "SELECT DistrictID, DistrictName FROM District WHERE StateID = '1' LIMIT 10"
}
```

**Expected:** Returns up to 10 districts from Karnataka.

### 7.2 JOIN Query

**Body:**
```json
{
    "sql": "SELECT cm.CaseMasterID, cm.CrimeNo, d.DistrictName FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID LIMIT 5"
}
```

### 7.3 Unsafe SQL (Should Fail)

**Body:**
```json
{
    "sql": "DROP TABLE CaseMaster"
}
```

**Expected:**
```json
{
    "status": "error",
    "error_code": "VALIDATION_ERROR",
    "message": "UNSAFE_SQL: DROP not allowed"
}
```

---

## Appendix — PowerShell curl Commands

All test commands in PowerShell-compatible format (using `Invoke-RestMethod`):

```powershell
# Classifier — network keyword match
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/classifier/classify" -ContentType "application/json" -Body '{"query":"show associates of Ravi"}'

# NL-to-SQL — count aggregation
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/nl_sql/query" -ContentType "application/json" -Body '{"query":"count of cases in Bengaluru Urban"}'

# RAG — narrative query
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/rag/query" -ContentType "application/json" -Body '{"query":"tell me about theft in Bengaluru"}'

# Pipeline — structured aggregation (requires employee_id)
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"count of cases in Bengaluru Urban","employee_id":1}'

# Pipeline — narrative
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"describe what happened in HSR Layout theft cases","employee_id":1}'

# Pipeline — analytical
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"show crime trends in Bengaluru","employee_id":1}'

# Session — create
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/session/create" -ContentType "application/json" -Body '{"employee_id":1}'

# Health check — test function
Invoke-RestMethod -Method GET -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/test/"
```

To get full JSON with depth:
```powershell
$r = Invoke-RestMethod -Method POST -Uri "..." -ContentType "application/json" -Body '...'; $r | ConvertTo-Json -Depth 10
```
