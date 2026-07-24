<!-- generated-by: gsd-doc-writer -->
# Development Guide — KSP Crime Analytics Platform

Development guide for contributors working on the KSP Crime Analytics Platform. This covers codebase organization, the edit-deploy-test workflow, local testing, GLM API integration, ZCQL V2 constraints, common pitfalls, debugging, and how to add a new function.

---

## Code Organization

The repository has three main areas, each with a different module system and toolchain.

```
ksp-crime-analytics-platform/
├── catalyst.json                  # Deployment manifest (13 function targets + 1 slate)
├── functions/                     # 17 entries — Catalyst serverless functions
│   ├── pipeline/                  #   Main orchestrator (~1244 lines, inline handlers)
│   ├── classifier/                #   Intent classification
│   ├── nl_sql/                    #   NL-to-ZCQL translation + execution
│   ├── rag/                       #   BriefFacts narrative search
│   ├── session/                   #   Conversation memory (Cache CRUD)
│   ├── query_exec/                #   Raw ZCQL executor
│   ├── test/                      #   Health check
│   ├── entity-matching-engine/    #   Library: name normalisation, phonetic, blocking, scoring
│   ├── personmaster-writer/       #   Batch NoSQL writer
│   ├── personmaster-api/          #   Skeleton HTTP endpoint
│   ├── sync-full/                 #   Full graph rebuild (cron-triggered)
│   ├── sync-incremental/          #   Incremental entity signal processing
│   ├── graph-traversal/           #   BFS graph traversal
│   ├── graph-service/             #   Library: graph data source singleton
│   ├── graph-visualization/       #   Library: Cytoscape.js formatter
│   ├── network-analysis/          #   Network analysis routes/validators
│   └── personmaster-builder/      #   Library: cluster → document pipeline
├── client/                        # React frontend (slate, shipped to Catalyst)
│   ├── src/                       #   Source code
│   │   ├── components/            #   React components
│   │   ├── contexts/              #   React context providers
│   │   ├── hooks/                 #   Custom hooks
│   │   ├── services/              #   API service layer
│   │   ├── lib/                   #   Utility library
│   │   ├── utils/                 #   Helper functions
│   │   └── __tests__/             #   Vitest test files (13 test files)
│   ├── vitest.config.js           #   Vitest configuration
│   ├── vite.config.js             #   Vite + React + Tailwind configuration
│   ├── catalyst-config.json       #   Slate build config
│   └── package.json               #   npm scripts: dev, test, build, lint
├── data_pipeline/                 # Synthetic data generation (ESM)
│   ├── src/generators/            #   16 table generators (State, District, CrimeHead, etc.)
│   ├── src/helpers/csv.js         #   CSV writer utility
│   ├── mappings/                  #   ROWID mapping files for FK resolution
│   ├── run_phase.js               #   Phase orchestrator
│   ├── generate_phase*.cjs        #   Individual phase scripts (2b, 4, 5, 6)
│   └── package.json               #   ESM ("type": "module") with @faker-js/faker, csv-writer
└── docs/                          # Project documentation
```

### Module System Differences

| Area | Module System | Entry | Test Framework |
|------|---------------|-------|----------------|
| `functions/` | CommonJS (`require`/`module.exports`) | `index.js` | Manual (curl/PowerShell) |
| `client/` | ESM (`import`/`export`) | `main.jsx` | Vitest |
| `data_pipeline/` | ESM (`"type": "module"`) | `run_phase.js` | None |

> **Important:** Do not mix module systems. Function code is CommonJS and cannot use `import`/`export`. The client and data_pipeline are ESM.

---

## Development Workflow

The primary development loop is: **edit → deploy → test**.

### 1. Edit

All Catalyst functions live under `functions/{name}/index.js`. There is no local dev server for functions — they must be deployed to Catalyst to run.

```bash
# Edit a function
code functions/pipeline/index.js
```

For the client, use the Vite dev server:

```bash
cd client
npm run dev         # Starts dev server with proxy to deployed Catalyst functions
```

The Vite dev server proxies `/api` requests to the development Catalyst base URL (configured in `vite.config.js`).

### 2. Deploy

```bash
# Deploy all functions
catalyst deploy

# Deploy specific functions (faster)
catalyst deploy --only "functions:pipeline,functions:classifier"

# Deploy a single function
catalyst deploy --only "functions:nl_sql"
```

**Critical:** After every deploy, environment variables are wiped. You must re-add `QUICKML_TOKEN` via Catalyst Console for these 4 functions:

- `classifier`
- `nl_sql`
- `rag`
- `pipeline`

For the client (slate):

```bash
cd client
npm run build
catalyst deploy   # Deploys functions + slate together
```

### 3. Test

After deploying, test the function using **PowerShell** `Invoke-RestMethod` or any HTTP client:

```powershell
# Pipeline — aggregation
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"count of cases in Bengaluru Urban","employee_id":1}'

# Health check
Invoke-RestMethod -Method GET -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/test/"
```

See [TESTING.md](../TESTING.md) for 50+ test commands covering all functions and intents.

### Fast Iteration Tips

1. **Deploy only the changed function** (not all 13 targets) — saves ~30 seconds per cycle
2. **Re-add QUICKML_TOKEN immediately** after deploy before testing
3. **Keep a terminal or file open** with test commands ready so you can paste and run

---

## Testing Locally

### Catalyst Functions (Manual Testing)

Functions cannot run locally because they depend on the Catalyst runtime (`zcatalyst-sdk-node`). Always deploy and test against the development endpoint.

**Base URL (Development):**
```
https://datathon2026-60073929329.development.catalystserverless.in/server
```

**curl equivalent:**
```bash
curl -X POST "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"count of cases in Bengaluru Urban","employee_id":1}'
```

**PowerShell (recommended on Windows):**
```powershell
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"count of cases in Bengaluru Urban","employee_id":1}'
```

### Client (Vitest)

The React frontend uses **Vitest** with jsdom for unit tests. Tests live in `client/src/__tests__/`.

```bash
# Run all tests
cd client
npm test

# Run in watch mode during development
npm run test:watch

# Run a specific test file
npx vitest run src/__tests__/App.test.jsx
```

**Configuration:** `client/vitest.config.js` — uses `@vitejs/plugin-react`, jsdom environment, globals enabled, and `@` alias pointing to `./src`.

**Available client scripts:**
| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Production build to `client/dist/` |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | Run oxlint |

### Linting

The project uses **oxlint** (configured in `client/package.json`). No formatter (Prettier/Biome) is configured — code uses inconsistent spacing across files. Follow the existing pattern for the file you are editing.

---

## GLM API Development

The platform uses Zoho Catalyst's QuickML with the GLM model (`crm-di-glm47b_30b_it`) for SQL generation, classification fallback, and narrative answer generation.

### API Endpoint

```
POST https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat
```

### Request Format

```json
{
  "model": "crm-di-glm47b_30b_it",
  "messages": [{ "role": "user", "content": "your prompt here" }],
  "temperature": 0.1,
  "max_tokens": 500,
  "chat_template_kwargs": { "enable_thinking": false }
}
```

### Critical: `enable_thinking: false`

Every GLM call **MUST** include `"chat_template_kwargs": { "enable_thinking": false }`. Without this parameter, the model performs chain-of-thought reasoning before outputting its response. This breaks `JSON.parse()` when the output is expected to be raw JSON and adds 5-15 seconds of unnecessary latency.

**Implementation pattern** (from `functions/pipeline/index.js`):

```javascript
function callQuickML(prompt, options = {}) {
  const body = JSON.stringify({
    model: QUICKML_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: options.temperature ?? 0.1,
    max_tokens: options.max_tokens ?? 500,
    chat_template_kwargs: { enable_thinking: false },
  });
  // ... HTTPS request with 20-second timeout
}
```

### Token Management

- **Authentication:** `Authorization: Zoho-Oauthtoken {token}` + `CATALYST-ORG: 60073929329` headers
- **Token type:** Self-client OAuth (starts with `1000.`)
- **Expiry:** 1 hour — no auto-refresh
- **Where to set:** Catalyst Console → Functions → {name} → Environment Variables → `QUICKML_TOKEN`
- **Current token location:** `.env` file (gitignored)

### Token Refresh Procedure

When the token expires (GLM calls return 401 or "token expired" errors):

1. Go to Zoho API Console → Self Client
2. Generate new token with scope: `QuickML.deployment.READ`
3. Copy the token (starts with `1000.`)
4. Update `.env` file: `QUICKML_TOKEN=1000.{hash}.{hash}`
5. Update Catalyst Console → Environment Variables for all 4 GLM functions

### Timeout Configuration

The GLM HTTP timeout is set to **20 seconds** in the `callQuickML` function:

```javascript
timeout: 20000,
```

GLM responses typically take **10-25 seconds**. The 20-second timeout is a compromise between the 30-second Catalyst function limit and typical GLM response times. If GLM is slow, consider:

- Reducing `max_tokens` (from 500 to 200-300 for simpler prompts)
- Trimming prompt lengths
- Using keyword-based fallbacks where possible

### Response Parsing

```javascript
function extractGLMContent(response) {
  if (response.choices && response.choices[0] && response.choices[0].message) {
    return response.choices[0].message.content;  // OpenAI-compatible format
  }
  if (response.response) {
    return response.response;  // Raw response format
  }
  return null;
}
```

---

## ZCQL V2 Constraints

The project uses **ZCQL V2** (Catalyst's SQL dialect). It differs from standard SQL in several critical ways.

### JOIN Syntax — Explicit Only

```sql
-- ✅ CORRECT: Explicit INNER JOIN ... ON
SELECT cm.CrimeNo, d.DistrictName
FROM CaseMaster cm
INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
INNER JOIN District d ON u.DistrictID = d.ROWID

-- ❌ WRONG: Implicit joins (comma-separated FROM)
SELECT cm.CrimeNo, d.DistrictName
FROM CaseMaster cm, Unit u, District d
WHERE cm.PoliceStationID = u.ROWID AND u.DistrictID = d.ROWID
```

### LIKE Wildcards — Asterisk, Not Percent

```sql
-- ✅ CORRECT: Use * (not %)
WHERE ch.CrimeGroupName LIKE '*theft*'
WHERE a.AccusedName LIKE '*Chandrika*'

-- ❌ WRONG: Standard SQL % does not work
WHERE ch.CrimeGroupName LIKE '%theft%'
```

### COUNT — Must Use Qualified Column

```sql
-- ✅ CORRECT: COUNT(alias.ColumnName)
SELECT COUNT(cm.CaseMasterID) FROM CaseMaster cm

-- ❌ WRONG: ZCQL V2 rejects COUNT(*)
SELECT COUNT(*) FROM CaseMaster
```

### Hard Limits

| Constraint | Limit |
|------------|-------|
| `SELECT` columns | Max **20** |
| Rows returned without explicit `LIMIT` | Max **300** |
| `WHERE` conditions | Max **5** |
| `JOIN` clauses | Max **4** |
| Conditions per `JOIN` | **1** |

### Supported SQL Functions

`COUNT()`, `SUM()`, `AVG()`, `MIN()`, `MAX()`, `DISTINCT`, `GROUP BY`, `ORDER BY ASC/DESC`, `HAVING`, `BINARYOF()` (case-insensitive grouping), subqueries in `WHERE`.

### Other Syntax Rules

- **String values:** single quotes only (`'Bengaluru Urban'`)
- **IS operator:** works like `=`, plus `IS NULL` / `IS NOT NULL`
- **Table aliases:** use `AS` (e.g., `FROM CaseMaster AS cm`)
- **LIMIT with offset:** `LIMIT 1,3` (3 rows starting at index 2)
- **GenderID values:** 1=Male, 2=Female, 3=Other
- **SELECT \*** is supported (max 300 rows)

### FK Join Chains via ROWID

All FK columns store the target table's Catalyst **ROWID** (a long alphanumeric string). Key join paths:

```
CaseMaster.PoliceStationID   → Unit.ROWID
Unit.DistrictID              → District.ROWID
District.StateID             → State.ROWID
CaseMaster.CrimeMajorHeadID  → CrimeHead.ROWID
CaseMaster.CrimeMinorHeadID  → CrimeSubHead.ROWID
Accused.CaseMasterID         → CaseMaster.ROWID
Victim.CaseMasterID          → CaseMaster.ROWID
ComplainantDetails.CaseMasterID → CaseMaster.ROWID
```

### CrimeHead Join — Two Paths

| Path | When to Use | JOIN Pattern |
|------|-------------|-------------|
| Direct (CrimeMajorHeadID) | Query asks about crime **type/group/category** — e.g., "theft cases", "crime types by count" | `INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID` |
| Via CrimeSubHead (CrimeMinorHeadID) | Query asks about **specific sub-head/sub-type** — e.g., "pickpocketing", "dacoity" | `INNER JOIN CrimeSubHead cs ON cm.CrimeMinorHeadID = cs.ROWID INNER JOIN CrimeHead ch ON cs.CrimeHeadID = ch.ROWID` |

### ZCQL Result Format

Results are keyed by table alias. Flatten using the `Object.keys` merge pattern:

```json
[
  {
    "cm": { "CaseMasterID": "123", "CrimeNo": "2024-001" },
    "d": { "DistrictName": "Bengaluru Urban" }
  }
]
```

```javascript
// ✅ CORRECT — flat merge all alias objects
function zcqlRows(rows) {
  return rows.map(r => {
    const flat = {};
    for (const key of Object.keys(r)) {
      const val = r[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(flat, val);
      } else {
        flat[key] = val;
      }
    }
    return flat;
  });
}

// ❌ WRONG — only gets first alias, misses CaseMasterID
Object.values(r)[0]
```

---

## Common Pitfalls

| Pitfall | Symptom | Solution |
|---------|---------|----------|
| **Env var wipe on deploy** | GLM calls fail with `QUICKML_TOKEN not configured` | After every `catalyst deploy`, re-add `QUICKML_TOKEN` in Catalyst Console for classifier, nl_sql, rag, pipeline |
| **OAuth token expiry** | GLM returns 401 or "token expired" | Generate new self-client token (1hr expiry), update `.env` and Console |
| **30-second function timeout** | Function returns 504 Gateway Timeout | Check that GLM timeout is ≤ 20s, reduce `max_tokens`, trim prompts, use SQL auto-retry only once |
| **Missing `enable_thinking`** | GLM returns chain-of-thought text instead of JSON, `JSON.parse()` fails | Add `"chat_template_kwargs": { "enable_thinking": false }` to every GLM call |
| **ZCQL implicit joins** | ZCQL returns error on comma-separated FROM | Use `INNER JOIN ... ON` syntax explicitly |
| **ZCQL `%` wildcard** | LIKE query returns 0 results | Use `*` instead of `%` (e.g., `LIKE '*theft*'`) |
| **ZCQL `COUNT(*)`** | ZCQL rejects query | Use `COUNT(alias.ColumnName)` — e.g., `COUNT(cm.CaseMasterID)` |
| **Exceeding JOIN limit** | ZCQL returns error about JOIN count | Keep ≤ 4 JOINs per query. If you need more data, split into multiple queries |
| **"returnErrorResponse" 500** | Function returns 500 with no useful error | Delete the function from Catalyst Console → `catalyst deploy --only "functions:{name}"` → re-add env vars. Corrupted Console registration. |
| **Cross-function code duplication** | Same `callQuickML` in every function | Accepted trade-off. Each function is independently deployable. |
| **Missing CATALYST_ORG header** | GLM returns auth error | `CATALYST_ORG` is a reserved keyword — cannot be in `catalyst-config.json`. Set via Console or use default: `process.env.CATALYST_ORG || '60073929329'` |

---

## Catalyst Console Debugging

### Viewing Logs

1. Go to **Catalyst Console** → **Functions** → Select your function (e.g., `pipeline`)
2. Click **Logs** in the left sidebar
3. Filter by severity (Error, Info, Debug)

### Interpreting Logs

| Log Pattern | Meaning |
|-------------|---------|
| `Execution started` with no result | Function started but didn't finish — likely **timeout** (30s limit) |
| `QUICKML_TOKEN not configured` | Env var was wiped by deploy — re-add via Environment Variables |
| `GLM request timed out` | GLM took > 20 seconds — reduce prompt/tokens or increase timeout |
| `UNSAFE_SQL: DROP not allowed` | SQL validation caught blocked keyword |
| `Cannot read properties of undefined` | Likely ZCQL returned no rows or unexpected format — check query |
| `returnErrorResponse` | Corrupted function registration — delete and recreate |

### Adding Verbose Logging

The `catalyst` SDK logs can be noisy. For focused debugging, use `console.log`/`console.error`:

```javascript
try {
  const result = await app.zcql().executeZCQLQuery(sql);
  console.log('ZCQL result length:', result?.length);
} catch (err) {
  console.error('ZCQL execution failed:', err.message);
}
```

Log output appears in Catalyst Console → Functions → {name} → Logs within seconds of function execution.

---

## Adding a New Function

### 1. Create the Function Directory

```bash
mkdir functions/{my-function}
```

### 2. Create `package.json`

```json
{
  "name": "{my-function}",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "zcatalyst-sdk-node": "latest"
  }
}
```

### 3. Create `catalyst-config.json`

```json
{
  "deployment": {
    "name": "{my-function}",
    "stack": "node24",
    "type": "advancedio",
    "env_variables": {}
  },
  "execution": {
    "main": "index.js"
  }
}
```

### 4. Create `index.js`

Follow the project's standard boilerplate pattern:

```javascript
'use strict';

const catalyst = require('zcatalyst-sdk-node');

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, status, errorCode, message) {
  sendJson(res, status, {
    status: 'error',
    error_code: errorCode,
    message,
    fallback_answer: 'I was unable to process your request at this time.'
  });
}

function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = async (req, res) => {
  try {
    const app = catalyst.initialize(req);
    // ... function logic
  } catch (err) {
    sendError(res, 500, 'INIT_FAILED', 'Failed to initialize Catalyst SDK');
  }
};
```

### 5. Register in `catalyst.json`

Add the function name to the `targets` array in `catalyst.json`:

```json
{
  "functions": {
    "targets": [
      // ... existing targets
      "{my-function}"
    ],
    "source": "functions"
  }
}
```

### 6. Deploy and Verify

```bash
npm install --prefix functions/{my-function}
catalyst deploy --only "functions:{my-function}"
```

If the function needs `QUICKML_TOKEN` (GLM calls):
1. Add `QUICKML_TOKEN` via Catalyst Console → Functions → {my-function} → Environment Variables
2. Also add `CATALYST_ORG` if it's not using the default value

### 7. Test

Invoke the function using PowerShell/curl against the development endpoint:

```powershell
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/{my-function}/{route}" -ContentType "application/json" -Body '{"key":"value"}'
```

---

## Next Steps

- See [TESTING.md](../TESTING.md) for 50+ test commands covering all functions and intents
- See [ARCHITECTURE.md](ARCHITECTURE.md) for component diagrams and data flow details
- See [CONFIGURATION.md](CONFIGURATION.md) for environment variables and configuration options
