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
   curl -X POST "https://accounts.zoho.in/oauth/v2/token?client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&grant_type=authorization_code&code={CODE}"
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
5. Repeat for **nl_sql** and **rag** once those functions are built

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
│   ├── session/               # WBS 3.4 — Session manager (deployed)
│   │   ├── index.js
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── classifier/            # WBS 3.3 — Intent classifier (deployed)
│   │   ├── index.js
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── query_exec/            # WBS 3.1 — Query executor (written, not deployed)
│   │   ├── index.js
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── nl_sql/                # WBS 3.2 — NL-to-SQL translator (stub)
│   │   ├── catalyst-config.json
│   │   └── package.json
│   ├── rag/                   # WBS 3.5 — RAG dispatcher (stub)
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
foreach ($fn in @("session","classifier","query_exec","nl_sql","rag")) {
  Push-Location "functions/$fn"
  npm install
  Pop-Location
}

# Deploy all targets
catalyst deploy

# Deploy a single function
catalyst deploy --functions classifier
```

### Smoke test (after deploy)

```bash
# Session — create a new session
curl -X POST https://datathon2026-60073929329.development.catalystserverless.in/server/session/create \
  -H "Content-Type: application/json" \
  -d '{"employee_id": 1}'

# Classifier — network query (keyword match, no LLM needed)
curl -X POST https://datathon2026-60073929329.development.catalystserverless.in/server/classifier/classify \
  -H "Content-Type: application/json" \
  -d '{"query":"show associates of Ravi"}'
# → {"intent":"network","confidence":0.95}

# Classifier — structured query (needs QUICKML_TOKEN for LLM, else falls back)
curl -X POST https://datathon2026-60073929329.development.catalystserverless.in/server/classifier/classify \
  -H "Content-Type: application/json" \
  -d '{"query":"how many theft cases in 2025?"}'
# → {"intent":"structured","confidence":0.5,"fallback":true}
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
          ┌ structured → nl_sql.translate() → query_exec.execute() → ZCQL result
          ├ narrative  → rag.dispatchRAG()  → BriefFacts search + LLM answer
          ├ network    → network_traversal() → PersonMaster graph
          ├ risk       → risk_score()       → PersonMaster risk flag
          └ analytical → forecast()         → AutoML prediction
```

---

## Getting Help

- **Catalyst Console**: [https://console.catalyst.zoho.in/](https://console.catalyst.zoho.in/)
- **Catalyst CLI docs**: `catalyst --help`
- **Project leads**: for env vars, deployment access, or schema questions
