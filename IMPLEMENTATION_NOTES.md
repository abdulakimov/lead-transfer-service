# IMPLEMENTATION NOTES

## 2026-03-28 â€” Phase-1 Hardening Increment

### Summary

Implemented the next plan-based hardening steps after Facebook->Bitrix E2E success:
- rate limiting on high-risk entrypoints
- canonical webhook path policy with compatibility
- retry regression tests for deterministic queue job IDs

### Changes

1. Rate limiting
- Added `src/middleware/rate-limit.ts` with IP-based fixed-window limiting.
- Wired in `src/index.ts`:
  - `/api/auth`: 30 requests/minute per IP
  - `/webhooks/facebook`: 300 requests/minute per IP

2. Webhook route policy
- Updated `src/webhooks/facebook.ts`:
  - canonical path remains `/`
  - legacy `/webhook` still supported
  - legacy usage now logs deprecation warning

3. Tests
- Added `tests/unit/leads-retry.test.ts`:
  - validates old BullMQ job is removed before retry enqueue
  - validates retry still works when old job does not exist
- Extended `tests/unit/webhook-handler.test.ts`:
  - verifies canonical root path GET challenge handling
  - verifies canonical root path POST signature flow

### Validation

- `npm run typecheck` passed.
- `npm test` passed (8 files, 51 tests).

### Remaining follow-up

1. Replace in-memory limiter with Redis-backed limiter for multi-instance deployments.
2. Add webhook integration resolution tests for page/form precedence.
3. Start workflow engine schema + execution ledger implementation (next roadmap block).

## 2026-03-28 — Webhook page/form precedence tests

### Summary
Added focused tests to lock integration routing behavior for Facebook webhook events.

### File added
- `tests/unit/webhook-integration-resolution.test.ts`

### Scenarios covered
1. `page_id + form_id` exact match path.
2. `page_id` fallback path when form-specific integration is unavailable.
3. no `form_id` path favoring page-level integration.

### Validation
- Typecheck and full tests passed (`9 files / 54 tests`).

## 2026-03-28 — Step 2: Workflow engine persistence schema

### Summary
Implemented persistence schema for workflow engine core entities.

### Migration added
- `src/db/migrations/005_workflow_engine.sql`

### Tables introduced
1. `workflows`
- tenant-owned workflow metadata (`user_id`, `name`, `active`, `source_type`, `trigger_type`, `source_config`)

2. `workflow_versions`
- immutable version records per workflow (`version`, `definition`, `is_published`, `created_by`)
- unique `(workflow_id, version)`

3. `workflow_runs`
- execution-level records (`workflow_id`, `workflow_version_id`, `trigger_event_id`, `status`, `attempts`, `context`, timing fields)
- status constraint: `pending|running|completed|failed|canceled|dlq`

4. `workflow_steps`
- step-by-step execution timeline per run (`step_key`, `step_type`, `step_order`, `attempt`, status, payload/error fields)
- status constraint: `pending|running|completed|failed|skipped|canceled`
- unique `(run_id, step_order, attempt)`

### Validation
- `npm run db:migrate` applied `005_workflow_engine.sql` successfully.
- Postgres table check confirms all 4 new tables exist.
- `npm run typecheck` passed.

### Notes
- Schema is intentionally adapter-agnostic and run-log focused.
- No runtime logic added in this step (as requested).

## 2026-03-28 — Step 3: Minimal workflow runtime execution logging

### Summary
Implemented minimal runtime logging for `meta.lead.created -> <crm>.create_lead` in worker path.

### Files added/changed
- Added `src/services/workflow-runtime.ts`
  - ensures published workflow version (auto-creates system workflow/version when missing)
  - starts workflow run
  - creates/completes/fails workflow steps
  - completes/fails workflow runs
- Updated `src/workers/lead-processor.ts`
  - starts workflow run for each processed lead
  - records trigger step (`trigger.meta.lead.created`)
  - records action step (`action.<dest_type>.create_lead`) on delivery stage
  - writes failure details to steps/runs on exceptions
  - keeps existing lead processing logic intact

### Validation
- `npm run typecheck` passed.
- `npm test` passed (9 files, 54 tests).
- Direct worker execution produced workflow records in DB:
  - `workflow_runs.status = failed`
  - `workflow_steps` includes trigger step with `error_data`

### Important operational note
- The current Facebook page access token used for this verification run is expired (OAuth code 190 / subcode 463).
- Step 3 logging itself works; token should be rotated before further live E2E runs.

## 2026-03-28 — Step 4: Workflow runs read API

### Summary
Added tenant-scoped read APIs for workflow observability (runs list + run timeline detail with steps).

### Files added/changed
- Added `src/api/workflows.ts`
  - `GET /api/workflows` (list user workflows)
  - `GET /api/workflows/runs` (list runs with filters/pagination)
  - `GET /api/workflows/runs/:id` (single run + ordered step timeline)
- Updated `src/index.ts`
  - mounted `app.use('/api/workflows', workflowsRoutes)`
- Added tests `tests/unit/workflows-api.test.ts`
  - list runs success
  - run detail with steps
  - 404 for missing/non-owned run

### Validation
- `npm run typecheck` passed.
- `npm test` passed (`10 files / 57 tests`).

### Notes
- Endpoints are read-only in this step.
- Tenant isolation is enforced by joining runs with workflows filtered by `w.user_id`.

## 2026-03-28 — Step 5: Workflow authoring/publish + minimal dispatch APIs

### Summary
Implemented authoring and publication surfaces for workflows, plus a minimal dispatch endpoint for creating run/step timeline records.

### API additions (`src/api/workflows.ts`)
- `POST /api/workflows`
  - create workflow (tenant-scoped)
- `POST /api/workflows/:id/versions`
  - create draft version with incremented version number
- `POST /api/workflows/:id/publish`
  - publish selected version (by `version_id` or `version`) with atomic unpublish/publish transaction
- `POST /api/workflows/:id/dispatch`
  - minimal manual dispatch creating a completed run and 2 completed steps (`trigger.manual.dispatch`, `action.manual.noop`)

### Security/ownership
- All endpoints require auth.
- Workflow ownership enforced via `user_id` checks (`findOwnedWorkflow`).

### Tests
- Extended `tests/unit/workflows-api.test.ts`:
  - create workflow + create version
  - publish version
  - dispatch endpoint
  - existing read endpoints still covered

### Validation
- `npm run typecheck` passed.
- `npm test` passed (`10 files / 60 tests`).

## 2026-03-28 — Frontend foundation started

### Summary
Bootstrapped a new Next.js frontend app in `frontend/` and connected it to existing backend APIs for auth and dashboard modules.

### Frontend stack introduced
- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS

### Implemented pages/modules
- `/login` (auth form calling `/api/auth/login`)
- `/dashboard` (overview metrics from integrations/leads/runs)
- `/integrations` (list)
- `/leads` (list)
- `/workflows` (list)
- `/runs` (run list + step timeline)

### Shared frontend modules
- `frontend/lib/api.ts` (typed backend client)
- `frontend/lib/session.ts` (token storage helpers)
- `frontend/lib/types.ts` (UI data models)
- `frontend/components/nav-shell.tsx`
- `frontend/components/auth-guard.tsx`
- `frontend/components/status-pill.tsx`

### Validation
- Frontend dependencies installed.
- `npm run build` (frontend) passed.
- `npm run typecheck` (frontend) passed.

### Root scripts added
- `dev:frontend`
- `build:frontend`
- `typecheck:frontend`

## 2026-03-28 — Frontend Step-6 (requested 3 items) completed

### Summary
Implemented all three requested frontend upgrades:
1. workflow create/version/publish/dispatch interaction UI
2. run detail page with full payload/error viewers
3. reusable cached data-fetching pattern with UI error boundaries

### Files added
- `frontend/lib/query-cache.ts`
- `frontend/lib/use-api-query.ts`
- `frontend/components/query-boundary.tsx`
- `frontend/app/(dashboard)/error.tsx`
- `frontend/app/(dashboard)/loading.tsx`
- `frontend/app/(dashboard)/runs/[runId]/page.tsx`

### Files updated
- `frontend/app/(dashboard)/dashboard/page.tsx`
- `frontend/app/(dashboard)/integrations/page.tsx`
- `frontend/app/(dashboard)/leads/page.tsx`
- `frontend/app/(dashboard)/workflows/page.tsx`
- `frontend/app/(dashboard)/runs/page.tsx`
- `frontend/lib/session.ts`

### Behavior now available
- Workflows page now supports:
  - create workflow
  - create version (JSON definition)
  - publish version (by `version_id` or `version`)
  - dispatch manual run (with JSON context)
- Runs page links each run to a dedicated detail page.
- Run detail page shows:
  - run metadata + context
  - per-step input/output/error JSON blocks
- Data-loading pattern:
  - cache-aware `useApiQuery` hook
  - query invalidation helper
  - per-page refresh actions
  - reusable `QueryBoundary` + segment-level `error.tsx`/`loading.tsx`

### Validation
- `npm run build:frontend` passed.
- `npm run typecheck:frontend` passed.

### Notes
- `next build` warns about multiple lockfiles and missing Next ESLint plugin configuration.
- Build originally failed due SSR `localStorage` access; fixed by browser-safe guards in `frontend/lib/session.ts`.

## 2026-03-28 — Step 6: Real workflow dispatch execution

### Summary
Replaced noop dispatch path with real execution of published workflow actions.

### Files added/changed
- Added `src/services/workflow-dispatch.ts`
  - loads integration from `workflow.source_config.integration_id`
  - fetches lead from Facebook using decrypted page token
  - executes published actions (currently `*.create_lead`)
  - delivers lead through CRM adapter
  - persists per-step output/error and run status updates
- Updated `src/api/workflows.ts`
  - `POST /api/workflows/:id/dispatch` now loads published version definition and calls dispatch runtime service
  - response now returns real run result (`Workflow dispatch bajarildi`)
- Updated tests:
  - `tests/unit/workflows-api.test.ts` (dispatch endpoint now mocks runtime service)
  - Added `tests/unit/workflow-dispatch.test.ts` (success + failure step persistence behavior)

### Validation
- `npm run typecheck` passed.
- `npm test` passed (`11 files / 62 tests`).

### Notes
- Dispatch currently supports action operation `create_lead` and validates CRM type match (`action crmType == integration.dest_type`).
- Failed action now writes `workflow_steps.error_data` and `workflow_runs.last_error` via runtime helpers.


## 2026-03-28 - Facebook Auth Error Retries Disabled

### What changed
- Updated `src/workers/lead-processor.ts` to stop retry loop for non-retryable Facebook auth failures.
- Added `job.discard()` in two places:
  - when `source_page_access_token` is missing after decryption
  - when `fetchLead(...)` throws `FacebookAuthError` (expired/invalid token)

### Why
- Expired Meta token (`OAuthException code=190 subcode=463`) cannot be fixed by retrying.
- Previous behavior retried up to 5 times, creating noisy logs and unnecessary queue churn.

### Validation
- Ran: `npm run typecheck`
- Result: passed

### Operational effect
- For Facebook auth failures, lead job fails once and is marked DLQ in existing `worker.on('failed')` flow.
- After rotating token, lead should be re-queued via manual retry endpoint.

## 2026-03-28 - Frontend Design System Refresh (frontend-design skill)

### What was inspected
- Frontend shell and shared primitives:
  - `frontend/app/globals.css`
  - `frontend/components/nav-shell.tsx`
  - `frontend/components/page-header.tsx`
  - `frontend/components/kpi-card.tsx`
  - `frontend/components/data-placeholder.tsx`
  - `frontend/components/status-pill.tsx`
  - `frontend/components/query-boundary.tsx`
  - `frontend/components/json-viewer.tsx`
- Dashboard/auth pages:
  - `frontend/app/(auth)/login/page.tsx`
  - `frontend/app/(dashboard)/dashboard/page.tsx`
  - `frontend/app/(dashboard)/integrations/page.tsx`
  - `frontend/app/(dashboard)/leads/page.tsx`
  - `frontend/app/(dashboard)/runs/page.tsx`
  - `frontend/app/(dashboard)/runs/[runId]/page.tsx`
  - `frontend/app/(dashboard)/workflows/page.tsx`
  - `frontend/app/(dashboard)/settings/page.tsx`
  - `frontend/app/(dashboard)/analytics/page.tsx`
  - `frontend/app/(dashboard)/loading.tsx`
  - `frontend/app/(dashboard)/error.tsx`

### What changed
- Introduced a tokenized UI foundation in `globals.css`:
  - semantic color tokens (`--bg`, `--surface`, `--text-*`, `--brand`, status colors)
  - standardized surface, button, form-field, and table utility classes
  - calmer neutral/teal visual direction with restrained gradients
- Refreshed app shell (`nav-shell`) with:
  - compact top utility bar
  - cleaner side navigation active-state treatment
  - consistent card geometry and spacing rhythm
- Updated shared UI primitives to enforce hierarchy and consistency:
  - `PageHeader`, `KpiCard`, `DataPlaceholder`, `StatusPill`, `QueryBoundary`, `JsonViewer`
- Applied the new system across all dashboard and auth screens without changing business behavior.
- Expanded placeholder `settings` and `analytics` pages into structured, reusable section cards.

### Commands run
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `cd frontend && if (Test-Path .next) { Remove-Item -Recurse -Force .next }; npm run build`

### Outcomes
- `typecheck`: passed.
- `build`: not confirmed in this environment due repeated timeout / local `.next` trace file lock behavior observed earlier (`EPERM` and subsequent long-running timeout).

### Remaining risk
- Production build verification is still required on a clean local run (or CI) where `.next` is not file-locked.

### Next exact action
- From `frontend/`, run `npm run build` in a fresh terminal with no active Next dev process and confirm successful output.

## 2026-03-28 - Icon Pack Installation and Project Iconization

### What changed
- Installed `lucide-react` in frontend dependencies.
- Added consistent iconography across the dashboard shell and key screens.
- Updated navigation to use per-route icons plus logout icon.
- Extended shared `PageHeader` to accept optional icon slot.
- Upgraded `DataPlaceholder` to semantic icon states (info/error).
- Iconized page headers:
  - Overview, Integrations, Leads, Runs, Run Detail, Workflows, Analytics, Settings
- Added auth page icon accents for feature cards and sign-in heading.

### Files changed
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/components/nav-shell.tsx`
- `frontend/components/page-header.tsx`
- `frontend/components/data-placeholder.tsx`
- `frontend/app/(auth)/login/page.tsx`
- `frontend/app/(dashboard)/dashboard/page.tsx`
- `frontend/app/(dashboard)/integrations/page.tsx`
- `frontend/app/(dashboard)/leads/page.tsx`
- `frontend/app/(dashboard)/runs/page.tsx`
- `frontend/app/(dashboard)/runs/[runId]/page.tsx`
- `frontend/app/(dashboard)/workflows/page.tsx`
- `frontend/app/(dashboard)/analytics/page.tsx`
- `frontend/app/(dashboard)/settings/page.tsx`

### Validation
- Ran `cd frontend && npm run typecheck`
- Result: passed

## 2026-03-28 - Icon pack switched to Heroicons

### What changed
- Installed `@heroicons/react` and migrated all icon usage from Lucide to Heroicons (outline set).
- Updated nav, page-header icons, placeholders, and auth highlights to Heroicons.
- Removed `lucide-react` from frontend dependencies.

### Validation
- Ran `cd frontend && npm run typecheck`
- Result: passed

## 2026-03-29 - Dashboard visual overhaul (reference-inspired)

### Scope
- Reworked dashboard visual system to match provided reference direction (layout rhythm, sidebar/topbar, cards, controls), while keeping implementation original and existing data flow intact.
- Kept font as Inter.

### Color tokens used
- `#5347CE`
- `#887CFD`
- `#4896FE`
- `#16C8C7`

### Files updated
- `frontend/app/globals.css`
- `frontend/components/nav-shell.tsx`
- `frontend/components/page-header.tsx`
- `frontend/components/kpi-card.tsx`
- `frontend/components/status-pill.tsx`
- `frontend/app/(dashboard)/dashboard/page.tsx`

### Validation
- Ran `cd frontend && npm run typecheck`
- Result: passed

## 2026-03-29 - Integrations wizard logic (Yuboraman-style flow)

### What was implemented
- Backend integration create/update schema widened to accept destination types:
  - `bitrix24`
  - `amocrm`
- Frontend integrations page rebuilt with operational creation flow:
  - Added `Yangi integratsiya` action
  - Added 4-step modal wizard:
    1. Source (Facebook page/form/token)
    2. Base settings (name, telegram chat, dedup)
    3. Destination (Bitrix24/AmoCRM, credentials)
    4. Additional settings (field mapping JSON)
  - Added validation per step
  - Save now calls real backend `POST /api/integrations`
  - Integration table auto-refreshes after create
- Added API client method:
  - `createIntegration(...)`

### Compatibility notes
- `google_sheets` is shown as a future option in wizard UI but save is intentionally blocked with explicit message,
  because backend delivery adapter is not implemented yet (to avoid unreliable runtime behavior).

### Files changed
- `src/api/integrations.ts`
- `frontend/lib/types.ts`
- `frontend/lib/api.ts`
- `frontend/app/(dashboard)/integrations/page.tsx`

### Validation
- `npm run typecheck` (backend): passed
- `npm --prefix frontend run typecheck`: passed

## 2026-03-29 - Facebook OAuth integration flow (Yuboraman-style)

### What was implemented
- Added backend Facebook OAuth popup flow for integration source selection:
  - `GET /api/integrations/facebook/oauth/init` (auth required): returns Facebook auth URL with signed state.
  - `GET /api/integrations/facebook/oauth/callback` (public): exchanges `code`, fetches profile + pages + leadgen forms, sends result to opener via `postMessage`.
- Wizard step-1 switched from manual token entry to OAuth connection:
  - "Facebook profilini ulash" button opens popup
  - on success receives connected profile + pages + forms
  - page/form are selected from returned data
  - selected page token is used internally for integration create payload
- Destination schema remains production-safe:
  - supports `bitrix24` and `amocrm`
  - `google_sheets` stays UI-only placeholder (save blocked) until adapter is implemented.

### Env/config updates
- Added `FB_OAUTH_REDIRECT_URI` to runtime env schema.
- Added `FB_OAUTH_REDIRECT_URI` to `.env.example`.

### Files changed
- `src/config/env.ts`
- `.env.example`
- `src/api/integrations.ts`
- `frontend/lib/api.ts`
- `frontend/app/(dashboard)/integrations/page.tsx`

### Validation
- `npm run typecheck` (backend): passed
- `npm --prefix frontend run typecheck`: passed

### Operational note
- `FB_OAUTH_REDIRECT_URI` must exactly match Meta App OAuth redirect URI settings.
- Required Facebook scopes: `pages_show_list,pages_read_engagement,pages_manage_metadata,leads_retrieval`.

## 2026-03-29 - Phase 1 (Meta Conversions API) backend foundation

### What was inspected first
- Existing queue/worker reliability path (`src/queue/lead-queue.ts`, `src/workers/lead-processor.ts`)
- Workflow run observability model (`src/services/workflow-runtime.ts`, `src/db/migrations/005_workflow_engine.sql`)
- API mounting and startup lifecycle (`src/index.ts`)
- Secret handling (`src/config/encryption.ts`, `src/utils/log-sanitize.ts`)

### What was changed
- Added migration:
  - `src/db/migrations/007_meta_conversions.sql`
  - tables:
    - `meta_capi_configs`
    - `meta_capi_events`
- Added CAPI service:
  - `src/services/meta-conversions.ts`
  - includes:
    - explicit event contract mapping for Meta payload
    - deterministic `event_id` helper
    - user_data hashing normalization
    - Graph API delivery function
- Added CAPI queue:
  - `src/queue/meta-capi-queue.ts`
- Added CAPI worker:
  - `src/workers/meta-capi-processor.ts`
  - status transitions:
    - `pending -> processing -> delivered`
    - `failed/dlq` on error with retryability classification
- Added authenticated API routes:
  - `src/api/meta-capi.ts`
  - endpoints:
    - `GET /api/meta-capi/config`
    - `POST /api/meta-capi/config`
    - `POST /api/meta-capi/events`
    - `POST /api/meta-capi/events/:id/retry`
    - `GET /api/meta-capi/events`
- Wired app startup:
  - `src/index.ts` now mounts `/api/meta-capi`
  - starts/stops `startMetaCapiWorker()`
- Added typed CAPI error class:
  - `MetaCapiError` in `src/services/errors.ts`

### Commands run
- `npm run typecheck`
- `npm test`

### Outcomes
- Typecheck passed
- Tests passed

### Manual validation checklist (Phase 1)
1. Run DB migration:
   - `npm run db:migrate`
2. Create config:
   - `POST /api/meta-capi/config` with `pixel_id`, `access_token`, optional `test_event_code`
3. Enqueue test event:
   - `POST /api/meta-capi/events` with event model (`event_name`, `action_source`, `user_data`, `custom_data`)
4. Verify ledger:
   - `GET /api/meta-capi/events`
   - expect `status=delivered` and `fb_response` populated
5. Failure path check:
   - provide invalid token
   - expect `failed` then `dlq` behavior based on retryability/attempt count

### Risks / remaining
- Migration not executed in this coding session (must run in your environment).
- Frontend management/test UI for Meta CAPI not implemented yet.
- Phase 2 (Pixel) intentionally not started per your instruction.

## 2026-03-29 - Phase 2 (Meta Pixel) implementation start

### What was inspected
- Frontend dashboard composition (`frontend/app/(dashboard)/layout.tsx`)
- Existing settings page placeholder (`frontend/app/(dashboard)/settings/page.tsx`)
- Existing API client patterns (`frontend/lib/api.ts`)
- Backend route wiring (`src/index.ts`)

### What was changed
- Added migration:
  - `src/db/migrations/008_meta_pixel.sql`
  - tables:
    - `meta_pixel_configs` (tenant pixel identity)
    - `meta_pixel_events` (browser event ledger with `fbq_sent` + `blocked_reason`)
- Added backend Pixel API:
  - `src/api/meta-pixel.ts`
  - routes:
    - `GET /api/meta-pixel/config`
    - `POST /api/meta-pixel/config`
    - `POST /api/meta-pixel/events`
    - `GET /api/meta-pixel/events`
    - `GET /api/meta-pixel/diagnostics`
- Wired backend route:
  - `src/index.ts`
- Added frontend browser pixel helper:
  - `frontend/lib/meta-pixel.ts`
  - runtime script inject + `fbq` track wrapper
- Added dashboard-level Pixel bootstrap:
  - `frontend/components/meta-pixel-bootstrap.tsx`
  - behavior:
    - loads active Pixel config
    - tracks `PageView` on route changes
    - writes pixel ledger event
    - if browser blocked -> sends CAPI fallback with same `event_id`
- Added frontend API functions:
  - `frontend/lib/api.ts`
  - includes Pixel config/events/diagnostics + CAPI enqueue bridge call
- Replaced settings placeholder with operational Pixel panel:
  - `frontend/app/(dashboard)/settings/page.tsx`
  - includes:
    - Pixel config save form
    - manual test event
    - diagnostics summary
    - latest Pixel event table

### Commands run
- `npm run typecheck`
- `npm run typecheck:frontend`
- `npm test`

### Outcomes
- Backend typecheck passed
- Frontend typecheck passed
- Tests passed

### Manual verification steps
1. Run DB migrations:
   - `npm run db:migrate`
2. Open `/settings`:
   - save active Pixel ID config
3. Click `Test PageView yuborish`:
   - confirm row appears in Pixel events table
4. Block Facebook script in browser/adblock:
   - trigger test again
   - expect `Bloklangan` in Pixel table
   - and CAPI fallback event in `/api/meta-capi/events`
5. Review parity diagnostics:
   - `/api/meta-pixel/diagnostics`

### Remaining
- Add optional per-integration pixel binding UI if you want page/form-level pixel split.

## 2026-03-30 - Runtime Stability + Diagnostics Pass

### What was inspected
- Poller crash trace path from startup logs (`google-forms-poller`)
- Meta CAPI error propagation (`meta-conversions`, `meta-capi-processor`)
- Frontend Next root warning trigger (`frontend/next.config.ts`)

### What was changed
- Prevented unhandled poller-cycle failures from terminating backend process:
  - `src/workers/google-forms-poller.ts`
- Silenced Next workspace-root warning via explicit trace root:
  - `frontend/next.config.ts`
- Improved Meta CAPI operator-facing error clarity for known non-retryable Graph case (`100/33`):
  - `src/services/meta-conversions.ts`

### Commands run
- `npm run typecheck`
- `npm run typecheck:frontend`
- `npm test`

### Outcomes
- All checks passed.
- Non-retryable Meta CAPI misconfiguration is now easier to identify from logs.
- Google Forms poller is retry-safe during DB unavailability.

### Remaining risks
- Meta Business asset/token mismatch must be corrected outside code.
- Poller resilience does not replace DB health checks; it only prevents process crash.

### Next exact action
1. Validate Meta Pixel ownership and token permissions in Business Manager.
2. Re-send a single CAPI test event and confirm `delivered`.

## 2026-03-30 - Temporary Tracking Disable

### What was inspected
- Tracking backend wiring (`src/index.ts`, `src/config/env.ts`)
- Tracking frontend entrypoints (`layout.tsx`, `settings/page.tsx`, `nav-shell.tsx`)

### What was changed
- Introduced feature flags for temporary disable:
  - Backend: `TRACKING_ENABLED` (default false)
  - Frontend: `NEXT_PUBLIC_TRACKING_ENABLED` (default false via helper check)
- Disabled tracking runtime paths under flags:
  - no `meta-capi`/`meta-pixel` route mount
  - no Meta CAPI worker startup
  - no Pixel bootstrap execution
  - tracking UI hidden/placeholder mode

### Commands run
- `npm run typecheck`
- `npm run typecheck:frontend`
- `npm test`

### Outcomes
- All checks passed.
- Tracking stack is now off by default on both backend and UI.

### Next exact action
1. Restart running dev processes.
2. Verify no new tracking events are generated.
- UI loading improvements completed with reusable circular spinner component (`frontend/components/loading-spinner.tsx`) and consistent button/inline loading indicators in main dashboard/auth flows.
