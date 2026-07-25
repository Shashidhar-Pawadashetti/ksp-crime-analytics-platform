<!-- generated-by: gsd-doc-writer -->
# Getting Started — KSP Crime Analytics Platform

This guide walks you through setting up a local development environment for the KSP Crime Analytics Platform, deploying the Catalyst Functions to Zoho Catalyst, and running your first query against the live system.

---

## Prerequisites

Before you begin, ensure the following are installed and configured on your development machine:

| Requirement | Version / Detail | How to Verify |
|-------------|------------------|---------------|
| **Node.js** | 24 (Catalyst AdvancedIO runtime) | `node --version` |
| **npm** | Ships with Node.js 24 | `npm --version` |
| **Catalyst CLI** | Latest (`zoho-catalyst-cli`) | `npm list -g zoho-catalyst-cli` |
| **Git** | Any recent version | `git --version` |
| **Zoho Catalyst Account** | Access to the `Datathon2026` project | Catalyst Console login |
| **QuickML Self Client OAuth Token** | Scope: `QuickML.deployment.READ` | Token starts with `1000.` |

### Installing the Catalyst CLI

```bash
npm i -g zoho-catalyst-cli
```

After installation, authenticate with your Zoho Catalyst account:

```bash
catalyst login
```

This opens a browser window for Zoho authentication. Once logged in, the CLI stores your credentials locally.

### Generating a QuickML OAuth Token

All functions that call the GLM LLM (classifier, nl_sql, rag, pipeline) require a valid Self Client OAuth token:

1. Go to **Zoho API Console** → [https://api-console.zoho.com/](https://api-console.zoho.com/)
2. Choose **Self Client** → **CREATE NOW**
3. Fill in:
   - **Scope**: `QuickML.deployment.READ`
   - **Description**: `KSP Crime AI - <your name>`
   - **Code Expiry**: 3 minutes
4. Click **Generate Code** and copy the authorization code immediately
5. Exchange it for an access token:
   ```bash
   curl -X POST "https://accounts.zoho.in/oauth/v2/token?client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&grant_type=authorization_code&code={CODE}"
   ```
6. Copy the `access_token` from the JSON response (it starts with `1000.`)

> The token expires **every 60 minutes**. For longer development sessions, regenerate it as needed. See `docs/production-auth.md` for the planned server-based OAuth migration that will auto-refresh the token.

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/Shashidhar-Pawadashetti/ksp-crime-analytics-platform.git
cd ksp-crime-analytics-platform
```

---

## Step 2: Link the Catalyst Project

The repository includes a pre-configured `.catalystrc` file that links to the `Datathon2026` Catalyst project (ID: `47995000000013046`). Verify the connection:

```bash
catalyst init
```

This should detect the existing `.catalystrc` and confirm the project is linked. You can verify with:

```bash
catalyst project:details
```

The expected development domain is `datathon2026-60073929329.development`.

---

## Step 3: Set Up Environment Variables

Copy the template environment file and populate it with your QuickML token:

```bash
cp .env.example .env
```

Edit `.env` and set your token:

```env
# Self Client OAuth token — paste your token here
QUICKML_TOKEN=1000.xxxx...your_token_here

# Catalyst organisation ID (pre-filled, change only if different project)
CATALYST_ORG=60073929329
```

> **Important:** The `.env` file is for **local reference only**. Catalyst Functions deployed via `catalyst deploy` do **not** read `.env`. Secrets must be set via the Catalyst Console UI after deployment (see Step 5).

---

## Step 4: Install Dependencies

The project has three areas that need dependency installation: the Catalyst Functions, the data pipeline, and the React client UI.

### 4a — Install Function Dependencies (17 Function Directories)

All Catalyst Functions depend on `zcatalyst-sdk-node`. Install dependencies for every function directory:

**PowerShell (Windows):**
```powershell
# Core conversational functions (7)
foreach ($fn in @("classifier","nl_sql","rag","session","query_exec","pipeline","test")) {
  Push-Location "functions/$fn"
  npm install
  Pop-Location
}

# Entity resolution and graph functions (6 deployable)
foreach ($fn in @("entity-matching-engine","personmaster-writer","sync-incremental","sync-full","graph-traversal","personmaster-api")) {
  Push-Location "functions/$fn"
  npm install
  Pop-Location
}
```

**Bash (macOS / Linux / WSL):**
```bash
# Core conversational functions (7)
for fn in classifier nl_sql rag session query_exec pipeline test; do
  (cd "functions/$fn" && npm install)
done

# Entity resolution and graph functions (6 deployable)
for fn in entity-matching-engine personmaster-writer sync-incremental sync-full graph-traversal personmaster-api; do
  (cd "functions/$fn" && npm install)
done
```

### 4b — Install Data Pipeline Dependencies

```bash
cd data_pipeline
npm install
cd ..
```

### 4c — Install Client UI Dependencies (Optional)

The React frontend is needed only if you plan to work on the UI layer.

```bash
cd client
npm install
cd ..
```

---

## Step 5: Deploy to Catalyst

Deploy all 13 function targets and the Slate client app using the root `catalyst.json` manifest:

```bash
catalyst deploy
```

### Selective Deployment

To deploy only specific functions (faster for iterative development):

```bash
# Deploy a single function
catalyst deploy --only "functions:pipeline"

# Deploy multiple functions
catalyst deploy --only "functions:classifier,functions:nl_sql,functions:rag"

# Deploy only the UI client
catalyst deploy --only "slate:crime-analytics-ui"
```

---

## Step 6: Re-Add Environment Variables (Critical)

**This is the most important step after every deploy.**

The `catalyst deploy` command **overwrites** all environment variables in the Catalyst Console with the (empty) `env_variables` object from each function's `catalyst-config.json`. This means `QUICKML_TOKEN` is erased after every deploy.

### Recovery Procedure

For each of the four GLM-dependent functions, you must manually re-add the token:

1. Open **Catalyst Console** → [https://console.catalyst.zoho.in/](https://console.catalyst.zoho.in/)
2. Navigate to **Functions** → **{function name}** → **Environment Variables**
3. Click **Add** and enter:
   - **Key**: `QUICKML_TOKEN`
   - **Value**: Your current Self Client OAuth token (`1000.xxxx...`)
4. Click **Save**
5. Repeat for all four functions:

| Function | Requires `QUICKML_TOKEN` | Reason |
|----------|--------------------------|--------|
| `classifier` | **Yes** | GLM fallback for intent classification |
| `nl_sql` | **Yes** | GLM NL-to-ZCQL translation |
| `rag` | **Yes** | GLM narrative answer generation |
| `pipeline` | **Yes** | GLM SQL generation, classifier fallback, and narrative |
| `session` | No | No GLM dependency |
| `query_exec` | No | No GLM dependency |
| `test` | No | No GLM dependency |
| (entity-resolution functions) | No | No GLM dependency |

> ⚠️ **Reminder:** The Self Client OAuth token expires every 60 minutes. If functions start returning GLM-related errors, the token has likely expired — generate a fresh one and update it in the Console.

### About `CATALYST_ORG`

`CATALYST_ORG` is a **reserved keyword** in Catalyst — it cannot be set in `catalyst-config.json`. The code uses a default value automatically:

```javascript
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';
```

For the current project (`Datathon2026`), the default value `60073929329` is correct. No action is needed.

---

## First Run: Health Check

Verify that the deployment is working by hitting the health check endpoint:

**PowerShell:**
```powershell
Invoke-RestMethod -Method GET -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/test/"
```

**curl:**
```bash
curl "https://datathon2026-60073929329.development.catalystserverless.in/server/test/"
```

**Expected response:**
```json
{ "status": "ok" }
```

If you get a `404` or connection error, the function may not be deployed correctly. Try redeploying:

```bash
catalyst deploy --only "functions:test"
```

Then re-add the `QUICKML_TOKEN` for the GLM functions (if applicable) and re-test.

---

## First Query: Pipeline End-to-End

Once the health check passes and `QUICKML_TOKEN` is set for the pipeline function, send your first natural language query:

**PowerShell:**
```powershell
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"count of cases in Bengaluru Urban","employee_id":1}'
```

**curl:**
```bash
curl -X POST "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"count of cases in Bengaluru Urban","employee_id":1}'
```

**Expected response (success):**
```json
{
  "status": "ok",
  "data": {
    "intent": "structured",
    "answer": "Result: 929",
    "data": [...],
    "source_refs": [],
    "confidence": 0.95,
    "session_id": "uuid-here"
  }
}
```

### More Example Queries

Once the first query succeeds, try these additional examples:

```powershell
# Structured — list FIRs with JOINs
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"list FIRs for theft in Bengaluru Urban","employee_id":1}'

# Narrative — describe a case
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"tell me about theft in Bengaluru","employee_id":1}'

# Analytical — crime trends
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"show crime trends in Bengaluru","employee_id":1}'

# RAG — direct narrative query
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/rag/query" -ContentType "application/json" -Body '{"query":"describe theft cases in Mysuru"}'
```

---

## Common Setup Issues

### Issue 1: "Env Var Wipe" After Deploy

**Symptom:** Functions that worked before start returning GLM errors (timeout, 401, or empty responses) after a `catalyst deploy`.

**Cause:** The `catalyst deploy` command overwrites Console environment variables with the (empty) `env_variables` object from `catalyst-config.json`.

**Fix:** Re-add `QUICKML_TOKEN` via Catalyst Console for `classifier`, `nl_sql`, `rag`, and `pipeline`. See Step 6 above.

### Issue 2: OAuth Token Expired

**Symptom:** GLM API calls return 401 or the function log shows `"Invalid OAuth token"`.

**Cause:** Self Client OAuth tokens expire after 60 minutes with no auto-refresh.

**Fix:** Generate a fresh token from Zoho API Console → Self Client → scope `QuickML.deployment.READ`. Update `QUICKML_TOKEN` in Catalyst Console for all four GLM-dependent functions.

### Issue 3: `"returnErrorResponse"` 500 Error

**Symptom:** A function returns HTTP 500 with `{"error":"returnErrorResponse"}`. The Catalyst Console shows a corrupted function registration.

**Cause:** This is a known Catalyst CLI issue where a function's Console registration becomes corrupted.

**Fix:**
1. Delete the function from **Catalyst Console** → Functions → {name} → Delete
2. Redeploy: `catalyst deploy --only "functions:{name}"`
3. Re-add `QUICKML_TOKEN` in Console

### Issue 4: Function Timeout (30 Seconds)

**Symptom:** The function starts executing (visible in logs as "Execution started") but never completes, timing out at 30 seconds.

**Cause:** The GLM LLM can take 10–25 seconds to respond. Combined with ZCQL query execution, complex queries may hit the 30-second Catalyst hard limit.

**Fix:** Reduce `max_tokens` in the GLM call (use 200–300 instead of larger values) and trim prompt lengths. Ensure `GLM_TIMEOUT` is set to 15–20 seconds to fail fast rather than hang.

### Issue 5: GLM Returns Invalid SQL

**Symptom:** The pipeline returns an error after SQL execution, or the function log shows a SQL error from ZCQL.

**Cause:** The GLM model may hallucinate column names, use wrong JOIN syntax, or generate ZCQL V1 syntax (e.g., comma-separated `FROM` instead of explicit `INNER JOIN ... ON`).

**Fix:** The pipeline includes an auto-retry mechanism that sends the error back to GLM for a fix attempt. If it still fails, try rephrasing the query with more specific terms (e.g., "count of cases in Bengaluru Urban" instead of "how many cases in Bengaluru").

---

## Next Steps

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, component diagram, and data flow |
| [CONFIGURATION.md](CONFIGURATION.md) | Full environment variable reference, OAuth setup, RBAC scope injection, and per-function config |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Build commands, code style, branch conventions, and PR process |
| [TESTING.md](../TESTING.md) | 25+ Postman-ready test commands for all 5 intents |
| [production-auth.md](production-auth.md) | OAuth migration guide from Self Client to Server-based App |

<!-- VERIFY: The base URL `https://datathon2026-60073929329.development.catalystserverless.in` is specific to the Datathon2026 Catalyst project development environment. Your deployed functions will use this domain as configured in `.catalystrc`. -->
<!-- VERIFY: Self Client OAuth token generation URL is `https://api-console.zoho.com` — the exact UI path and scope name should be confirmed with the current Zoho API Console interface. -->
