# STATUS REPORT

## 1) Completed Modules (confirmed in repo)
- Project scaffold and runtime setup: TypeScript, Express, Docker, migrations runner, queue/worker wiring.
- Auth: register/login/refresh/logout/logout-all/me with JWT access token + hashed refresh tokens.
- Integrations API: create/list/get/update/delete/toggle/test endpoints.
- Encryption: AES-based encrypt/decrypt used for CRM credentials and Facebook page access token storage.
- Facebook webhook signature verification middleware (HMAC SHA-256).
- Facebook lead fetch service (`GET /{leadgen_id}` from Graph API).
- CRM abstraction (`CrmAdapter`) + Bitrix24 adapter + AmoCRM adapter.
- Lead processor worker with retry backoff and DLQ behavior.
- Telegram notification service integrated into worker (on successful delivery path).
- Unit tests: all current unit tests pass.

## 2) Incomplete / Partially Implemented Modules
- Real Facebook Lead Ads full E2E (webhook from Facebook -> queue -> CRM) not yet fully validated in this repo runbook.
- `POST /api/test/simulate-lead` endpoint is not present.
- `src/services/mock-crm.ts` is not present.
- `PUT /api/integrations/:id/telegram` dedicated endpoint is not present (chat_id is handled inside integration create/update payload instead).
- `GET /api/leads/stats` path in plan differs from implemented `GET /api/leads/stats/summary`.
- `TESTING.md` is not present.
- `test:e2e:local` script is not present.

## 3) Current Webhook Route Behavior
- App mount in `src/index.ts`:
  - `app.use('/webhooks/facebook', facebookWebhook)`
- Router handlers in `src/webhooks/facebook.ts`:
  - `GET /` and `GET /webhook` (verification)
  - `POST /` and `POST /webhook` (signed lead intake)
- Effective public paths:
  - `GET /webhooks/facebook`
  - `GET /webhooks/facebook/webhook`
  - `POST /webhooks/facebook`
  - `POST /webhooks/facebook/webhook`
- There is **no** `/webhooks/facebook/:integrationId` route.

## 4) Integration Resolution in Webhook
- Current webhook resolves integration by **Facebook Page ID**, not by integration ID.
- Query used:
  - `SELECT id FROM integrations WHERE source_page_id = $1 AND active = true LIMIT 1`
- So resolution is page-based (`entry.id`), first active match only.

## 5) Source Fields Expected and Storage
The code expects these integration source fields:
- `source_page_id`
- `source_page_access_token`
- `source_form_id`

Where and how they are stored:
- DB schema: `src/db/migrations/002_integrations.sql`
  - columns exist in `integrations` table.
- API input: `src/api/integrations.ts` create/update schemas include all 3 fields.
- Storage behavior:
  - `source_page_id`: stored as plain text.
  - `source_page_access_token`: encrypted before DB insert/update.
  - `source_form_id`: stored as plain text/nullable.
- Runtime usage:
  - `source_page_id` used by webhook integration lookup.
  - `source_page_access_token` decrypted in worker and used for Graph API fetch.
  - `source_form_id` currently stored but not used in webhook filtering/dispatch logic.

## 6) Environment Variables Actually Used
Validated by `src/config/env.ts`:
- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `REDIS_URL`
- `FB_APP_ID`
- `FB_APP_SECRET`
- `FB_VERIFY_TOKEN`
- `ENCRYPTION_KEY`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `TELEGRAM_BOT_TOKEN`

Runtime usage notes:
- `FB_APP_SECRET` is used for webhook signature validation.
- `FB_VERIFY_TOKEN` is used for GET verification challenge.
- `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, JWT vars are actively used.
- `FB_APP_ID` is validated but not materially used in runtime flows shown.
- `.env.example` currently contains a malformed standalone Bitrix URL line (not key=value).

## 7) Test Status (current run)
Command: `npm run test`
- Test files: 7 passed, 0 failed
- Tests: 47 passed, 0 failed

## 8) Risks / Inconsistencies
- Webhook path ambiguity: both `/webhooks/facebook` and `/webhooks/facebook/webhook` are accepted; external config/docs must pick one canonical URL.
- Plan mismatch: plan says `/api/facebook/webhook`, implementation uses `/webhooks/facebook...`.
- Integration selection risk: webhook uses `source_page_id` + `LIMIT 1`; multiple integrations on one page can route unpredictably.
- `source_form_id` is persisted but not used in routing/filtering.
- Leads API has a clear SQL bug risk:
  - `GET /api/leads/:id` and `POST /api/leads/:id/retry` filter by `l.user_id`, but `leads` table has no `user_id` column.
- `LEAD_STATUS` constants omit `duplicate`, but worker/queries use `duplicate` status literal.
- `DELETE /api/integrations/:id` is hard delete, while plan says soft delete.
- Telegram notify scope mismatch: implemented on delivered lead path only, not explicit new-received and failed/DLQ notifications from plan.

## 9) Exact Next Action to Finish Facebook E2E Testing
1. Choose a single canonical webhook URL and configure Facebook app callback to it (recommended: `POST/GET /webhooks/facebook`).
2. Create or update one active integration with:
   - correct `source_page_id` (the subscribed FB page ID)
   - valid long-lived `source_page_access_token`
   - optional `source_form_id` (currently not enforced by webhook routing)
3. Confirm Facebook subscription/verification succeeds via GET challenge.
4. Submit a real Lead Ads test lead in Meta.
5. Verify pipeline in order:
   - webhook receives and inserts `leads` row (`pending`)
   - queue job created (`lead-{leadgen_id}`)
   - worker fetches lead from Graph API and sends to Bitrix
   - lead status transitions to `delivered` (or captures failure reason)
6. Capture request/response evidence and DB row snapshots for one successful and one failure case.

## 10) 2026-03-28 Incident Fixes (Redis/Postgres/Facebook E2E)
What was inspected:
- `src/webhooks/facebook.ts` integration lookup and queue enqueue path.
- `src/queue/lead-queue.ts` deterministic `jobId` behavior.
- `src/services/facebook.ts` Graph API field selection.
- `src/workers/lead-processor.ts` Facebook fetch + delivery path.
- DB rows for `integrations` and `leads` related to leadgen `1322873516349392`.

What changed:
- Runtime ops:
  - Started Redis and Postgres containers and verified healthy.
  - Ran migrations.
  - Subscribed page `1056259887566576` to app for `leadgen` via Graph API (`success: true`).
  - Updated integration `20b89c62-cf94-44c3-9e7a-f443548a4880` with current page access token.
- Code fixes:
  - `src/api/leads.ts`: retry flow now removes existing BullMQ job `lead-{leadgen_id}` before re-enqueue.
  - `src/services/facebook.ts`: removed invalid Graph field `page_id` from lead fetch fields.
  - `src/workers/lead-processor.ts`: fallback `leadData.pageId` from job context when Graph response lacks page id.

Commands run:
- `docker compose up -d redis`
- `docker compose up -d postgres`
- `docker compose ps`
- `npm run db:migrate`
- Graph API calls for `/{page-id}/subscribed_apps` subscribe + verify
- `npm run typecheck`
- SQL checks/updates on `leads` and `integrations` (targeted rows only)
- API calls to `PUT /api/integrations/:id` and `POST /api/leads/:id/retry`

Outcomes:
- Webhook ingestion confirmed from Meta (real lead id received).
- Previous auth error `Application has been deleted` resolved by token refresh on integration.
- Previous Graph fetch error `(#100) Tried accessing nonexisting field (page_id)` resolved by field patch.
- Lead `1322873516349392` transitioned to `delivered`.

Remaining risks:
- Tokens shared in chat/session are exposed and must be rotated.
- Multiple active integrations on same `source_page_id` can still route to unintended integration if form constraints overlap.
- Facebook form test-lead API intermittently returned provider-side failure (`error_subcode=1892059`) during automation.

Next exact action:
1. Rotate Facebook page token and verify token.
2. Re-send one fresh Lead Ads test lead and confirm `delivered`.
3. Optionally add a guardrail test for retry path to prevent BullMQ duplicate job-id regression.

## 11) 2026-03-28 Phase-1 Hardening Follow-up
What was inspected:
- `src/index.ts` route wiring for auth and webhook surfaces.
- `src/webhooks/facebook.ts` route shape/canonical behavior.
- Retry path tests around deterministic BullMQ `jobId`.

What changed:
- Added in-memory rate limiter middleware:
  - `src/middleware/rate-limit.ts`
  - Applied to:
    - `/api/auth` (30 req/min per IP)
    - `/webhooks/facebook` (300 req/min per IP)
- Canonical webhook route policy clarified in runtime:
  - canonical path remains `/webhooks/facebook`
  - legacy `/webhooks/facebook/webhook` still works with deprecation warning log.
- Added regression tests:
  - `tests/unit/leads-retry.test.ts` (existing job removal + requeue path)
  - updated `tests/unit/webhook-handler.test.ts` with canonical root-path verification and POST coverage.

Commands run:
- `npm run typecheck`
- `npm test`

Outcomes:
- Typecheck passed.
- Tests passed: 8 files, 51 tests.
- Phase-1 hardening items advanced without breaking existing flows.

Remaining risks:
- In-memory rate limiting is single-process only; distributed limits still needed for multi-instance deployment.
- Legacy webhook path is still accepted for compatibility and should be removed in a planned deprecation window.

Next exact action:
1. Implement deterministic page+form precedence tests for webhook integration resolution.
2. Add persistent/distributed rate limit backend (Redis-based) for horizontal scaling.
3. Continue workflow-engine schema design (trigger/action/execution ledger) as next major milestone.

## 12) 2026-03-28 Page/Form Precedence Test Coverage
What was changed:
- Added `tests/unit/webhook-integration-resolution.test.ts` with explicit coverage for integration resolution precedence.

Covered cases:
1. Exact page+form resolution path (form-specific integration selected when `form_id` exists).
2. Fallback to page-level integration when exact form integration is absent.
3. Page-level preference path when webhook payload has no `form_id`.

Validation:
- `npm run typecheck` passed.
- `npm test` passed.
- Current totals: 9 test files, 54 tests passed.

Next exact action:
1. Add integration-level test data for multiple active integrations on same page to validate deterministic routing against real DB ordering assumptions.
2. Begin workflow engine persistence schema (workflow, version, execution, step logs).

## 13) Step 2 Completed — Workflow Persistence Schema
What changed:
- Added migration `005_workflow_engine.sql` introducing:
  - `workflows`
  - `workflow_versions`
  - `workflow_runs`
  - `workflow_steps`
- Added constraints/indexes for tenant filtering, publish/version semantics, run/step status tracking, and replay-safe step attempts.

Commands run:
- `npm run db:migrate`
- `docker compose exec postgres psql -U leadflow -d leadflow -c "\\dt"`
- `npm run typecheck`

Outcomes:
- Migration applied successfully.
- New workflow tables exist in DB.
- Typecheck passed.

Remaining risks:
- Runtime execution logic (step 3) is not implemented yet.
- API/service layer for creating workflow versions and runs is not added yet.

Next exact action:
1. (Pending your approval) implement step 3 minimal runtime: trigger -> action execution skeleton with `workflow_runs` + `workflow_steps` writes.

## 14) Step 3 Completed — Minimal Workflow Runtime Logging
What changed:
- Added workflow runtime service and integrated it into lead worker execution path.
- Each processed lead now attempts to write:
  - `workflow_runs` record
  - `workflow_steps` trigger/action records
  - status/error transitions on success/failure.

Files:
- `src/services/workflow-runtime.ts`
- `src/workers/lead-processor.ts`

Commands run:
- `npm run typecheck`
- `npm test`
- direct worker execution for lead `1931871874387190`
- SQL verification queries against `workflow_runs` and `workflow_steps`

Outcomes:
- Runtime logging is wired and persisted in DB.
- Failure-path logging confirmed with `error_data` in `workflow_steps`.

Remaining risks:
- Current Facebook page access token expired (`code=190`, `subcode=463`) and must be rotated for live runs.
- API endpoints/UI for workflow authoring and run browsing are not implemented yet.

Next exact action:
1. (Only after your approval) start Step 4: API/read models for workflow runs and step timelines.

## 15) Step 4 Completed — Workflow Observability API
What changed:
- Added new API router `src/api/workflows.ts` with endpoints:
  - `GET /api/workflows`
  - `GET /api/workflows/runs`
  - `GET /api/workflows/runs/:id`
- Mounted workflows router in `src/index.ts`.
- Added unit tests `tests/unit/workflows-api.test.ts`.

Commands run:
- `npm run typecheck`
- `npm test`

Outcomes:
- Workflow run timeline data is now queryable via API (run + steps).
- Tenant-scoped filtering enforced at SQL layer.
- Test suite remains green.

Current totals:
- 10 test files
- 57 tests passed

Next exact action:
1. (Pending your approval) start Step 5: workflow authoring/publish APIs and minimal trigger-action dispatch endpoint(s).

## 16) Step 5 Completed — Workflow Authoring and Dispatch API
What changed:
- Expanded `src/api/workflows.ts` with write endpoints:
  - `POST /api/workflows`
  - `POST /api/workflows/:id/versions`
  - `POST /api/workflows/:id/publish`
  - `POST /api/workflows/:id/dispatch`
- Maintained tenant ownership checks and validation.
- Updated unit tests in `tests/unit/workflows-api.test.ts`.

Commands run:
- `npm run typecheck`
- `npm test`

Outcomes:
- Workflow lifecycle now includes: create -> version -> publish -> dispatch (minimal).
- Read endpoints from Step 4 remain functional.
- Test suite passed.

Current totals:
- 10 test files
- 60 tests passed

Next exact action:
1. (Pending your approval) start Step 6: execute real action dispatch path from published workflow definition (instead of noop action) and persist per-step adapter outputs/errors.

## 17) Frontend Foundation Started
What changed:
- Added new app under `frontend/` (Next.js + TypeScript + Tailwind).
- Implemented first operator UI surfaces: login, dashboard, integrations, leads, workflows, runs.
- Connected UI to existing backend APIs via typed client.
- Added root package scripts for frontend dev/build/typecheck.

Commands run:
- `npm install` (in `frontend/`)
- `npm run build` (frontend)
- `npm run typecheck` (frontend)

Outcomes:
- Frontend scaffold builds successfully.
- TypeScript checks pass.
- Initial navigation and data views are ready for iterative UX upgrades.

Next exact action:
1. Add frontend data-fetching patterns with caching/error boundaries.
2. Build workflow create/version/publish/dispatch UI screens.
3. Add run detail page with full step payload/error viewer and retry controls.

## 18) 2026-03-28 Frontend Step-6 Completed (3 requested items)
What was inspected:
- frontend dashboard pages and API client wiring.
- backend workflow API contracts for create/version/publish/dispatch.

What changed:
- Added cache + query layer:
  - `frontend/lib/query-cache.ts`
  - `frontend/lib/use-api-query.ts`
- Added reusable UI error handling:
  - `frontend/components/query-boundary.tsx`
  - `frontend/app/(dashboard)/error.tsx`
  - `frontend/app/(dashboard)/loading.tsx`
- Added run detail payload explorer:
  - `frontend/app/(dashboard)/runs/[runId]/page.tsx`
- Updated dashboard pages to new fetching pattern:
  - `dashboard`, `integrations`, `leads`, `workflows`, `runs`
- Implemented workflows actions UI on `/workflows`:
  - create workflow
  - create version
  - publish version
  - manual dispatch
- Fixed browser-only token access for SSR safety:
  - `frontend/lib/session.ts`

Commands run:
- `npm run typecheck:frontend`
- `npm run build:frontend`

Outcomes:
- Requested 3 frontend items are implemented and wired to backend APIs.
- Production frontend build passes.
- Frontend typecheck passes.

Remaining risks:
- Next.js warns about multiple lockfiles in root/frontend.
- Next.js warns ESLint plugin migration hint for app router setup.

Next exact action:
1. Add retry/cancel actions on run detail page (if backend endpoints are added).
2. Add optimistic UI + toast notifications for workflow actions.
3. Start Step 6 backend: execute published workflow definitions with real action handlers (replace noop dispatch path).

## 19) Step 6 Completed — Real published workflow dispatch execution
What was inspected:
- `src/api/workflows.ts` dispatch path
- runtime helpers in `src/services/workflow-runtime.ts`
- CRM adapter/fetch-lead services

What changed:
- Added real dispatch runtime service:
  - `src/services/workflow-dispatch.ts`
- Dispatch endpoint now executes published workflow definition actions instead of noop:
  - `src/api/workflows.ts`
- Added/updated tests:
  - `tests/unit/workflow-dispatch.test.ts`
  - `tests/unit/workflows-api.test.ts`

Commands run:
- `npm run typecheck`
- `npm test`

Outcomes:
- Published workflow dispatch now:
  1. starts run
  2. fetches lead from Facebook
  3. executes CRM create_lead action(s) from definition
  4. writes per-step output or error
  5. finalizes run status
- Test suite passed.
- Current totals: 11 test files, 62 tests passed.

Remaining risks:
- Dispatch action support is intentionally narrow (`*.create_lead` only).
- Dispatch requires `source_config.integration_id` on workflow.

Next exact action:
1. Add dedicated retry/cancel endpoints for workflow runs.
2. Add richer definition schema validation for action params.
3. Add run idempotency guard by `trigger_event_id + workflow_version_id` if needed.

## 2026-03-28 — Frontend UI refresh (skill-driven)

- Applied `frontend-design` style system across auth + dashboard views.
- Added tokenized design foundation (`frontend/app/globals.css`) and normalized shared primitives.
- Updated all main dashboard pages to use consistent cards, tables, spacing, status tones, and headers.
- Validation: `frontend` typecheck passed.
- Build currently requires rerun in clean terminal due local `.next` lock/timeout in this session.

## 2026-03-28 — Iconization update

- Installed `lucide-react` in frontend.
- Applied a single icon system across nav, headers, placeholders, and auth highlights.
- Extended shared header component to accept optional icon slot.
- Validation: frontend typecheck passed.

## 2026-03-29 — Dashboard design refresh

- Applied new dashboard shell + component styling with the requested palette and Inter font.
- Updated sidebar, topbar, KPI cards, status pills, and dashboard composition to reference-inspired professional layout.
- Validation: frontend typecheck passed.

## 2026-03-29 — Integration logic step-up

- Added practical integration creation wizard flow in frontend (4-step modal).
- Enabled backend destination schema for both Bitrix24 and AmoCRM.
- Wired frontend save action to real `/api/integrations` create endpoint.
- Kept Google Sheets disabled at save level until adapter support is added.
- Validation: backend + frontend typecheck passed.

## 2026-03-29 — OAuth source connection enabled

- Implemented Facebook OAuth popup init/callback flow for integration source connect.
- Replaced manual source token entry in wizard step-1 with OAuth-driven profile/page/form selection.
- Added env support for explicit OAuth callback URI.
- Validation: backend + frontend typecheck passed.

## 14) 2026-03-29 CRM Field Mapping Builder (Bitrix24)
What was inspected:
- `src/api/integrations.ts` routes and existing integration create flow.
- `frontend/app/(dashboard)/integrations/page.tsx` wizard step-3/step-4 mapping UX.
- `frontend/lib/api.ts` client API surface.

What changed:
- Backend:
  - Added authenticated endpoint `POST /api/integrations/bitrix/fields`.
  - Endpoint validates `webhook_url`, calls `crm.lead.fields.json`, normalizes field metadata and returns:
    - `fields[]` (`code`, `title`, `type`, `required`, `multiple`)
    - `total`
- Frontend:
  - Added API client function `getBitrixLeadFields(...)` and type `BitrixLeadField`.
  - Replaced step-4 JSON mapping textarea with a mapping builder for Bitrix24:
    - add/remove mapping rows
    - source field selector (Facebook canonical fields)
    - destination field selector (loaded from Bitrix)
  - Step-3 now includes `Maydonlarni yuklash` button for Bitrix webhook URL.
  - Integration create payload now sends `field_mapping` built from mapping rows.

Commands run:
- `npm run typecheck` (backend)
- `npm run typecheck` (frontend)
- `npm test`

Outcomes:
- Backend typecheck passed.
- Frontend typecheck passed.
- Tests passed: 11 files, 62 tests.
- UI now supports CRM field discovery + source-to-destination mapping (Bitrix24 path).

Remaining risks:
- Current source field list is canonical/static; form-specific custom question discovery from Meta is not yet added.
- Mapping builder is currently enabled for Bitrix24 only; AmoCRM still uses default mapping behavior.

Next exact action:
1. Add Facebook form question discovery (`/{form_id}?fields=questions`) to surface custom source fields in mapping UI.
2. Add mapping builder parity for AmoCRM destination fields.
3. Add integration tests for `/api/integrations/bitrix/fields` success + invalid credential cases.

## 15) 2026-03-29 OAuth Popup Reliability Fix (state polling)
What was inspected:
- Frontend OAuth popup flow in `frontend/app/(dashboard)/integrations/page.tsx`.
- Backend OAuth init/callback handlers in `src/api/integrations.ts`.

What changed:
- Switched frontend OAuth completion flow from popup `postMessage` dependency to backend state polling.
- `GET /api/integrations/facebook/oauth/init` now also returns `state` and stores pending OAuth state in memory.
- Added `GET /api/integrations/facebook/oauth/result?state=...` (auth-protected) for polling OAuth completion.
- Callback now writes success/error result into in-memory state store keyed by OAuth `state`.
- Existing popup callback HTML was kept for compatibility.

Commands run:
- `npm run typecheck` (backend)
- `npm run typecheck` (frontend)

Outcomes:
- Typecheck passed on both backend and frontend.
- OAuth flow no longer depends on fragile browser popup opener messaging.

Remaining risks:
- OAuth state store is in-memory (single-process); process restart during OAuth will lose pending state.

Next exact action:
1. Validate end-to-end on user environment (first-attempt success expected).
2. If multi-instance deployment is required, move OAuth state storage from memory to Redis.

## 16) 2026-03-29 Dynamic Facebook Source Fields for Mapping
What was inspected:
- Integration wizard mapping source-field list in `frontend/app/(dashboard)/integrations/page.tsx`.
- OAuth + integrations routes in `src/api/integrations.ts`.

What changed:
- Backend:
  - Added authenticated endpoint `POST /api/integrations/facebook/form-fields`.
  - Endpoint fetches `/{form_id}?fields=questions` from Graph using selected page access token.
  - Returns normalized fields: `key`, `label`, `type`.
- Frontend:
  - Added API client `getFacebookFormFields(...)` and type `FacebookSourceField`.
  - Removed static Facebook source field list.
  - Dynamic source field list now loads when a specific form is selected.
  - Added guards so Bitrix mapping cannot proceed/save unless:
    - specific form is selected (not Any form),
    - Facebook source fields loaded,
    - Bitrix fields loaded,
    - mapping rows are complete.

Commands run:
- `npm run typecheck` (backend)
- `npm run typecheck` (frontend)

Outcomes:
- Dynamic source fields are now driven by selected Facebook form questions.
- Typecheck passed on both backend and frontend.

## 17) 2026-03-29 Google Sheets Destination Added
What changed:
- Added `google_sheets` destination support end-to-end.
- Backend adapter factory now supports `dest_type='google_sheets'`.
- New adapter: `src/services/adapters/google-sheets-adapter.ts`.
  - Uses service-account JWT flow to obtain Google OAuth access token.
  - Appends lead rows to Google Sheets API (`spreadsheets.values.append`).
- Integrations API schema now accepts `dest_type` in:
  - `bitrix24 | amocrm | google_sheets`.
- Frontend integration wizard now allows Google Sheets selection and credentials input (JSON).

Validation:
- `npm run typecheck` (backend/frontend) passed.
- `npm test` passed (11 files, 62 tests).

Operational note:
- Google Sheet must be shared with service account email (`client_email`) with Editor access.

## 18) 2026-03-29 Google Sheets OAuth Flow Added
What changed:
- Added Google OAuth env vars:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_REDIRECT_URI`
- Added Google OAuth API routes:
  - `GET /api/integrations/google/oauth/init`
  - `GET /api/integrations/google/oauth/callback` (public)
  - `GET /api/integrations/google/oauth/result?state=...`
- Frontend wizard now supports OAuth-based Google account connection and spreadsheet selection.
- Google Sheets adapter now supports two credential modes:
  - Service account JSON (existing)
  - OAuth mode with refresh token.

Validation:
- `npm run typecheck` (backend/frontend) passed.
- `npm test` passed (11 files, 62 tests).

## 19) 2026-03-29 Ulanishlar (Connections) Module + Reusable Profiles
What changed:
- Added persistent `connections` storage and API.
- New migration: `006_connections.sql` (user-scoped provider profiles with encrypted credentials).
- New backend route module: `src/api/connections.ts`.
  - `GET /api/connections`
  - `GET /api/connections/:id`
  - `POST /api/connections` (upsert by user+provider+external_id)
  - `DELETE /api/connections/:id`
- Mounted connections API in server: `src/index.ts`.
- Frontend nav updated with dedicated `Ulanishlar` entry.
- New frontend page: `frontend/app/(dashboard)/connections/page.tsx`.
  - Connect Facebook/Google once via OAuth
  - Save reusable profile
  - List and delete saved profiles
- Integrations wizard now consumes saved connections instead of forcing OAuth every time.
  - Source step: choose saved Facebook connection -> page -> form
  - Google destination: choose saved Google connection -> spreadsheet
- Integration create API extended to accept connection-based params:
  - `source_connection_id`
  - `dest_connection_id`
  - `dest_resource_id`
  - `dest_sheet_name`
- Backend integration create flow now resolves tokens from stored connections when connection IDs are provided.
- Facebook form fields endpoint now supports connection-based token resolution (`connection_id + page_id`) so frontend never needs raw page token.

Validation:
- `npm run typecheck` (backend/frontend) passed.
- `npm test` passed (11 files, 62 tests).

Operational step required:
- Run DB migrations to create `connections` table:
  - `npm run db:migrate`

## 20) 2026-03-29 Runtime fix: `relation "connections" does not exist`
Issue:
- Backend returned 500 on `/api/connections` because DB migration `006_connections.sql` had not been applied.

Action:
- Executed `npm run db:migrate`.
- Migration output confirmed:
  - `Migratsiya: 006_connections.sql`
  - `Barcha migratsiyalar muvaffaqiyatli bajarildi`

Result:
- `connections` table is now created.
- Connections API can run without the missing-relation crash.

## 21) 2026-03-29 Frontend: Lucide icon pack + Connections UX refresh
What changed:
- Frontend icon system switched from `@heroicons/react` to `lucide-react`.
- Updated navigation icons, including `Ulanishlar` menu icon (`Link2`) and topbar/support icons.
- Replaced heroicons usage across dashboard pages and auth page with lucide equivalents.
- Redesigned `/connections` page from basic table to structured card-list UX:
  - clear section header with identity icon
  - provider-based cards (Facebook, Google)
  - connected badge/status presentation
  - per-profile list rows with timestamp and delete action
  - cleaner empty-state and spacing rhythm

Validation:
- `cd frontend && npm run typecheck` passed.

## 22) 2026-03-29 Integrations wizard: create Google Sheets in-place
What changed:
- Added backend endpoint to create a new Google Spreadsheet directly from integration wizard:
  - `POST /api/integrations/google/spreadsheets`
- Endpoint behavior:
  - resolves Google refresh token from selected saved connection
  - creates spreadsheet (custom or default name)
  - creates first sheet/list (custom or default name)
  - writes headers based on selected mode:
    - `default` (Meta form field-based)
    - `custom` (user-provided)
    - `none`
  - updates `connections.meta.spreadsheets` with newly created spreadsheet for reuse
- Frontend wizard step 3 (`Google Sheets`) updated:
  - mode toggle: `Mavjudni tanlash` / `Yangi yaratish`
  - in-place fields:
    - spreadsheet name
    - list/sheet name
    - column title mode (default/custom/none)
    - custom title input
  - create action sets created spreadsheet as selected destination automatically.

Validation:
- `npm run typecheck` (backend) passed.
- `cd frontend && npm run typecheck` passed.
- `npm test` passed (11 files, 62 tests).

## 23) 2026-03-29 Integrations wizard UI upgrade: custom dropdowns + destination cards
What changed:
- Removed key native HTML select usage in wizard steps where UX looked default/browser-like.
- Added reusable custom dropdown UI in integrations wizard (`UiDropdown`) for:
  - Facebook ulanish
  - Sahifa
  - Forma
  - Google ulanish
  - Spreadsheet
  - Google header mode
- Replaced destination system native select with **brand-style selectable cards**:
  - Bitrix24 CRM
  - AmoCRM
  - Google Sheets
- Destination card selection keeps existing state-reset logic (safe transition across target types).

Validation:
- `cd frontend && npm run typecheck` passed.

## 24) 2026-03-29 Google custom columns: mapping-row UX + runtime mapping
What changed:
- Reworked Google Sheets `custom` header mode from free-text textarea to explicit mapping rows:
  - `Meta lead field` selector
  - `Column title` input
  - add/remove row controls
- Google sheet creation endpoint now accepts structured `column_mappings` and uses them for header creation.
- Integration create endpoint now accepts `dest_columns` and stores them into Google destination credentials.
- Google Sheets adapter now supports `columns` configuration and writes row values in mapped column order instead of legacy fixed row when columns are provided.
- For Google integrations, `field_mapping` is now derived from selected column mappings.

Validation:
- `npm run typecheck` (backend) passed.
- `cd frontend && npm run typecheck` passed.
- `npm test` passed (11 files, 62 tests).
## 25) 2026-03-29 Auth UI revamp + Google OAuth login/signup
What changed:
- Rebuilt auth page into minimal professional tabbed layout (Login / Sign Up) matching requested clean style.
- Added signup flow directly in auth page using existing `/api/auth/register` endpoint.
- Added Google OAuth login flow for user authentication:
  - `GET /api/auth/google/init`
  - `GET /api/auth/google/callback`
- Google callback now creates user automatically on first login (by email), then issues access/refresh tokens and returns them to opener via popup `postMessage`.
- Added frontend API helpers:
  - `register(...)`
  - `getAuthGoogleInit(...)`

Environment:
- Added `AUTH_GOOGLE_OAUTH_REDIRECT_URI` in env config (default: `http://localhost:3000/api/auth/google/callback`).

Validation:
- `npm run typecheck` (backend) passed.
- `cd frontend && npm run typecheck` passed.

## 14) 2026-03-29 Duplicate Lead Delivery Hardening
What was inspected:
- `src/webhooks/facebook.ts` webhook ingestion idempotency path.
- `src/queue/lead-queue.ts` deterministic `jobId` behavior.
- `src/workers/lead-processor.ts` retry flow after CRM delivery.

Root cause (confirmed from code path):
- Worker could deliver to CRM successfully, then fail in post-delivery observability steps (`completeStep` / `completeRun`) and throw.
- BullMQ retry would then run same lead again, causing duplicate CRM records when destination dedup field is empty/missing.
- Webhook idempotency check used `SELECT` then `INSERT`, which is race-prone under concurrent duplicate events.

What changed:
- `src/workers/lead-processor.ts`
  - Added early idempotency guard: if lead status is already `delivered`, worker exits without re-delivery.
  - Moved `leads` status update to `delivered` immediately after successful CRM delivery.
  - Made workflow completion updates best-effort (logged on error, do not throw), preventing retry-driven duplicate CRM creates.
- `src/webhooks/facebook.ts`
  - Replaced `SELECT then INSERT` with atomic insert:
    - `INSERT ... ON CONFLICT (leadgen_id) DO NOTHING`
  - Queue job is added only when insert actually created a new row.

Commands run:
- `npm run typecheck`
- `cd frontend && npm run typecheck`

Outcomes:
- Typecheck passed in backend and frontend.
- Ingestion and worker paths are now stricter for idempotency under retry/concurrency.

Remaining risk:
- If CRM endpoint itself accepts duplicate creates and source lead has no dedup-capable fields (e.g. no phone/email), destination-level duplicate prevention may still be limited.

Next exact action:
1. Restart API + worker processes.
2. Send one fresh Meta test lead and verify only one CRM card is created.
3. Confirm logs show either a single delivery or `skip qilindi: lead allaqachon yetkazilgan` on retry attempts.

## 15) 2026-03-29 Google Forms Source (Meta bilan birga)
What changed:
- New webhook route added:
  - `POST /webhooks/google-forms`
- New source normalization service added:
  - `src/services/google-forms.ts`
- Worker supports `source_type='google_forms'` and can process normalized form payload to CRM adapters.
- Lead queue payload expanded to carry source metadata.
- Integration create API now supports:
  - `source_type: 'facebook' | 'google_forms'`
- For `google_forms` source, create validation requires:
  - `source_form_id` (Google Form ID)
  - `source_page_access_token` (used as webhook token)
- Frontend wizard step-1 now supports source selection:
  - `Meta Ads`
  - `Google Forms`
  with Google Form ID + webhook token inputs.
- Integration preflight made source-aware for Google Forms.

Operational notes:
- Google Forms route expects `x-webhook-token` header to match integration source token.
- Payload should include `form_id` and `response_id` (or camelCase aliases).

Commands run:
- `npm run typecheck`
- `cd frontend && npm run typecheck`
- `npm test`

Outcomes:
- Backend typecheck passed.
- Frontend typecheck passed.
- Tests passed: 11 files / 62 tests.

## 16) 2026-03-29 Google Forms OAuth + Polling
What changed:
- Source-side Google Forms now supports OAuth + polling workflow (without manual webhook token input in UI).
- Frontend wizard step-1 for `Google Forms` now requires:
  - Google connection
  - Google Form ID
- Integration create API for `source_type='google_forms'` now validates Google connection ownership and stores connection reference.
- Background poller added:
  - `src/workers/google-forms-poller.ts`
  - polls active google_forms integrations on interval
  - fetches Google Form responses
  - normalizes answers and enqueues lead jobs idempotently
- Poller started/stopped in app lifecycle:
  - `src/index.ts`
- Worker updated to process google_forms source payloads.
- Google OAuth scope extended for forms access:
  - `forms.responses.readonly`
  - `forms.body.readonly`

Notes:
- Existing Google connections created before scope update may require reconnect to grant new Forms scopes.
- Poll interval env (optional): `GOOGLE_FORMS_POLL_INTERVAL_MS` (default 30000ms).

## 17) 2026-03-29 Google Forms ro'yxati orqali tanlash (Form ID qo'lda emas)
What changed:
- Google Forms source tanlashda qo'lda `Form ID` kiritish oqimi olib tashlandi.
- Wizard step-1 endi tanlangan Google ulanishdan forma ro'yxatini yuklab, dropdown orqali forma tanlashni ishlatadi.
- UI matnlari yangilandi:
  - `Google ulanish va formani tanlang.`
  - tanlanganda `Forma tanlandi.` holati ko'rsatiladi.
- Google Forms oqimida keraksiz `selectedPage` (Facebook sahifa) tekshiruvi olib tashlandi, shu sababli save oqimi noto'g'ri bloklanmaydi.

Files changed:
- `frontend/app/(dashboard)/integrations/page.tsx`

Commands run:
- `npm run typecheck:frontend`

Outcomes:
- Frontend typecheck passed.

## 18) 2026-03-29 Google Forms maydonlarini mapping dropdownga chiqarish
What changed:
- Google Forms uchun yangi endpoint qo'shildi:
  - `GET /api/integrations/google/form-fields?connection_id=...&form_id=...`
  - Google OAuth refresh token orqali Form schema olinadi va savollar mapping uchun qaytariladi.
- Integratsiya wizard (Step-1/Step-4) yangilandi:
  - Google forma tanlanganda uning maydonlari avtomatik yuklanadi.
  - Step-4 dagi `Manba maydoni` dropdown endi real Google Form maydonlarini ko'rsatadi.
  - Forma almashganda eski mapping/source-fields tozalanadi.
  - Bitrix mappingga o'tishda manba maydonlar yuklanishi ham tekshiriladi.

Files changed:
- `src/api/integrations.ts`
- `frontend/lib/api.ts`
- `frontend/app/(dashboard)/integrations/page.tsx`

Commands run:
- `npm run typecheck`
- `npm run typecheck:frontend`

Outcomes:
- Backend typecheck passed.
- Frontend typecheck passed.

## 19) 2026-03-29 Google Forms mappingda ID o'rniga savol nomlarini chiqarish
What changed:
- Google Forms maydon parseri tuzatildi:
  - `questionId` ko'rsatish o'rniga item/question title'dan o'qiladigan label ishlatiladi.
  - Keylar `snake_case` bo'lib, kolliziya holatida unikallik suffix bilan saqlanadi.
- Shu mantiq pollerdagi question-map builder bilan ham bir xil qilindi, mapping va runtime delivery bir-biriga mos bo'lishi uchun.

Files changed:
- `src/api/integrations.ts`
- `src/workers/google-forms-poller.ts`

Commands run:
- `npm run typecheck`
- `npm run typecheck:frontend`

Outcomes:
- Backend typecheck passed.
- Frontend typecheck passed.

## 20) 2026-03-29 CRM lead title/source source_type ga moslash
What changed:
- Google Forms leadlari endi CRM'ga `Facebook Lead` nomi bilan emas, manbaga mos nom bilan yuboriladi.
- Bitrix:
  - `source` Google Forms bo'lsa `TITLE = Google Form Lead: ...`
  - Facebook bo'lsa oldingi `Facebook Lead: ...`
- AmoCRM:
  - Contact fallback name source-aware qilindi.
  - Lead `name` va `source_name` source-aware qilindi (`Google Form` vs `Facebook Lead Ads`).

Files changed:
- `src/services/bitrix.ts`
- `src/services/adapters/bitrix-adapter.ts`
- `src/services/adapters/amocrm-adapter.ts`

Commands run:
- `npm run typecheck`
- `npm test`

Outcomes:
- Backend typecheck passed.
- Tests passed (11 files, 62 tests).

## 2026-03-29 UI/API Update (Leads Table)
- Inspected `frontend/app/(dashboard)/leads/page.tsx`, `frontend/lib/types.ts`, and `src/api/leads.ts`.
- Updated leads list API to include `source_type` and derived `crm_lead_id` from `mapped_data` (`crmLeadId` / fallback `bitrixLeadId`).
- Updated frontend leads table:
  - `Leadgen` now compact (middle-ellipsis) with full value in tooltip.
  - Added copy button for leadgen id (safe fallback when Clipboard API is unavailable).
  - Added new columns: `Manba` and `CRM Lead ID`.
- Commands run:
  - `npm run typecheck`
  - `npm run typecheck:frontend`
- Outcomes:
  - Backend typecheck: passed.
  - Frontend typecheck: passed.
- Remaining risk:
  - Copy button silently no-ops in non-secure contexts where Clipboard API is blocked.
- Next exact action:
  - Reload Leads page and verify new columns + compact IDs render correctly on desktop/mobile widths.

## 2026-03-29 UI Update (Leads Filters)
- Added client-side filter bar on Leads page for: search, source type, status, integration name, and reset action.
- Filtering is applied to already-fetched list (no API contract change needed).
- Added empty-state row when filters return no items.
- Command run:
  - `npm run typecheck:frontend`
- Outcome:
  - Frontend typecheck passed.
- Next exact action:
  - Verify filters on `/leads` with mixed Facebook/Google Forms data and statuses.

## 2026-03-29 UI Update (Integrations Split)
- Integrations list is now split into two sections:
  - `Faol integratsiyalar` (active only)
  - `Tugatilgan integratsiyalar` (inactive only)
- Reused one shared table renderer to keep behavior/actions consistent.
- Added per-section counts and empty-state messages.
- Command run:
  - `npm run typecheck:frontend`
- Outcome:
  - Frontend typecheck passed.
- Next exact action:
  - Verify section counts and row placement on `/integrations` after refresh.

## 2026-03-29 UI Fix (Custom Filters)
- Replaced native `<select>` elements in Leads filter bar with custom `UiDropdown` (button + popup list) to match existing design language.
- Kept filter semantics unchanged (source/status/integration).
- Command run:
  - `npm run typecheck:frontend`
- Outcome:
  - Frontend typecheck passed.

## 2026-03-29 UI Fix (Integration Actions)
- Replaced misleading delete action in integrations table with explicit state action:
  - Active row: `Tugatish`
  - Inactive row: `Faollashtirish`
- Frontend now uses `POST /api/integrations/:id/toggle` via new `toggleIntegration()` API helper.
- Command run:
  - `npm run typecheck:frontend`
- Outcome:
  - Frontend typecheck passed.

## 2026-03-29 UI Fix (No Browser Confirm)
- Added reusable UI confirmation modal: `frontend/components/confirm-dialog.tsx`.
- Replaced `window.confirm` usage in:
  - `frontend/app/(dashboard)/integrations/page.tsx`
  - `frontend/app/(dashboard)/connections/page.tsx`
- All confirmation asks in these dashboards are now in-app UI dialogs, not native browser popups.
- Command run:
  - `npm run typecheck:frontend`
- Outcome:
  - Frontend typecheck passed.

## 2026-03-29 Leads UX Expansion
- Upgraded Leads page with:
  - row details drawer (raw/mapped data + timeline)
  - sorting (created_at / attempts / latency, asc/desc)
  - saved filters (localStorage-backed)
  - quick retry action for failed/DLQ
  - CSV export of current filtered+sorted list
  - relative time labels with precise datetime on hover
  - status-based row background coloring
  - server-backed pagination (limit/offset + next/prev)
  - column picker (show/hide columns)
  - correlation id column and debug bundle copy action
- API helper updates:
  - `getLeads(token, params)` with pagination/filter params
  - `getLeadById(leadId, token)`
  - `retryLead(leadId, token)`
- Type updates:
  - added `LeadDetail` interface.
- Commands run:
  - `npm run typecheck:frontend`
  - `npm run typecheck`
- Outcomes:
  - frontend + backend typecheck passed.

## 2026-03-29 Phase 1 Start - Meta Conversions API Pipeline
- Added DB schema for Meta CAPI config + event ledger:
  - `meta_capi_configs` (pixel/token config per user)
  - `meta_capi_events` (event model, status, attempts, response, DLQ trace)
  - migration file: `src/db/migrations/007_meta_conversions.sql`
- Added Meta CAPI domain service:
  - `src/services/meta-conversions.ts`
  - explicit event model support (`event_name`, `event_time`, `event_id`, `action_source`, `user_data`, `custom_data`)
  - deterministic event id helper (`createStableMetaEventId`)
  - user_data hashing/sanitizing helper (`buildMetaUserData`)
  - Graph API delivery client (`sendMetaConversionEvent`)
- Added queue + worker:
  - queue: `src/queue/meta-capi-queue.ts`
  - worker: `src/workers/meta-capi-processor.ts`
  - retry/backoff uses existing strategy, non-retryable failures go to `dlq`
- Added authenticated API:
  - `GET /api/meta-capi/config`
  - `POST /api/meta-capi/config`
  - `POST /api/meta-capi/events`
  - `POST /api/meta-capi/events/:id/retry`
  - `GET /api/meta-capi/events`
  - route file: `src/api/meta-capi.ts`
- App wiring:
  - mounted route in `src/index.ts`
  - started and graceful-shutdown wired for Meta CAPI worker in `src/index.ts`
- Error model update:
  - `MetaCapiError` added in `src/services/errors.ts` with retryability classification

### Commands run
- `npm run typecheck`
- `npm test`

### Outcomes
- backend typecheck passed
- test suite passed (11 files, 62 tests)

### Remaining for Phase 1
- run DB migration on target env: `npm run db:migrate`
- add frontend UI for CAPI config/event testing (not started yet)

## 2026-03-29 Phase 2 Start - Meta Pixel (Browser) Integration
- Added DB schema for Meta Pixel config + browser event ledger:
  - `meta_pixel_configs`
  - `meta_pixel_events`
  - migration file: `src/db/migrations/008_meta_pixel.sql`
- Added backend API for Pixel:
  - `GET /api/meta-pixel/config`
  - `POST /api/meta-pixel/config`
  - `POST /api/meta-pixel/events`
  - `GET /api/meta-pixel/events`
  - `GET /api/meta-pixel/diagnostics`
  - route file: `src/api/meta-pixel.ts`
- Mounted Pixel API route in app server:
  - `src/index.ts`
- Added frontend Pixel runtime bootstrap (dashboard-wide):
  - `frontend/components/meta-pixel-bootstrap.tsx`
  - loads Meta Pixel script, sends `PageView`, logs browser-side result
  - if browser tracking blocked, sends fallback event to CAPI with same `event_id`
- Added frontend Pixel helper:
  - `frontend/lib/meta-pixel.ts`
- Added frontend API client support for Pixel/CAPI bridge:
  - `frontend/lib/api.ts`
- Upgraded Settings page into Pixel control panel:
  - `frontend/app/(dashboard)/settings/page.tsx`
  - features:
    - Pixel config save
    - manual test `PageView`
    - parity diagnostics summary
    - last pixel events list

### Commands run
- `npm run typecheck`
- `npm run typecheck:frontend`
- `npm test`

### Outcomes
- backend typecheck passed
- frontend typecheck passed
- tests passed (11 files, 62 tests)

### Remaining for Phase 2
- run DB migration on target env: `npm run db:migrate`
- confirm production CSP allows `connect.facebook.net` script load if CSP is tightened later

## 2026-03-29 Phase 2 UX Split + OAuth Autofill
- Tracking UX split into explicit sections:
  - `Conversions API`
  - `Meta Pixel`
  - implemented as tabbed controls on `/settings`.
- Sidebar navigation now includes direct `Tracking` item.
- Added `Facebook orqali ulash` flow directly in Tracking page:
  - reuses popup OAuth
  - stores Facebook connection with pages + pixels + user access token metadata
  - auto-fills Pixel ID and CAPI token fields from selected Facebook connection
- Facebook OAuth backend expanded:
  - now requests `ads_read` and `business_management` scopes
  - fetches ad-account-linked pixels and returns them in OAuth payload

### Commands run
- `npm run typecheck`
- `npm run typecheck:frontend`
- `npm test`

### Outcomes
- backend typecheck passed
- frontend typecheck passed
- tests passed (11 files, 62 tests)

## 2026-03-30 Dev Stability Fixes (Frontend Root Warning + Worker Robustness)

### What was inspected
- Backend startup wiring and worker boot order: `src/index.ts`
- Google Forms poller runtime path: `src/workers/google-forms-poller.ts`
- Meta CAPI delivery error shaping: `src/services/meta-conversions.ts`, `src/workers/meta-capi-processor.ts`
- Frontend Next config: `frontend/next.config.ts`

### What was changed
- `src/workers/google-forms-poller.ts`
  - Added top-level `catch` inside `pollOnce()` so DB/network failures do not crash the backend process.
  - Poller now logs cycle failure and retries next interval.
- `frontend/next.config.ts`
  - Added `outputFileTracingRoot` set to frontend directory to silence Next.js multiple-lockfile root inference warning.
- `src/services/meta-conversions.ts`
  - Added explicit handling for Meta Graph `400` with `code=100` + `error_subcode=33`.
  - Returns clear non-retryable config/permission error message (pixel not found or missing permissions).

### Commands run
- `npm run typecheck`
- `npm run typecheck:frontend`
- `npm test`

### Outcomes
- backend typecheck passed
- frontend typecheck passed
- tests passed (11 files, 62 tests)

### Remaining risks
- Meta CAPI failures with `code=100/subcode=33` still require manual credential/config fix in Meta Business (expected; now more explicit).
- If PostgreSQL stays down, Google Forms poller will keep logging cycle errors by design until DB is restored.

### Next exact action
1. Verify `meta_capi_configs.pixel_id` is the correct active Pixel ID for the same Business asset as the access token.
2. Regenerate/replace token with required permissions and re-run one test event.
3. Start backend with DB running and confirm no process exit on poller cycle failure.
- Follow-up hardening (same day): Meta CAPI 400/100/33 detection now accepts string/number error code fields and message-pattern fallback to avoid payload-shape misses.

## 2026-03-30 Tracking Temporary Disable (Backend + Frontend)

### What was inspected
- Backend route/worker wiring: `src/index.ts`
- Env schema: `src/config/env.ts`
- Frontend dashboard runtime bootstrap: `frontend/app/(dashboard)/layout.tsx`
- Frontend tracking screen: `frontend/app/(dashboard)/settings/page.tsx`
- Frontend sidebar navigation: `frontend/components/nav-shell.tsx`

### What was changed
- Added runtime feature flag: `TRACKING_ENABLED` (default `false`) in backend env schema.
- Backend tracking disabled path:
  - `meta-capi` / `meta-pixel` API routes only mount when `TRACKING_ENABLED=true`.
  - Meta CAPI worker only starts when `TRACKING_ENABLED=true`.
- Frontend tracking disabled path:
  - Added `NEXT_PUBLIC_TRACKING_ENABLED` flag helper.
  - Pixel bootstrap (`MetaPixelBootstrap`) only runs when frontend flag is enabled.
  - Tracking menu item hidden from sidebar when disabled.
  - `/settings` shows a disabled placeholder instead of tracking controls when disabled.
- Env examples updated:
  - `.env` -> `TRACKING_ENABLED=false`
  - `.env.example` -> `TRACKING_ENABLED=false`
  - `frontend/.env.example` -> `NEXT_PUBLIC_TRACKING_ENABLED=false`

### Commands run
- `npm run typecheck`
- `npm run typecheck:frontend`
- `npm test`

### Outcomes
- backend typecheck passed
- frontend typecheck passed
- tests passed (11 files, 62 tests)

### Remaining risks
- Existing queued `meta-capi-processing` jobs will remain pending until tracking is re-enabled or queue is manually managed.
- If frontend runtime sets `NEXT_PUBLIC_TRACKING_ENABLED=true` while backend is disabled, UI may call unavailable endpoints.

### Next exact action
1. Restart backend + frontend processes to apply new env/config behavior.
2. Confirm `/settings` shows tracking disabled notice.
3. Confirm backend startup log includes tracking disabled message and no Meta CAPI worker startup line.
- Frontend loading UX pass: added reusable circular spinner and applied to core loading states (auth guard, dashboard loading, login, connections, integrations, leads, confirm dialog, settings controls).
- Validation: `npm run typecheck`, `npm run typecheck:frontend`, `npm test` passed.
- Dashboard KPI update: removed meaningless growth percent chip, replaced with delivery-speed KPIs (overall + Facebook + Google Forms) computed from recent leads with delivered latency (`delivered_at - created_at`).
- Dashboard analytics расширение: added 24h/7d/30d range selector, overall success rate, overall P95 latency, and source-level (Facebook/Google Forms) average latency + success summary.
- Integrations safety update: added backend duplicate-activation guard for active integrations with same source + destination + credentials on create/toggle/update.
- Integrations UX update: added edit dialog (`Tahrirlash`) for name, dedup settings, and Telegram chat id via `PUT /api/integrations/:id`.
## 2026-03-30 — Facebook form fetch hardening

### What was inspected
- `src/api/integrations.ts` Facebook OAuth callback flow and `leadgen_forms` fetch path.
- `frontend/app/(dashboard)/connections/page.tsx` Facebook connection UX.
- `frontend/lib/api.ts` API client methods for OAuth/connection flows.

### What was changed
- Strengthened `leadgen_forms` fetch with:
  - token fallback (`page_access_token` -> `user_access_token`)
  - pagination (`limit=100` + cursor loop)
  - explicit warning logs per failed attempt.
- Added new backend endpoint:
  - `POST /api/integrations/facebook/forms/refresh`
  - Refreshes forms for all pages in a Facebook connection, updates encrypted `credentials` and `meta`.
  - Returns refreshed pages, totals, and per-page fetch errors.
- Added frontend API method:
  - `refreshFacebookConnectionForms(connectionId, token)`.
- Updated Connections page to:
  - call refresh immediately after Facebook OAuth save;
  - auto-attempt one refresh for existing Facebook connections that have pages but all forms are `0`.

### Commands run
- `npm run -s typecheck`

### Outcome
- Typecheck passed.
- Existing stale Facebook connections can now be re-synced without deleting/reconnecting.
- Form fetch failures are now diagnosable instead of silently returning empty in all cases.

### Remaining risks
- If app permissions/review are incomplete, API still may return permission errors; these now surface in refresh response/logs.
- Real form visibility still depends on Meta-side permissions and page/form ownership.

### Next exact action
- Restart backend process.
- Open Connections page and let auto-refresh run once.
- If forms are still `0`, capture backend log lines starting with:
  - `[facebook:oAuth] leadgen_forms fetch failed ...`
  and use them to finalize missing Meta permissions.

## 2026-03-31 — Facebook tenant lock + integration cleanup

### What was inspected
- `src/api/connections.ts` upsert flow for OAuth-connected accounts.
- `src/api/integrations.ts` create/update/toggle duplicate checks.
- `src/webhooks/facebook.ts` tenant resolution behavior on shared page IDs.
- DB state for `integrations`/`connections` collision across users.

### What was changed
- Added cross-user ownership validation for Facebook connections:
  - same `provider=facebook + external_id` cannot be connected by another user.
  - API now returns `409` with owner name/email in message.
- Added cross-user ownership validation for Facebook integrations:
  - active integration with same page/form owned by another user is blocked with `409`.
  - checks applied on create, update(active), and toggle(active).
- Cleaned environment data by deactivating all integrations:
  - before: total `13`, active `7`
  - after: total `13`, active `0`

### Commands run
- `npm run -s typecheck`
- `npm run -s typecheck:frontend`

### Outcomes
- Backend now prevents cross-tenant Facebook source conflicts at API layer.
- Ambiguous webhook routing risk is reduced after cleanup + locks.

### Remaining risks
- Existing old Facebook connections in other users remain in DB (inactive integrations do not consume webhooks, but stale connections still exist).
- A user must activate/create exactly one needed integration after cleanup.

### Next exact action
1. Reconnect Facebook only for target user.
2. Create/activate required integration(s) for that user.
3. Send one fresh lead and verify webhook -> queue -> worker -> CRM path.
