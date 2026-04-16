# Facebook Lead Ads E2E Test Guide

This guide validates the currently implemented production path without changing architecture:

1. Meta sends `leadgen` webhook
2. App verifies `X-Hub-Signature-256`
3. Lead is enqueued and worker fetches lead data from Graph API
4. Lead is delivered to Bitrix24

## Implemented webhook routes (current code)
Mounted base route:
- `POST /webhooks/facebook`
- `GET /webhooks/facebook`

Alias route (also accepted):
- `POST /webhooks/facebook/webhook`
- `GET /webhooks/facebook/webhook`

Use one canonical callback URL in Meta to avoid confusion. Recommended: `https://<public-host>/webhooks/facebook`.

## Required environment variables
Required by app runtime:
- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `REDIS_URL`
- `FB_APP_ID`
- `FB_APP_SECRET`
- `FB_VERIFY_TOKEN`
- `ENCRYPTION_KEY` (32-byte hex)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `TELEGRAM_BOT_TOKEN` (optional but validated as string)

Useful for setup automation:
- `FB_PAGE_ACCESS_TOKEN` (not runtime-required directly, but used to create integration payload)

## Local verification commands
Run from repo root.

### 1) Infrastructure + migrations
```bash
docker compose up -d
npm run db:migrate
```

### 2) Quality gate
```bash
npm run typecheck
npm run test
```

### 3) Verify webhook verification endpoint
Replace `<VERIFY_TOKEN>`.

```bash
curl -i "http://127.0.0.1:3000/webhooks/facebook?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=abc123"
```
Expected:
- HTTP `200`
- Body `abc123`

### 4) Signed webhook smoke test (local)
This validates signature verification + enqueue path.

PowerShell example:
```powershell
$payload='{"object":"page","entry":[{"id":"<PAGE_ID>","changes":[{"field":"leadgen","value":{"leadgen_id":"e2e_fake_123","form_id":"manual_form","created_time":1700000000}}]}]}'
$secret='<FB_APP_SECRET>'
$hmac=[System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
$sig='sha256=' + (($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload)) | ForEach-Object { $_.ToString('x2') }) -join '')
curl.exe -i -X POST "http://127.0.0.1:3000/webhooks/facebook" -H "Content-Type: application/json" -H "x-hub-signature-256: $sig" --data-raw "$payload"
```
Expected immediate response:
- HTTP `200`
- JSON body with `status: qabul qilindi`

## Meta-side manual steps (real Lead Ads)

### A) App permissions and access
Ensure token/user has these permissions approved and granted:
- `pages_show_list`
- `leads_retrieval`
- `pages_read_engagement`
- `pages_manage_metadata`
- `pages_manage_ads` (required to access lead forms/test leads endpoints)

### B) Configure webhook callback
1. Open Meta for Developers -> your app -> Webhooks -> Page.
2. Set callback URL to:
   - `https://<public-host>/webhooks/facebook`
3. Set verify token to exact `FB_VERIFY_TOKEN` value.
4. Subscribe to `leadgen` field.
5. Add/subscribe your target Facebook Page to the app.

### C) Create integration in service
Create one active integration with:
- `source_page_id`: target Page ID
- `source_page_access_token`: page long-lived token
- `source_form_id`: optional. If provided, webhook resolution now prefers exact form match and falls back to page-level integration (`source_form_id IS NULL`).
- `dest_type`: `bitrix24`
- `dest_credentials`: Bitrix incoming webhook URL

### D) Create and submit a real test lead
Option 1 (UI):
1. In Meta Business Suite / Ads Manager, open the target Instant Form.
2. Use the built-in test lead submission flow.
3. Confirm submission appears in form testing tools.

Option 2 (Graph API, requires `pages_manage_ads`):
1. Get `leadgen_form_id` from page forms.
2. Create test lead via form test-leads endpoint.

## Expected evidence for PASS
After submitting a real test lead:
1. Webhook endpoint responds `200` quickly.
2. DB `leads` row appears for `leadgen_id` with initial `pending`/`processing`.
3. Worker fetches full lead from Graph API.
4. Bitrix24 receives lead and returns CRM lead ID.
5. DB status updates to `delivered` with `delivered_at` set.
6. Optional Telegram notification is sent if configured.

## Known blockers observed in this environment
- API call to list page lead forms failed with permission error:
  - `(#200) Requires pages_manage_ads permission to manage the object`
- A fully real Meta-generated `leadgen_id` could not be generated here due missing form access permission.

## Final pass/fail status from this run
- Route verification (`GET /webhooks/facebook` and `/webhooks/facebook/webhook`): PASS
- Signed webhook acceptance (`POST /webhooks/facebook`): PASS
- Integration resolution correctness (same page, form-specific vs fallback): PASS
- Worker lead fetch invocation: PASS (confirmed by DB `last_error` coming from Graph API fetch for fake lead ID)
- Bitrix delivery capability: PASS via `POST /api/integrations/:id/test`
- Real Meta Lead Ads webhook-to-delivery with actual form submission: BLOCKED (missing `pages_manage_ads` for form/test lead operations)

## Exact API command sequence (curl)
Assumes server is running locally and replace placeholders.

1. Register user:
```bash
curl -s -X POST http://127.0.0.1:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"e2e_user@example.com","password":"Password123!","name":"E2E User"}'
```

2. Create integration (use access token from step 1 response):
```bash
curl -s -X POST http://127.0.0.1:3000/api/integrations \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"FB E2E",
    "source_type":"facebook",
    "source_page_id":"<PAGE_ID>",
    "source_page_access_token":"<PAGE_ACCESS_TOKEN>",
    "source_form_id":"<FORM_ID_OR_NULL>",
    "dest_type":"bitrix24",
    "dest_credentials":"https://<your>.bitrix24.ru/rest/<user>/<token>/",
    "field_mapping":{},
    "dedup_enabled":true,
    "dedup_field":"phone"
  }'
```

3. Verify Bitrix connectivity through integration test:
```bash
curl -s -X POST http://127.0.0.1:3000/api/integrations/<INTEGRATION_ID>/test \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

4. Submit signed webhook (local smoke):
```bash
curl -i -X POST http://127.0.0.1:3000/webhooks/facebook \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: <COMPUTED_HMAC>" \
  --data-raw '{"object":"page","entry":[{"id":"<PAGE_ID>","changes":[{"field":"leadgen","value":{"leadgen_id":"<LEADGEN_ID>","form_id":"<FORM_ID>","created_time":1700000000}}]}]}'
```

5. Inspect processed leads:
```bash
curl -s "http://127.0.0.1:3000/api/leads?integration_id=<INTEGRATION_ID>&limit=20" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## 2026-04-15 Regression Notes

### Code-side readiness updates
- Removed Meta Pixel/CAPI runtime modules and UI paths.
- Enforced strict Facebook OAuth production guards (`config_id`, required scopes, https redirect).
- Workflow default trigger migrated to lead bridge (`lead.received`).

### Manual Facebook E2E checklist (post-deploy)
1. `/api/integrations/facebook/oauth/init` returns auth URL with strict scopes and `config_id`.
2. OAuth callback stores pages/forms successfully.
3. Facebook webhook `POST /webhooks/facebook` receives leadgen event.
4. Lead worker fetches full lead and delivers to selected CRM.
5. Lead status reaches `delivered`; run/steps visible in workflows/runs.
