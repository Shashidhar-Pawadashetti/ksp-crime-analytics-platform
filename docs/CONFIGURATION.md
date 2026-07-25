<!-- generated-by: gsd-doc-writer -->
# Configuration

This document describes every configuration mechanism used by the KSP Crime Analytics Platform: environment variables, function-level `catalyst-config.json` manifests, the deployment manifest (`catalyst.json`), OAuth token format, and RBAC scope injection.

---

## Environment Variables

All Catalyst Functions read environment variables at runtime via `process.env.*`. Variables fall into three categories: **Runtime-essential** (failure on startup if missing), **Optional with code defaults**, and **Secrets** (must be set via Catalyst Console, never in version control).

### Essential / Secret Variables

| Variable | Required By | Required | Default | Description |
|----------|-------------|----------|---------|-------------|
| `QUICKML_TOKEN` | classifier, nl_sql, rag, pipeline | **Required** | — | Self-client OAuth Bearer token for QuickML GLM API. Format: `1000.{hash}.{hash}`. Expires every 60 minutes. |
| `CATALYST_ORG` | classifier, nl_sql, rag, pipeline | **Required** | `60073929329` | Zoho Catalyst organisation ID. **Reserved keyword** — cannot be set in `catalyst-config.json`; must be set via Console or rely on the code default. |

### Optional / Override Variables

| Variable | Consumed By | Default | Description |
|----------|-------------|---------|-------------|
| `QUICKML_URL` | classifier, nl_sql, rag, pipeline | `https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat` | GLM chat API endpoint. Useful for directing traffic to a different project or environment. |
| `RAG_ANSWER_URL` | rag, pipeline | `https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/rag/answer` | QuickML RAG answer endpoint. |
| `QUICKML_MODEL` | classifier, nl_sql, rag, pipeline | `crm-di-glm47b_30b_it` | GLM model identifier. |
| `PM_WRITER_BATCH_SIZE` | personmaster-writer | `75` | Number of NoSQL documents to write per batch in the entity-resolution pipeline. |
| `CATALYST_PROJECT_KEY` | personmaster-writer | — | Catalyst project key for NoSQL access in the PersonMaster writer. |
| `VITE_SKIP_AUTH` | client (React UI) | — | When set to `true`, skips authentication in the development UI. |
| `VITE_API_BASE` | client (React UI) | `/api` | Base URL for API requests from the client application. |

### Production OAuth (Planned — Not Yet Implemented)

The codebase currently supports only the **Self Client OAuth** flow (`QUICKML_TOKEN`). A server-based OAuth flow using refresh tokens has been designed but not yet implemented in the function code. When implemented, these variables will replace `QUICKML_TOKEN`:

| Variable | Required | Description |
|----------|----------|-------------|
| `QUICKML_CLIENT_ID` | **Required** (production) | Client ID from Zoho API Console > Server-based Applications. |
| `QUICKML_CLIENT_SECRET` | **Required** (production) | Client secret from the same registration. |
| `QUICKML_REFRESH_TOKEN` | **Required** (production) | Refresh token (never expires) that enables auto-renewal of access tokens. |

See `docs/production-auth.md` for the full migration guide.

### Development vs Production Matrix

| Variable | Development | Production | Where to Set |
|----------|-------------|------------|-------------|
| `QUICKML_TOKEN` | Self-client token (`1000.xxxx`) | — | Local `.env` (dev) / Catalyst Console |
| `QUICKML_CLIENT_ID` | — | `1000.xxxx` | Catalyst Console (future) |
| `QUICKML_CLIENT_SECRET` | — | Secret string | Catalyst Console (future) |
| `QUICKML_REFRESH_TOKEN` | — | `1000.xxxx` | Catalyst Console (future) |
| `CATALYST_ORG` | `60073929329` | `60073929329` | Runtime code default |
| `VITE_SKIP_AUTH` | `true` | — | `client/.env.development` |
| `VITE_API_BASE` | *(omitted)* | Production API URL | `client/.env.production` (if created) |

---

## OAuth Token Format and Expiry

### Self Client OAuth (Current, Development)

```
Format:    1000.{hash}.{hash}
Example:   1000.b0af700fbc3b95a7b3f019c27d38e01c.24ac88b165c38e4a7bb60132add23101
Expiry:    60 minutes (3,600 seconds)
Mechanism: Self-client OAuth via Zoho API Console
```

**Limitations:**
- Token expires exactly 1 hour after generation — no auto-refresh.
- After expiry, all GLM API calls fail with 401 until a fresh token is pasted into the environment.
- Must be regenerated from the Zoho API Console > Self Client > scope `QuickML.deployment.READ`.

<!-- VERIFY: Self-client token generation URL is https://api-console.zoho.com — confirm the exact scope name with the Zoho API Console UI -->

### Server-based OAuth (Planned, Production)

When implemented, the function runtime will cache the access token in memory and use a `refresh_token` (never expires) to obtain new tokens automatically before the 60-minute window elapses.

```
Access Token:  1000.{hash}.{hash}  (same format)
Refresh Token: 1000.{hash}          (separate, long-lived)
Expiry:        60 minutes           (auto-renewed with 60-second buffer)
```

---

## `catalyst-config.json` (Per-Function)

Every Catalyst Function has a `catalyst-config.json` manifest. All 13 deployed functions use an identical structure differing only in the `name` field.

### Structure

```json
{
  "deployment": {
    "name": "pipeline",
    "stack": "node24",
    "type": "advancedio",
    "env_variables": {}
  },
  "execution": {
    "main": "index.js"
  }
}
```

| Field | Value | Notes |
|-------|-------|-------|
| `deployment.name` | Function name | Must match the directory name and the target in `catalyst.json`. |
| `deployment.stack` | `node24` | Node.js 24 runtime (Catalyst AdvancedIO). |
| `deployment.type` | `advancedio` | All functions use AdvancedIO (HTTP-triggered). |
| `deployment.env_variables` | `{}` | **Always empty** — secrets must not be stored in version control. |
| `execution.main` | `index.js` | Entry point file. |

### All Function Config Files

| Function | `deployment.name` | Config Path |
|----------|-------------------|-------------|
| test | `test` | `functions/test/catalyst-config.json` |
| classifier | `classifier` | `functions/classifier/catalyst-config.json` |
| nl_sql | `nl_sql` | `functions/nl_sql/catalyst-config.json` |
| rag | `rag` | `functions/rag/catalyst-config.json` |
| pipeline | `pipeline` | `functions/pipeline/catalyst-config.json` |
| session | `session` | `functions/session/catalyst-config.json` |
| query_exec | `query_exec` | `functions/query_exec/catalyst-config.json` |
| entity-matching-engine | `entity-matching-engine` | `functions/entity-matching-engine/catalyst-config.json` |
| personmaster-writer | `personmaster-writer` | `functions/personmaster-writer/catalyst-config.json` |
| personmaster-api | `personmaster-api` | `functions/personmaster-api/catalyst-config.json` |
| sync-full | `sync-full` | `functions/sync-full/catalyst-config.json` |
| sync-incremental | `sync-incremental` | `functions/sync-incremental/catalyst-config.json` |
| graph-traversal | `graph-traversal` | `functions/graph-traversal/catalyst-config.json` |

The **client** static app has its own `catalyst-config.json` (Shell):

```json
{
  "app_name": "crime-analytics-ui",
  "node_version": "20",
  "framework": "react"
}
```

### Critical Constraint: `CATALYST_ORG` Cannot Be in `catalyst-config.json`

`CATALYST_ORG` is a **reserved keyword** in Catalyst. If you add it to `deployment.env_variables`, Catalyst will silently ignore it or cause a deployment error. The code handles this with a default:

```javascript
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';
```

The only way to override it without modifying code is via the **Catalyst Console** UI → Functions → {name} → Environment Variables.

---

## `catalyst.json` (Deployment Manifest)

The root-level `catalyst.json` defines all targets for the `catalyst deploy` command.

```json
{
  "functions": {
    "targets": [
      "test",
      "session",
      "classifier",
      "nl_sql",
      "rag",
      "query_exec",
      "pipeline",
      "entity-matching-engine",
      "personmaster-writer",
      "sync-incremental",
      "sync-full",
      "graph-traversal",
      "personmaster-api"
    ],
    "ignore": [],
    "source": "functions"
  },
  "slate": [
    {
      "name": "crime-analytics-ui",
      "type": "slate",
      "framework": "react",
      "build_command": "npm run build",
      "build_path": "client",
      "output_path": "client/dist"
    }
  ]
}
```

| Section | Detail |
|---------|--------|
| `functions.targets` | 13 function directory names (under `functions/`) to deploy. |
| `functions.ignore` | Empty — no functions excluded from deploy. |
| `functions.source` | `"functions"` — the directory where function subdirectories live. |
| `slate[0]` | React SPA client app: built from `client/`, outputs to `client/dist`. |

### Deploy Commands

```bash
# Deploy all 13 functions + slate client
catalyst deploy

# Selectively deploy specific functions
catalyst deploy --only "functions:classifier,functions:nl_sql"

# Deploy a single function
catalyst deploy --only "functions:pipeline"
```

---

## Catalyst Console: Environment Variable Management

### The "Env Var Wipe" Issue

**`catalyst deploy` overwrites all Console environment variables.** After every deploy, any variables that were set through the Catalyst Console UI are erased. This is a known Catalyst CLI behaviour — the deploy process writes the function's `catalyst-config.json` `env_variables` object to the Console, replacing whatever was there before.

Since all function configs have `"env_variables": {}`, the Console ends up empty after each deploy.

### Recovery Procedure

After **every** `catalyst deploy`, you must re-add `QUICKML_TOKEN` for the four GLM-dependent functions:

1. Open **Catalyst Console** → Functions.
2. For each function below, click its name → **Environment Variables**.
3. Add the `QUICKML_TOKEN` variable with the current valid token value.
4. Click **Save**.

| Function | Must Re-Add `QUICKML_TOKEN` | Reason |
|----------|------------------------------|--------|
| `classifier` | Yes | Calls QuickML GLM for intent classification (fallback). |
| `nl_sql` | Yes | Calls QuickML GLM for NL-to-SQL translation. |
| `rag` | Yes | Calls QuickML GLM for narrative answer generation. |
| `pipeline` | Yes | Calls QuickML GLM for SQL generation, classifier fallback, and narrative answer. |
| `session` | No | No GLM dependency. |
| `query_exec` | No | No GLM dependency. |
| `test` | No | No GLM dependency. |
| (entity-resolution functions) | No | No GLM dependency. |

### Workflow Script

```bash
# Step 1: Deploy
catalyst deploy --only "functions:pipeline"

# Step 2: Immediately re-add QUICKML_TOKEN in Console
#   Catalyst Console → Functions → pipeline → Environment Variables
#   → Add QUICKML_TOKEN = 1000.xxxx...
```

<!-- VERIFY: There is no CLI-only workaround for re-adding env vars — confirm Catalyst Console is the only supported mechanism. -->

---

## RBAC Scope Injection

The `query_exec` function implements **RBAC (Role-Based Access Control) scope injection** to restrict query results based on the requesting employee's organisational hierarchy.

### How It Works

The `applyScope(sql, scope)` function (in `functions/query_exec/index.js`) injects `WHERE` clauses into a SQL statement based on the caller's `scope` object:

```javascript
function applyScope(sql, scope) {
  if (!scope) return sql;

  const filters = [];
  if (scope.district_filter) {
    filters.push(`u.DistrictID = ${Number(scope.district_filter)}`);
  }
  if (scope.unit_filter) {
    filters.push(`cm.PoliceStationID = ${Number(scope.unit_filter)}`);
  }

  if (filters.length === 0) return sql;

  // ...inserts WHERE clause at the correct position
}
```

### Scope Parameters

| Scope Field | SQL Injected | Table Alias | Description |
|-------------|-------------|-------------|-------------|
| `scope.district_filter` | `u.DistrictID = <value>` | `u` (Unit) | Restricts results to a specific district. |
| `scope.unit_filter` | `cm.PoliceStationID = <value>` | `cm` (CaseMaster) | Restricts results to a specific police station. |

### SQL Injection Handling

The scope values are converted to numbers via `Number()` before interpolation, which prevents SQL injection through the scope parameter. If the value is not numeric, `Number()` returns `NaN`, and the condition becomes `u.DistrictID = NaN` (which matches zero rows — safe, not exploitable).

### No WHERE Clause Handling

If the SQL has no `WHERE`, the function inserts the scope condition before `GROUP BY`, `ORDER BY`, or `LIMIT` (whichever comes first):

```sql
-- Input
SELECT cm.* FROM CaseMaster cm
INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
LIMIT 50

-- After scope applied (district_filter = 4)
SELECT cm.* FROM CaseMaster cm
INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
WHERE u.DistrictID = 4
LIMIT 50
```

### Existing WHERE Clause Handling

If the SQL already has a `WHERE`, the scope condition is prepended inside it:

```sql
-- Input
SELECT cm.* FROM CaseMaster cm
WHERE cm.CrimeMajorHeadID = 5

-- After scope applied (district_filter = 4)
SELECT cm.* FROM CaseMaster cm
WHERE u.DistrictID = 4 AND cm.CrimeMajorHeadID = 5
```

### Who Supplies the Scope

The `scope` object is provided by the caller in the request body to `query_exec`:

```json
{
  "sql": "SELECT ...",
  "scope": {
    "district_filter": 4,
    "unit_filter": 107
  }
}
```

The `session` function loads the Employee hierarchy (rank, unit, district) from the `Employee` table and can supply the appropriate scope for the requesting employee ID. The `pipeline` function uses session data to pass scope to `query_exec`.

---

## `.env.example` Template

The project root contains `.env.example` which serves as the canonical reference for local development setup:

```env
# ============================================================
# DEVELOPMENT — Self Client OAuth (quick setup, manual refresh)
# ============================================================
# Generate from Zoho API Console > Self Client > scope: QuickML.deployment.READ
# Token expires in 1 hour — regenerate and update this value
QUICKML_TOKEN=your_access_token_here
CATALYST_ORG=60073929329

# ============================================================
# PRODUCTION — Server-based App OAuth (auto-refresh flow)
# ============================================================
# Register at Zoho API Console > Server-based Applications
# Use authorization code flow to get client_id, client_secret, refresh_token
# QUICKML_CLIENT_ID=your_client_id_here
# QUICKML_CLIENT_SECRET=your_client_secret_here
# QUICKML_REFRESH_TOKEN=your_refresh_token_here
```

### Setup Steps for a New Developer

1. Copy `.env.example` to `.env` in the project root.
2. Generate a Self Client OAuth token from the Zoho API Console with scope `QuickML.deployment.READ`.
3. Paste the token as the value of `QUICKML_TOKEN` in `.env`.
4. The `CATALYST_ORG` value (`60073929329`) is pre-filled and correct for the `Datathon2026` project.

> **Note:** `.env` is gitignored. Never commit secrets to version control.

---

## `.catalystrc` (Catalyst CLI Config)

The `.catalystrc` file at the project root stores the CLI connection to the Catalyst project:

```json
{
  "defaults": { "project": 1 },
  "actives": { "project": 1, "env": 1 },
  "projects": [
    {
      "idx": 1,
      "id": "47995000000013046",
      "name": "Datathon2026",
      "domain": {
        "id": "50043045969",
        "name": "datathon2026-60073929329.development"
      },
      "timezone": "Asia/Kolkata",
      "env": [
        { "idx": 1, "id": "60073929329", "name": "Development", "type": 3 }
      ]
    }
  ]
}
```

| Field | Value | Description |
|-------|-------|-------------|
| `projects[0].id` | `47995000000013046` | Datathon2026 project ID in Catalyst. |
| `projects[0].domain.name` | `datathon2026-60073929329.development` | Development domain for deployed functions. |
| `projects[0].env[0].id` | `60073929329` | Organisation ID (matches `CATALYST_ORG`). |
| `projects[0].timezone` | `Asia/Kolkata` | Project timezone (IST). |

<!-- VERIFY: The project ID `47995000000013046` and domain name are specific to this Catalyst project — they will differ if the project is recreated or cloned. -->

---

## Defaults and Fallbacks

All configurable values that have code defaults are summarised below:

| Variable | Code Default | Source File(s) |
|----------|-------------|----------------|
| `CATALYST_ORG` | `'60073929329'` | classifier, nl_sql, rag, pipeline (line 8-9) |
| `QUICKML_URL` | `'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat'` | classifier, nl_sql, rag, pipeline (line 6) |
| `RAG_ANSWER_URL` | `'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/rag/answer'` | rag, pipeline (line 7) |
| `QUICKML_MODEL` | `'crm-di-glm47b_30b_it'` | classifier, nl_sql, rag, pipeline (line 7-8) |
| `PM_WRITER_BATCH_SIZE` | `75` | `functions/personmaster-writer/index.js` (line 13) |
| `VITE_API_BASE` | `'/api'` | `client/src/utils/constants.js` |

These defaults are hardcoded at module load time using the `||` operator pattern:

```javascript
const QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';
```

Setting the corresponding environment variable overrides the default. No environment variable is strictly required to be set for the code to function — but `QUICKML_TOKEN` and `CATALYST_ORG` are **required at runtime** because without them GLM API calls will fail immediately.

---

## Per-Environment Overrides

### Development

- **`.env`** at project root for `QUICKML_TOKEN` and `CATALYST_ORG`.
- **`client/.env.development`** for `VITE_SKIP_AUTH=true` (bypasses authentication during UI development).
- Local testing uses the Self Client OAuth flow (manual token refresh every hour).

### Production (Catalyst Deployed)

- Environment variables are set via **Catalyst Console** (encrypted at rest, never in version control).
- `CATALYST_ORG` is set via Console or inherits the code default.
- The Self Client OAuth flow works for demo scenarios but is **not production-safe** (token expires every 60 minutes with no auto-refresh).
- Production deployment should migrate to Server-based OAuth with a refresh token (see `docs/production-auth.md` for the migration plan).

### Staging / Additional Environments

The Catalyst project (`Datathon2026`) currently has a single environment (`Development`, `type: 3`). If additional environments (staging, UAT) are added in the Catalyst Console, the `.catalystrc` `env` array would expand, and the `catalyst deploy` command targets the active environment. No separate `.env.staging` or `.env.production` files exist for the function runtime — all per-environment configuration flows through the Console UI.
