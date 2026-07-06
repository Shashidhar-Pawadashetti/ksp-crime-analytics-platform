# Onboarding — KSP Crime Analytics Platform

## Prerequisites

1. **Node.js 24** — [download](https://nodejs.org/)
2. **Catalyst CLI** — install and log in:
   ```bash
   npm i -g zoho-catalyst-cli
   catalyst login
   ```
3. **Git + repo access** — clone the repo, then link to your Catalyst project:
   ```bash
   cd ksp-crime-analytics-platform
   catalyst init   # links your local clone to the remote Catalyst project
   ```
4. **QuickML OAuth token** — required for any function that calls the GLM chat LLM

---

## Getting Your QuickML Token (once per team member)

The token authenticates deployed functions to call the LLM Serving endpoint. Each team member generates their own.

1. Go to **Zoho API Console** → [https://api-console.zoho.com/](https://api-console.zoho.com/)
2. Choose **Self Client** → **CREATE NOW**
3. Fill in the **Generate Code** tab:
   - Scope: `QuickML.deployment.READ`
   - Description: `KSP Crime AI - <your name>`
   - Code expiry: 3 minutes
4. Click **Generate Code** → copy the authorization code immediately
5. Exchange it for an access token. Open a terminal:
   ```bash
   curl -X POST "https://accounts.zoho.in/oauth/v2/token?client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&grant_type=authorization_code&code={CODE1000.25d5f32e60667873ddcbc7dd3fbc1e47.b735e77fd3bc59595312d71af396f868}"
   ```
6. Copy the `access_token` from the JSON response (starts with `1000.`)

---

## Local Environment Setup

```bash
# 1. Create your .env from template (this file is gitignored — safe)
cp .env.example .env

# 2. Edit .env — paste your token
QUICKML_TOKEN=1000.xxxx...your_token_here
CATALYST_ORG=60073929329
```

The `.env` file is for local reference only. Functions deployed via `catalyst deploy` do **not** read `.env`.

---

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| **Catalyst environment** | Sandbox (default) | Production |
| **Deploy command** | `catalyst deploy` | Catalyst Console → Deploy to Production |
| **Function URL** | `*.development.catalystserverless.in` | `*.catalystserverless.in` |
| **Data Store** | Development tables (seed data) | Production tables (live FIR data) |
| **QuickML token** | Your personal Self Client token (auto-refresh via `.env`) | Server-based App OAuth with auto-refresh (set via CI/CD secrets) |
| **Cache** | Development Cache instance | Production Cache instance |
| **Debug logging** | Detailed (`console.log` visible in logs) | Minimal (structured JSON logs only) |
| **Token expiry** | 1 hour — regenerate manually | Auto-refreshed via refresh token |

### Setting Your QUICKML_TOKEN on Catalyst

Catalyst Functions **do not read `.env`**. You must set environment variables in the Catalyst Console so deployed functions can access them:

1. Go to **Catalyst Console** → **Functions** → **classifier**
2. Click **Environment Variables** → **Add**
3. Key: `QUICKML_TOKEN` → Value: your token
4. Click **Save**
5. Repeat for **nl_sql**, **rag**, and **pipeline** — all 4 functions need this token to call the GLM LLM.

> **Production**: Use a Server-based Application OAuth flow and set the token via CI/CD secrets pipeline. Never use Self Client tokens in production — they expire every hour with no auto-refresh.

---

## Key Rules

| Rule | Why |
|------|-----|
| **NEVER** commit `.env` | Contains secret tokens — already in `.gitignore` |
| **NEVER** put secrets in `catalyst-config.json` | That file is version-controlled and pushed to Git |
| **ALWAYS** set secrets via Catalyst Console → Environment Variables | Encrypted at rest, injected at runtime into `process.env` |
| **Read-only Data Store** | ZCQL queries only — no INSERT/UPDATE/DELETE |
| `Authorization: Zoho-oauthtoken <token>` | Correct header format for QuickML API — not `Bearer` |
| `CATALYST-ORG: 60073929329` header | Required on every QuickML API call — injected by the function code automatically |
| **Session TTL is in hours** | Catalyst Cache SDK expects hours (1–48), not seconds |

---

## Project Structure

```
ksp-crime-analytics-platform/
├── catalyst.json              # Deployment targets list
├── ONBOARDING.md              # This file
├── .env                       # Local secrets (gitignored)
├── .env.example               # Template for .env (committed)
├── .gitignore
├── functions/
│   ├── session/               # WBS 3.4 — Session manager (deployed, working)
│   │   ├── index.js
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── classifier/            # WBS 3.3 — Intent classifier (deployed, working)
│   │   ├── index.js
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── nl_sql/                # WBS 3.2 — NL-to-SQL translator (deployed, working)
│   │   ├── index.js           #   Generates SQL + executes via ZCQL, returns rows
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── rag/                   # WBS 3.5 — RAG dispatcher (deployed, working)
│   │   ├── index.js           #   BriefFacts LIKE search + GLM narrative answer
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── pipeline/              # WBS 7.0 — Orchestrator (deployed, working)
│   │   ├── index.js           #   Classify → route → execute → format → session
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── query_exec/            # WBS 3.1 — Query executor (deployed)
│   │   ├── index.js
│   │   ├── catalyst-config.json
│   │   └── package.json
│   └── test/                  # Health check endpoint
│       ├── index.js
│       ├── catalyst-config.json
│       └── package.json
├── KSP_Datathon_WBS.md        # Work breakdown structure
└── KSP_Datathon_LLD.md        # Low-level design document
```

---

## Deploy & Test

```bash
# Build all function deps first
foreach ($fn in @("classifier","nl_sql","rag","session","query_exec","pipeline")) {
  Push-Location "functions/$fn"
  npm install
  Pop-Location
}

# Deploy specific functions
catalyst deploy --only "functions:classifier,functions:nl_sql,functions:rag"

# Deploy all targets
catalyst deploy

# Deploy a single function
catalyst deploy --only "functions:pipeline"

# IMPORTANT: After every deploy, re-add QUICKML_TOKEN env var via Console
```

### Smoke test (after deploy + env vars set)

```bash
# Pipeline — aggregation query
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"count of cases in Bengaluru Urban","employee_id":1}'
# → {"status":"ok","data":{"intent":"structured","answer":"Result: 929",...}}

# Pipeline — structured data query
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"list FIRs for theft in Bengaluru Urban","employee_id":1}'
# → {"status":"ok","data":{"intent":"structured","answer":"Found 43 record(s).",...}}

# Pipeline — narrative query
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"describe what happened in HSR Layout theft cases","employee_id":1}'
# → {"status":"ok","data":{"intent":"narrative","answer":"...CaseMasterID citations...",...}}

# Pipeline — analytical query
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"show crime trends in Bengaluru","employee_id":1}'
# → {"status":"ok","data":{"intent":"analytical","trends":{...}}}

# RAG — narrative query
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/rag/query" -ContentType "application/json" -Body '{"query":"tell me about theft in Bengaluru"}'
# → {"status":"ok","data":{"answer":"...BriefFacts summary with citations..."}}
```

---

## Architecture (5-min overview)

```
User query
  │
  ▼
session.getSession(employee_id, session_id)
  │  resolves rank_hierarchy, unit_hierarchy, unit_id, district_id
  ▼
classifier.classifyIntent(query, session_history)
  │  keyword match → returns instantly
  │  ambiguous     → QuickML LLM fallback
  ▼
  ┌ structured → pipeline: GLM SQL gen → ZCQL execution → rows
  ├ narrative  → pipeline: rag.searchBriefFacts() → GLM answer
  ├ network    → pipeline: inline handler → graph (nodes + edges)
  ├ risk       → pipeline: inline handler → risk score
  └ analytical → pipeline: inline handler → aggregation trends
```

---

## Getting Help

- **Catalyst Console**: [https://console.catalyst.zoho.in/](https://console.catalyst.zoho.in/)
- **Catalyst CLI docs**: `catalyst --help`
- **Project leads**: for env vars, deployment access, or schema questions
