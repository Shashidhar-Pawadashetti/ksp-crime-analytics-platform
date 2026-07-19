# Deployment Guide — KSP Crime Analytics Platform

## Prerequisites

- **Node.js 24+** (Catalyst AdvancedIO runtime)
- **zcatalyst-cli** v1.26.2+: `npm i -g zoho-catalyst-cli`
- **Zoho Catalyst account** with an active project
- **Catalyst project credentials** (`.catalystrc`)
- **Self Client OAuth token** for QuickML access

## Environment Variables

### Quick Reference

| Variable | Required By | Type | Description |
|----------|-------------|------|-------------|
| `QUICKML_TOKEN` | classifier, nl_sql, rag, pipeline | Secret | Self Client OAuth token (1000.xxx), expires hourly |
| `CATALYST_ORG` | All QuickML callers | Constant | Org ID: `60073929329` |
| `QUICKML_URL` | All QuickML callers | Optional | GLM endpoint override |
| `QUICKML_MODEL` | All QuickML callers | Optional | Model override: `crm-di-glm47b_30b_it` |

### CATALYST_ORG — Reserved Keyword

`CATALYST_ORG` is a **reserved keyword** in Catalyst. It cannot be set via
`catalyst-config.json`. Use the Console UI or fallback in code:

```javascript
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';
```

## OAuth Setup

### Development: Self Client App (Quick Setup)

1. Go to **Zoho API Console** > **Self Client**
2. Create a client with scope: `QuickML.deployment.READ`
3. Generate a token (starts with `1000.`)
4. Set as `QUICKML_TOKEN` in `.env` (for local) or Catalyst Console (deployed)

**Important:** Self Client tokens expire **every hour**. There is no auto-
refresh. You must generate a new token and update the Console after each
expiry.

### Production: Server-based App (Recommended)

See [docs/production-auth.md](docs/production-auth.md) for the full migration
guide. The Server-based App flow:

1. Register at **Zoho API Console** > **Server-based Applications**
2. Get `client_id` and `client_secret` (never expires)
3. Run auth flow to get `refresh_token` (never expires)
4. Implement auto-refresh in each function using the refresh token

**Env vars for production:**

| Variable | Value |
|----------|-------|
| `QUICKML_CLIENT_ID` | `1000.xxxx...` from API Console |
| `QUICKML_CLIENT_SECRET` | From API Console |
| `QUICKML_REFRESH_TOKEN` | `1000.xxxx...` from grant exchange |
| `CATALYST_ORG` | `60073929329` |

## GLM LLM Configuration

### Model

`crm-di-glm47b_30b_it` — deployed on Catalyst QuickML.

### Endpoint

```
POST https://api.catalyst.zoho.in/quickml/v1/project/{project_id}/glm/chat
```

Configured via `process.env.QUICKML_URL` with fallback.

### Critical Parameter

Every GLM call **MUST** include:

```json
{
  "model": "crm-di-glm47b_30b_it",
  "messages": [{"role": "user", "content": "..."}],
  "temperature": 0.1,
  "max_tokens": 500,
  "chat_template_kwargs": { "enable_thinking": false }
}
```

Without `enable_thinking: false`, the model outputs chain-of-thought
reasoning before the JSON payload, breaking `JSON.parse()`.

### Timeouts

| Timeout | Value | Notes |
|---------|-------|-------|
| Catalyst function | 30s | Hard limit from platform |
| GLM HTTP request | 15-20s | Configured per function |
| GLM response time | 10-25s | Model processing time |

## Function Deployment

### Deploy All Functions

```bash
catalyst deploy
```

Deploys all 12 functions listed in `catalyst.json`:

```json
{
  "functions": {
    "targets": [
      "test", "session", "classifier", "nl_sql", "rag",
      "query_exec", "pipeline", "entity-matching-engine",
      "personmaster-writer", "sync-incremental", "sync-full",
      "graph-traversal", "personmaster-api"
    ],
    "ignore": [],
    "source": "functions"
  }
}
```

### Deploy Single Function

```bash
catalyst deploy --only "functions:pipeline"
catalyst deploy --only "functions:classifier"
```

### Catalyst-Config Structure

Each function directory contains `catalyst-config.json`:

```json
{
  "deployment": {
    "stack": "node:24",
    "type": "advancedio",
    "function_timeout": 30
  }
}
```

## Post-Deploy Steps

### CRITICAL: Re-add QUICKML_TOKEN

**Every `catalyst deploy` wipes Console environment variables.** After
deploy, you must re-add `QUICKML_TOKEN` for these 4 functions:

1. **classifier**
2. **nl_sql**
3. **rag**
4. **pipeline**

**Steps:**

1. Go to **Catalyst Console** > **Functions** > `{function name}`
2. **Environment Variables** tab
3. **Add** `QUICKML_TOKEN` with current OAuth token
4. **Repeat** for all 4 functions

### Verify Deployment

```bash
# Health check
curl -X GET "https://datathon2026-60073929329.development.catalystserverless.in/server/test/"

# Classifier test
curl -X POST "https://datathon2026-60073929329.development.catalystserverless.in/server/classifier/classify" \
  -H "Content-Type: application/json" \
  -d '{"query":"show associates of Ravi"}'
```

## NoSQL Table Creation

The PersonMaster table must exist in Catalyst NoSQL before writes:

1. Go to **Catalyst Console** > **NoSQL Database**
2. Create a table named `PersonMaster`
3. The writer will dynamically add columns as documents are inserted

## Signal Registration

For incremental sync to work, Catalyst Signals must be configured:

- Register signals on: **Accused**, **Victim**, **ComplainantDetails** tables
- Connect signals to the `sync-incremental` function
- Signal payload includes: `table_name`, `operation` (INSERT/UPDATE), `record`

## Cron Job Setup

For periodic full graph rebuild:

1. Go to **Catalyst Console** > **Functions** > `sync-full`
2. **Cron/Events** tab
3. Create a cron trigger (e.g., daily at midnight)
4. The `cronHandler.js` will execute the full pipeline

## Common Issues

### "returnErrorResponse" 500

**Cause:** Corrupted Console function registration (catalyst.json mismatch).

**Fix:**
1. Delete the function from Catalyst Console
2. Redeploy: `catalyst deploy --only "functions:{name}"`
3. Re-add env vars in Console

### Environment Variables Wiped

**Cause:** `catalyst deploy` overwrites Console env vars.

**Fix:** Always re-add `QUICKML_TOKEN` after every deploy. Consider using
a script:

```bash
# deploy-and-set-env.ps1
catalyst deploy --only "functions:pipeline"
# Manually re-add QUICKML_TOKEN via Console
Write-Host "Remember to re-add QUICKML_TOKEN for pipeline"
```

### Function Timeout (30s)

**Cause:** GLM LLM takes 10-25s to respond + ZCQL execution time.

**Mitigations:**
- Set `max_tokens` to 200-300 for responses
- Keep prompts trimmed
- Set GLM HTTP timeout to 15-20s
- Auto-retry only once (due to timeout constraints)

### GLM Token Expired

**Cause:** Self Client OAuth token expired (1 hour lifetime).

**Symptom:** 401 from QuickML API, functions return 500.

**Fix:**
1. Go to **Zoho API Console** > **Self Client**
2. Generate new token
3. Update `QUICKML_TOKEN` in Catalyst Console for all 4 functions

### GLM Hallucinates Column Names

**Cause:** LLM invents non-existent columns (e.g., `LastName` instead of
`AccusedName`).

**Mitigation:**
- Strict prompt: "Use ONLY columns listed in schema"
- Auto-retry mechanism: if ZCQL execution fails, send error back to GLM
  with fix-prompt (one retry only)

## Troubleshooting Guide

| Symptom | Likely Cause | Check |
|---------|-------------|-------|
| 500 on any QuickML call | QUICKML_TOKEN missing or expired | Check Console env vars |
| 500 on pipeline | Function timeout (30s) | Check Catalyst logs |
| ZCQL error | SQL syntax incompatible with ZCQL V2 | Verify JOIN/LIKE syntax |
| "Unsafe SQL" | DDL/DML keyword detected | Remove DROP/DELETE/etc |
| Empty results | No data matching query | Check data in Data Store |
| BFS returns nothing | PersonMaster not loaded | Check NoSQL for docs |
| Test SKIP message | graph data not found | Run personmaster-builder first |

### Debugging a Failing Function

1. **Catalyst Console** > **Functions** > `{name}` > **Logs**
2. Look for "Execution started" — function started but didn't finish = timeout
3. Check for error messages in logs
4. If no logs, add try/catch with `console.error()` logging
5. Deploy with debug logging, re-check logs
