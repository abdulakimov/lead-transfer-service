# Customer Onboarding: Facebook Lead Ads -> Bitrix24

This checklist is for onboarding a real customer tenant safely.

## 1) Required Customer Inputs
Collect these before configuration:
- Tenant user email and name (for account creation)
- Facebook Page ID (`source_page_id`)
- Facebook Page Access Token (long-lived)
- Facebook Instant Form ID (`source_form_id`) if customer wants form-specific routing
- Bitrix24 incoming webhook URL (`https://<domain>.bitrix24.<tld>/rest/<user>/<token>/`)
- Optional Telegram chat ID for notifications

Do not store or share raw secrets outside secure channels.

## 2) Meta-side Setup Checklist
1. Meta app permissions must be granted for the app/token:
- `pages_show_list`
- `leads_retrieval`
- `pages_read_engagement`
- `pages_manage_metadata`
- `pages_manage_ads` (needed for form/test lead tooling)

2. Webhook configuration:
- Callback URL: `https://<your-public-host>/webhooks/facebook`
- Verify token: exact value of server `FB_VERIFY_TOKEN`
- Subscribe to field: `leadgen`

3. Page subscription:
- Ensure the target Facebook Page is subscribed to the app/webhook.

4. Form confirmation:
- Confirm the expected Instant Form exists and is active.
- If multiple forms exist, keep the exact `form_id` for integration.

## 3) CRM-side Setup Checklist (Bitrix24)
1. Create/confirm incoming webhook in Bitrix24.
2. Copy webhook URL and validate format:
- `https://<domain>.bitrix24.<tld>/rest/<user>/<token>/`
3. Ensure webhook user has permissions to:
- find duplicates
- create leads
- create contacts (if flow needs it)

## 4) Integration Creation Payload Example
Use `POST /api/integrations` with authenticated user token.

```json
{
  "name": "Customer A - FB Main Form",
  "source_type": "facebook",
  "source_page_id": "<PAGE_ID>",
  "source_page_access_token": "<PAGE_ACCESS_TOKEN>",
  "source_form_id": "<FORM_ID_OR_NULL>",
  "dest_type": "bitrix24",
  "dest_credentials": "https://<domain>.bitrix24.<tld>/rest/<user>/<token>/",
  "field_mapping": {},
  "notify_telegram_chat_id": null,
  "dedup_enabled": true,
  "dedup_field": "phone"
}
```

## 5) Run Preflight Before Go-live
Call:
- `GET /api/integrations/:id/preflight`

Expected outcome:
- `overall_status: ready` (or `partial` with accepted warning)
- no blocking actionable errors

Preflight response includes:
- `overall_status`
- `checks`
- `summary`
- `next_step`

Preflight checks include:
- source field presence
- encrypted credential decryptability
- page/form coherence
- webhook env presence
- PostgreSQL/Redis reachability
- CRM adapter readiness

## 6) Common Failure Cases
- `401 Imzo tekshiruvi muvaffaqiyatsiz`
Cause: webhook signature mismatch or wrong app secret.
Action: verify `FB_APP_SECRET` and callback payload integrity.

- Preflight `source_page_id kiritilmagan`
Cause: integration missing page ID.
Action: set correct page ID.

- Preflight Redis/Postgres dependency fail
Cause: infrastructure unavailable.
Action: restore service health before live traffic.

- Worker Graph API auth error (`Facebook autentifikatsiya xatosi`)
Cause: page token expired/invalid or missing permissions.
Action: rotate token and verify permissions.

- CRM delivery error
Cause: Bitrix webhook invalid/insufficient permissions.
Action: validate webhook URL and Bitrix API permissions.

## 7) Go-live Checklist
1. Integration created and active.
2. `GET /api/integrations/:id/preflight` returns `ready` (or accepted `partial`).
3. `POST /api/integrations/:id/test` succeeds.
4. Meta webhook verification challenge succeeds.
5. Real Meta test lead submitted from target form.
6. Lead lifecycle confirmed:
- webhook accepted
- queue processed
- lead status `delivered`
- Bitrix lead created

## 8) Rollback / Disable Procedure
Fast disable options:
1. Disable integration:
- `POST /api/integrations/:id/toggle`

2. Remove webhook subscription in Meta (if needed).

3. If token leak suspected:
- rotate Facebook page access token
- rotate Bitrix webhook token
- update integration credentials

4. Re-run preflight before re-enabling traffic.

