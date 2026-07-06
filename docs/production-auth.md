# Production OAuth — Server-based Application

## Why Self Client is not production-safe

| Aspect | Self Client | Server-based App |
|---|---|---|
| Token expiry | 1 hour | 1 hour (auto-renewed) |
| Refresh token | Separate manual step | Returned on first auth, never expires |
| Renewal | Paste new token every hour | Code auto-refreshes via `refresh_token` |
| Uptime risk | Function breaks silently when token expires | Seamless, zero-downtime renewal |

The Self Client flow works for development because you can paste a fresh token each hour. In production, a function that dies every 60 minutes because the token expired is unacceptable.

---

## How Server-based App OAuth works

```
┌──────────┐    1. Register app     ┌──────────────┐
│  Dev     │────────────────────────→│  API Console  │
│  Console │←── client_id + secret──│  zoho.com     │
└──────────┘                        └──────────────┘
                                          │
┌──────────┐    2. Auth URL (once)       │
│  Admin   │──────────────────────────────│
│  Browser │←── grant token (code) ──────│
└──────────┘                              │
     │                                    │
     │  3. Exchange grant for tokens      │
     ├────────────────────────────────────│
     │←── access_token + refresh_token ───│
     │                                    │
     ▼                                    │
┌──────────┐                              │
│  .env    │  store refresh_token          │
│  or      │  (never expires)              │
│  Console │                               │
└──────────┘                              │
                                          │
┌──────────┐    4. Function boots         │
│ Catalyst │  checks if access_token       │
│ Function │  expired → uses refresh_token │
│  runtime │  to get new access_token      │
│          │                               │
│  ─── POST /oauth/v2/token ──────────────│
│  ←── new access_token ─────────────────│
│                                          │
│  5. Calls QuickML GLM chat              │
│  ─── Authorization: Zoho-oauthtoken ────│
└──────────┘
```

---

## Step 1: Register a Server-based Application

1. Go to https://api-console.zoho.com
2. Click **Server-based Applications** → **CREATE NOW**
3. Fill in:
   - **Client Name:** `KSP Crime AI (Production)`
   - **Authorized Redirect URIs:** `https://datathon2026-60073929329.development.catalystserverless.in/auth/callback`
     - For local testing during setup, temporarily use `http://localhost:3000/auth/callback`
4. Click **CREATE** → **OK**
5. Copy the **Client ID** and **Client Secret** shown on the next screen

---

## Step 2: Generate the grant token (one-time)

Paste this URL in a browser, replacing `{client_id}` with your own:

```
https://accounts.zoho.in/oauth/v2/auth?
  scope=QuickML.deployment.READ&
  client_id={client_id}&
  response_type=code&
  redirect_uri=https://datathon2026-60073929329.development.catalystserverless.in/auth/callback&
  access_type=offline
```

The browser redirects to your URI with a `code` parameter in the URL:
```
/auth/callback?code=1000.xxxx...&location=in
```

Copy the `code` value — this is the **grant token** (expires in 3 minutes).

---

## Step 3: Exchange grant for access + refresh tokens

```bash
curl -X POST "https://accounts.zoho.in/oauth/v2/token" \
  -d "client_id={client_id}" \
  -d "client_secret={client_secret}" \
  -d "grant_type=authorization_code" \
  -d "code={grant_token}"
```

Response:
```json
{
  "access_token": "1000.xxxx...",
  "refresh_token": "1000.xxxx...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "api_domain": "https://www.zohoapis.in"
}
```

Save **both** tokens. The `access_token` works for 1 hour; the `refresh_token` never expires and can be used to generate new access tokens indefinitely.

---

## Step 4: Update `.env` with production values

```env
# ── Development tokens (Self Client) ──
# QUICKML_TOKEN=...

# ── Production tokens (Server-based App) ──
QUICKML_CLIENT_ID=1000.xxxx...
QUICKML_CLIENT_SECRET=your_secret_here
QUICKML_REFRESH_TOKEN=1000.xxxx...
CATALYST_ORG=60073929329
```

---

## Step 5: Code changes — auto-refresh logic

Each function that calls QuickML (classifier, nl_sql, rag) needs to replace the static `QUICKML_TOKEN` env var lookup with an auto-refresh function.

### 5a. Replace the API call helper

In each function's `index.js`, replace the current `callLLM` / `callQuickML` function with a version that handles token refresh:

```javascript
const https = require('https');

let cachedAccessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const clientId = process.env.QUICKML_CLIENT_ID;
  const clientSecret = process.env.QUICKML_CLIENT_SECRET;
  const refreshToken = process.env.QUICKML_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing OAuth credentials');
  }

  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString();

    const opts = {
      hostname: 'accounts.zoho.in',
      path: '/oauth/v2/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.access_token) {
            return reject(new Error('Failed to refresh token'));
          }
          cachedAccessToken = parsed.access_token;
          tokenExpiresAt = Date.now() + (parsed.expires_in - 60) * 1000;
          resolve(cachedAccessToken);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
```

### 5b. Update the QuickML request to use `getAccessToken()`

```javascript
async function callQuickML(prompt) {
  const token = await getAccessToken();
  const body = JSON.stringify({
    model: process.env.QUICKML_MODEL || 'crm-di-glm47b_30b_it',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 200,
  });

  const urlObj = new URL(process.env.QUICKML_URL);
  const opts = {
    hostname: urlObj.hostname,
    path: urlObj.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Zoho-oauthtoken ${token}`,
      'CATALYST-ORG': process.env.CATALYST_ORG || '60073929329',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 15000,
  };

  return new Promise((resolve) => {
    const req = https.request(opts, (res) => {
      // If 401 — token might have been revoked, clear cache and retry once
      if (res.statusCode === 401) {
        cachedAccessToken = null;
        tokenExpiresAt = 0;
        // Retry logic omitted for brevity — implement with a retry flag
      }
      // ... handle response
    });
    // ...
  });
}
```

### 5c. Fallback: if Server-based credentials aren't set, use static token

Keep backward compatibility with development:

```javascript
async function getAccessToken() {
  // Production path
  if (process.env.QUICKML_REFRESH_TOKEN) {
    // ... refresh token logic ...
  }
  // Development path — static token
  if (process.env.QUICKML_TOKEN) {
    return process.env.QUICKML_TOKEN;
  }
  throw new Error('No OAuth token configured');
}
```

---

## Step 6: Set environment variables in Catalyst Console

For each function (classifier, nl_sql, rag), go to:

**Catalyst Console → Functions → {function name} → Environment Variables → Add:**

| Variable | Value |
|---|---|
| `QUICKML_CLIENT_ID` | From API Console |
| `QUICKML_CLIENT_SECRET` | From API Console |
| `QUICKML_REFRESH_TOKEN` | From the grant exchange response |
| `CATALYST_ORG` | `60073929329` |
| `QUICKML_URL` | `https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat` |
| `QUICKML_MODEL` | `crm-di-glm47b_30b_it` |

Do **not** store these in `catalyst-config.json` — set them via the Console UI only (encrypted at rest, never in version control).

---

## Step 7: Refresh token lifecycle

```
Function boots
  │
  ├── is cachedAccessToken valid? ──yes──→ use it
  │
  └── no → POST /oauth/v2/token with refresh_token
              │
              ├── success → cache new access_token (expires - 60s buffer)
              │              → use it
              │
              └── 400/401 → log critical error
                              → return fallback response
                              → admin must re-generate refresh token

Function handles request
  │
  ├── QuickML returns 200 ──→ return result
  │
  └── QuickML returns 401 ──→ invalidate cache
                               → retry once with fresh token
                               → if fails again, return error
```

---

## Emergency: Revoking a compromised refresh token

If a refresh token is leaked:

1. Go to https://accounts.zoho.in/oauth/v2/token/revoke
2. POST with `token={refresh_token}` to invalidate it
3. Generate a new refresh token by re-running Steps 2–3
4. Update the environment variables in Catalyst Console

---

## Summary of env vars by environment

| Variable | Development | Production | Where to set |
|---|---|---|---|
| `QUICKML_TOKEN` | `1000.xxxx` (Self Client) | — | `.env` (dev) |
| `QUICKML_CLIENT_ID` | — | `1000.xxxx` | Catalyst Console |
| `QUICKML_CLIENT_SECRET` | — | `secret` | Catalyst Console |
| `QUICKML_REFRESH_TOKEN` | — | `1000.xxxx` | Catalyst Console |
| `CATALYST_ORG` | `60073929329` | `60073929329` | Runtime injected |
| `QUICKML_URL` | *(fallback in code)* | *(fallback in code)* | Optional override |
| `QUICKML_MODEL` | *(fallback in code)* | *(fallback in code)* | Optional override |
