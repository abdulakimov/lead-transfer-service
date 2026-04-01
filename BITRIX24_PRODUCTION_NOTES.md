# Bitrix24 Production Notes

## Scope

This document defines practical rules for stable Bitrix24 lead delivery in this platform.

## Current adapter behavior

- Lead creation method: `crm.lead.add.json`
- Duplicate check method: `crm.duplicate.findbycomm.json`
- Transport style: incoming webhook URL per integration (`https://<portal>/rest/<user>/<token>/...`)
- Mapped data is stored in `leads.mapped_data` together with returned Bitrix lead ID.

## Critical operational checks

1. Webhook URL correctness
- Must point to the exact target portal domain.
- Must have valid REST user + token segment.
- Must be normalized with trailing slash before appending REST method.

2. CRM visibility mode
- Verify Bitrix account is in a mode where Leads are visible/used.
- Confirm operator is checking the same portal as configured in integration credentials.

3. Field mapping validity
- `PHONE` and `EMAIL` require expected array shape in payload.
- Custom fields must use valid Bitrix field codes.
- Keep source-to-destination mapping explicit and versioned.

4. Duplicate behavior
- Platform-level dedup and Bitrix-level duplicate controls can both affect outcomes.
- If lead seems "missing", check whether duplicate rules merged/suppressed records.

5. Error classification
- Authentication/permission failures: non-retryable until credentials are fixed.
- 5xx/network/transient failures: retryable with backoff.
- Method/field validation errors: non-retryable until mapping/payload is corrected.

## Recommended hardening backlog

- Add adapter diagnostics endpoint:
  - ping CRM method access
  - resolve and display masked portal host + REST user ID.
- Add delivery trace fields:
  - request correlation ID
  - Bitrix response body fingerprint
  - method name used for each attempt.
- Add integration test suite (mocked fetch) for:
  - `crm.lead.add` success and malformed responses
  - `crm.duplicate.findbycomm` duplicate and non-duplicate paths
  - retryability mapping per error class.

## Troubleshooting checklist (when "delivered" but not visible)

1. Confirm `leads.mapped_data.crmLeadId` exists for the lead in DB.
2. Verify Bitrix portal in credentials matches the portal being viewed in UI.
3. Search Bitrix by returned lead ID directly.
4. Check Bitrix duplicate/merge automation settings.
5. Validate user permissions and CRM mode for the viewer account.

## Change policy

- Do not change delivery method (`crm.lead.add`) without migration plan.
- Do not broaden retries for permanent Bitrix validation/auth errors.
- Keep Bitrix-specific behavior isolated in adapter/service layer.
