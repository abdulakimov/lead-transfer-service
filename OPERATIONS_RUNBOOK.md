# Operations Runbook

This runbook is for operators/admins to validate tenant readiness and triage incidents.

## 1) Pre-Go-Live Tenant Verification
For each tenant integration:
1. Get integration details:
- `GET /api/integrations/:id`

2. Run readiness preflight:
- `GET /api/integrations/:id/preflight`
- Interpret readiness:
- `overall_status=ready`: go-live candidate
- `overall_status=partial`: go-live only with accepted warnings
- `overall_status=failed`: block go-live until fail checks fixed

3. Validate CRM path:
- `POST /api/integrations/:id/test`

4. Confirm Meta webhook callback configured to:
- `https://<public-host>/webhooks/facebook`

5. Confirm lead pipeline after real test lead:
- `GET /api/leads?integration_id=<id>&limit=20`

## 2) How to Inspect Logs
Useful log markers:
- `[integration:preflight]` preflight summary
- `[facebook:webhook]` signature/ingestion flow
- `[lead-worker]` fetch + CRM delivery stages

Key questions logs should answer:
- webhook accepted or rejected?
- which integration was selected?
- did Graph lead fetch succeed?
- did CRM delivery succeed?

Never expose raw tokens in logs or screenshots.

## 3) Safe Replay / Testing
Use these safe methods:
1. Non-destructive connectivity test:
- `POST /api/integrations/:id/test`

2. Signed webhook local smoke (fake leadgen id):
- POST signed payload to `/webhooks/facebook`
- expect `qabul qilindi`
- worker should attempt Graph fetch

3. Real E2E:
- submit Meta test lead via Instant Form tools
- verify lead reaches `delivered`

Avoid replaying real customer payloads with sensitive PII unless required.

## 4) Failure Classification Guide

### A) Meta permission issue
Signals:
- Graph API returns permission errors (OAuth/code 200, etc.)
- form list/test lead endpoints unavailable
Actions:
- verify `leads_retrieval`, `pages_manage_metadata`, `pages_manage_ads`, related scopes
- confirm app review/approval where required

### B) Page/Form misconfiguration
Signals:
- webhook received but integration not found for page/form
- wrong integration selected for multi-form setup
Actions:
- verify `source_page_id`
- verify `source_form_id` (if used)
- keep only intended active integration for given route scope

### C) Graph fetch issue
Signals:
- worker errors during fetch stage
- lead moves to `failed`/`dlq` with Facebook API error
Actions:
- rotate page token
- validate token scopes and page access
- verify `source_page_access_token` saved correctly

### D) Queue/worker issue
Signals:
- webhook accepted but no processing movement
- lead stuck in `pending`
Actions:
- run preflight and check `deps.redis`/`deps.postgres`
- verify worker process is running
- inspect Redis health

### E) CRM delivery issue
Signals:
- fetch succeeds but delivery fails
- `last_error` contains Bitrix/AmoCRM response
Actions:
- verify CRM credentials/webhook URL
- validate destination-side API permissions
- run `POST /api/integrations/:id/test`

### F) Credentials/decryption issue
Signals:
- preflight fails on `secrets.source_page_access_token` or `secrets.dest_credentials`
- worker reports auth/adapter issues immediately after integration load
Actions:
- re-save integration credentials via API/UI
- verify `ENCRYPTION_KEY` is correct for current environment data
- rotate compromised credentials if exposure is suspected

## 5) Triage Command Snippets
Assuming access token already obtained.

Preflight:
```bash
curl -s "http://127.0.0.1:3000/api/integrations/<INTEGRATION_ID>/preflight" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

Integration test:
```bash
curl -s -X POST "http://127.0.0.1:3000/api/integrations/<INTEGRATION_ID>/test" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

Lead status inspection:
```bash
curl -s "http://127.0.0.1:3000/api/leads?integration_id=<INTEGRATION_ID>&limit=20" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## 6) Incident Containment
If onboarding/live traffic is unstable:
1. Disable integration:
- `POST /api/integrations/:id/toggle`

2. Keep evidence:
- preflight output
- lead status and `last_error`
- relevant log lines

3. Fix root cause and re-run preflight before enabling.
