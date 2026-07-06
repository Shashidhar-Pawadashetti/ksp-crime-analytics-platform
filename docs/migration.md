# OAuth Migration: Self Client → Server-based App

## Problem

Currently all 4 GLM-calling functions (classifier, nl_sql, rag, pipeline) use a **Self Client OAuth token** set via Console env var `QUICKML_TOKEN`. This token expires every **1 hour** with no auto-refresh, requiring manual regeneration.

## Solution

Migrate to a **Server-based Application** OAuth flow which provides a `refresh_token`. Functions auto-refresh the access token before each GLM call using the refresh token, with zero manual intervention.

---

## Step 1 — Register Server-based App in Zoho API Console

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Create → **Server-based Application**
3. Fill in:
   - **Client Name:** `KSP Crime Analytics Platform`
   - **Client Domain:** (your project domain or placeholder)
   - **Redirect URI:** `https://localhost/oauth` (or any valid URI matching your app registration)
4. Scope: `QuickML.deployment.READ` (or `ZohoCatalyst.functions.ALL` if needed)
5. Note the **Client ID** and **Client Secret** from the generated app

---

## Step 2 — One-time OAuth Flow to Get Refresh Token

### 2a. Get Authorization Code

Open in browser (replace `{CLIENT_ID}` and `{REDIRECT_URI}`):

```
https://accounts.zoho.in/oauth/v2/auth?response_type=code&client_id={CLIENT_ID}&scope=QuickML.deployment.READ&redirect_uri={REDIRECT_URI}&access_type=offline&prompt=consent
```

User approves → browser redirects to `{REDIRECT_URI}?code={CODE}&location=in&accounts-server=https://accounts.zoho.in`

Copy the `code` value from the URL (valid for 2 minutes).

### 2b. Exchange Code for Tokens

```bash
curl -X POST "https://accounts.zoho.in/oauth/v2/token" \
  -d "client_id={CLIENT_ID}" \
  -d "client_secret={CLIENT_SECRET}" \
  -d "grant_type=authorization_code" \
  -d "code={CODE}" \
  -d "redirect_uri={REDIRECT_URI}"
```

Response:
```json
{
  "access_token": "1000.xxxx...",
  "refresh_token": "1000.yyyy...",
  "api_domain": "https://api.zoho.in",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Save the `refresh_token` — it never expires unless explicitly revoked.

---

## Step 3 — Add Environment Variables in Console

For each of **classifier**, **nl_sql**, **rag**, **pipeline**:

| Key | Value | Example |
|-----|-------|---------|
| `QUICKML_CLIENT_ID` | Client ID from Step 1 | `1000.GMB0YULZHJK411284S8I5GZ4CHUEX0` |
| `QUICKML_CLIENT_SECRET` | Client Secret from Step 1 | `122c324d3496d5d777ceeebc129470715fbb856b7` |
| `QUICKML_REFRESH_TOKEN` | Refresh token from Step 2b | `1000.18e983526f0ca8575ea9c53b0cd5bb58.1bd83a6f2e22c3a7e1309d96ae439cc1` |

Set via: **Catalyst Console → Functions → {name} → Environment Variables**.

---

## Step 4 — Update Function Code

Replace `QUICKML_TOKEN` logic in `callQuickML()` with auto-refresh in all 4 functions.

### 4a. Auto-refresh helper

```javascript
const TOKEN_CACHE_KEY = 'quickml_access_token';
const ACCOUNTS_URL = 'https://accounts.zoho.in';
const CLIENT_ID = process.env.QUICKML_CLIENT_ID;
const CLIENT_SECRET = process.env.QUICKML_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.QUICKML_REFRESH_TOKEN;

async function getQuickMLToken(app) {
  // Try Cache first
  if (app) {
    try {
      const cached = await app.cache().segment('token').getValue(TOKEN_CACHE_KEY);
      if (cached) return cached;
    } catch { /* cache unavailable — fall through */ }
  }

  // No cached token — refresh via OAuth
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: REFRESH_TOKEN,
  });

  const response = await fetch(`${ACCOUNTS_URL}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) throw new Error(`OAuth refresh failed: ${response.status}`);

  const data = await response.json();
  const token = data.access_token;

  // Cache with 55min TTL (tokens expire in 60min)
  if (app && token) {
    try {
      await app.cache().segment('token').put(TOKEN_CACHE_KEY, token, 55);
    } catch { /* cache unavailable — ignore */ }
  }

  return token;
}
```

### 4b. Update `callQuickML`

**Before:**
```javascript
const token = process.env.QUICKML_TOKEN;
```

**After:**
```javascript
const token = await getQuickMLToken(app);
```

Also add `app` parameter to `callQuickML(app, prompt, options)` to pass the Catalyst SDK instance for Cache access.

### 4c. Files to modify

| File | Change |
|------|--------|
| `functions/classifier/index.js` | Add `getQuickMLToken()`, update `callQuickML()` signature, change token resolution |
| `functions/nl_sql/index.js` | Same |
| `functions/rag/index.js` | Same |
| `functions/pipeline/index.js` | Same |

---

## Step 5 — Deploy & Test

```bash
catalyst deploy --only "functions:classifier,functions:nl_sql,functions:rag,functions:pipeline"
```

Then re-add env vars in Console (deploy wipes them).

Test:
```bash
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"count of cases in Bengaluru Urban","employee_id":1}'
```

Wait 1 hour and test again — should still work without any manual token refresh.

---

## Rollback

If the migration fails, re-add the old `QUICKML_TOKEN` env var in Console. The code will need to have the old token path as fallback — or revert to the previous commit.

---

## References

- [Zoho Server-based Apps Overview](https://www.zoho.com/accounts/protocol/oauth/web-server-applications.html)
- [Get Authorization Code](https://www.zoho.com/accounts/protocol/oauth/web-server-applications.html#Getauthorizationcode)
- [Get Access Token](https://www.zoho.com/accounts/protocol/oauth/web-server-applications.html#Getaccesstoken)
- [Refresh Access Token](https://www.zoho.com/accounts/protocol/oauth/web-server-applications.html#Refreshaccesstoken)
