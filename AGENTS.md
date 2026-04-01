# AGENTS.md

## Project Identity

This repository is a production-grade multi-tenant lead transfer service.

Primary goal:
- receive inbound leads from external sources, starting with Facebook Lead Ads
- process them reliably
- deliver them to destination CRMs, starting with Bitrix24 and AmoCRM
- provide operational visibility, retries, and safe failure handling

This is not an MVP toy project.
Every change must preserve production readiness, reliability, and extensibility.

---

## Product Scope

### Current source systems
- Facebook Lead Ads

### Planned / adjacent source systems
- Telegram leads
- additional ad / form sources later through adapter architecture

### Current destination systems
- Bitrix24
- AmoCRM

### Core product requirements
- multi-user
- multi-tenant
- multi-page
- multi-form
- reliable webhook ingestion
- queue-based processing
- retry and DLQ behavior
- delivery observability
- secure credentials handling
- future-ready adapter architecture

---

## Current Known State

Assume the following already exists in the repository unless inspection proves otherwise:

- JWT auth with access + refresh tokens
- logout and logout-all flows
- integrations CRUD
- leads API
- Facebook lead fetch service
- Bitrix24 delivery service
- CRM adapter abstraction
- AmoCRM adapter
- Telegram notification service
- lead processor worker
- tests already passing in prior phase

Operational history from previous work:
- Bitrix24 real lead delivery already worked once
- Facebook webhook verification/subscription path was reached
- Facebook real Lead Ads end-to-end test was not fully closed yet

Important:
there may be inconsistency between these possible webhook shapes:
- `/webhooks/facebook/:integrationId`
- `/webhooks/facebook`

Never assume which one is correct. Inspect the actual code first.

---

## Non-Negotiable Engineering Rules

### 1. Do not rewrite working systems
If a module is already correct, leave it alone.
Prefer targeted, minimal diffs over refactors.

### 2. Inspect before changing
Before writing code:
- read the relevant files
- trace the current request flow
- verify route registration
- verify schema usage
- verify environment variable names actually used in code

### 3. Preserve architecture direction
This codebase should evolve toward:
- source adapters
- destination adapters
- queue-based processing
- clean service boundaries
- minimal coupling between ingestion and delivery

### 4. Reliability over cleverness
Prefer:
- explicit error handling
- deterministic logging
- idempotent processing
- retry-safe operations
- observable failure states

### 5. Production safety first
Do not introduce:
- destructive migrations without necessity
- credential leaks
- silent catch blocks
- breaking route changes
- unbounded retries
- unsafe background loops
- broad refactors during incident-prone work

---

## Security Rules

### Credentials
- Never hardcode secrets
- Never commit tokens or webhook URLs
- Never print full secrets in logs
- Mask secrets in debug output
- Use env variables and existing encryption utilities where applicable

### Transcript exposure rule
Previous chat transcripts may contain exposed secrets.
Treat any tokens or webhook URLs seen in transcripts as compromised.
Do not reuse them.
Assume they must be rotated.

### PII handling
Lead payloads may contain:
- name
- phone
- email
- CRM-related custom fields

Rules:
- store only what is required
- avoid verbose raw payload logging unless necessary
- redact or limit sensitive fields in logs where possible

---

## Database and Migration Discipline

- Do not create schema churn without need
- Do not rename stable columns casually
- Do not change existing production semantics unless required
- If schema changes are needed, make them forward-safe and explicit
- Keep migrations small and reversible in intent
- Never drop data to “clean things up”

---

## Execution Protocol for Agents

For any task, follow this order:

### Step 1 — Repository audit
Inspect:
- app entrypoints
- route registration
- webhook handlers
- integration schema / model
- queue / worker entrypoints
- CRM adapter factory
- Facebook service
- Bitrix24 service
- AmoCRM service
- tests and scripts

### Step 2 — Confirm actual behavior
Document:
- active webhook paths
- how integrations are looked up
- which env vars are required
- how `source_page_id`, `source_form_id`, and page access token are used
- how retry / DLQ behavior currently works

### Step 3 — Change only the narrowest layer needed
Examples:
- if webhook verification fails, fix only verification path
- if worker cannot resolve integration, fix lookup path
- if Graph fetch fails, fix token/source resolution
- if delivery fails, fix adapter or mapping layer

### Step 4 — Re-run quality gates
After every meaningful change, run relevant checks.

Minimum gates:
- typecheck
- tests
- affected flow verification

### Step 5 — Write down operational result
Always leave behind:
- what changed
- what remains
- how to test it
- any env vars or manual platform steps required

---

## Code Style Expectations

### General
- prefer explicit names over short clever names
- prefer small focused functions
- avoid speculative abstraction
- do not duplicate business logic across adapters
- keep controllers thin
- keep services responsible for domain logic
- centralize integration-specific behavior into adapters/services

### Frontend Interaction Rules
- Do not use browser-native dialogs: `window.alert`, `window.confirm`, `window.prompt`.
- Do not rely on default browser form controls for product UI flows (plain native selects/checkboxes/radios with browser default rendering).
- Use project UI components for confirmations, prompts, filter save dialogs, toggles, selects, and similar interactions.
- Keep interaction patterns visually consistent with the existing design system.

### Errors
Use typed/domain-specific errors where helpful, especially for:
- Facebook auth/token issues
- Facebook API failures
- CRM auth failures
- CRM delivery failures
- retryable vs non-retryable classification

### Logging
Logs should help answer:
- did webhook arrive?
- was signature/verification valid?
- which integration was resolved?
- was lead fetched successfully?
- was dedup applied?
- was delivery successful?
- if failed, is it retryable?

Do not log secrets.

---

## Existing Architectural Intent to Preserve

### Ingestion flow
Expected direction:
1. webhook received
2. webhook validated
3. minimal event persisted or enqueued
4. worker fetches full lead data
5. lead normalized
6. dedup check applied if enabled
7. mapped payload delivered to CRM
8. delivery result stored
9. notifications sent if configured

### Adapter direction
Sources and destinations should remain separable.

Source-side concerns:
- webhook validation
- lead fetch
- normalization

Destination-side concerns:
- field mapping
- dedup support
- delivery
- destination-specific errors

---

## Facebook Integration Rules

### Must be supported
- webhook verification
- leadgen event ingestion
- lead fetch via Graph API
- page-level access token usage
- page/form-aware integration matching

### Do not assume
- that webhook contains full lead data
- that a single page has only one integration
- that one route format is already correct
- that token storage naming is consistent without inspection

### Manual E2E objective
The Facebook path is considered complete only when:
1. Meta sends a real leadgen webhook
2. the app accepts it
3. the app fetches full lead data from Graph
4. the worker processes it
5. Bitrix24 receives the lead successfully

---

## Bitrix24 / AmoCRM Rules

### Bitrix24
- preserve current working path if already proven
- avoid changing the delivery contract unless broken
- keep duplicate detection behavior explicit

### AmoCRM
- preserve adapter boundary
- keep OAuth/token refresh logic isolated
- do not entangle AmoCRM logic with Bitrix24-specific assumptions

---

## Testing Rules

### Before changing code
Identify:
- existing unit/integration tests
- missing coverage around the changed path

### After changing code
At minimum:
- run typecheck
- run tests
- test affected route/service manually if it is integration-heavy

### When adding tests
Prefer tests around:
- webhook verification
- webhook ingestion
- integration lookup
- Facebook lead fetch normalization
- retryability classification
- CRM adapter behavior
- worker success/failure paths

---

## Forbidden Behaviors

Do not:
- redesign the whole repo mid-task
- replace working modules because of style preference
- introduce hidden magic configuration
- bury business rules inside route handlers
- leak raw tokens in commits or logs
- delete migrations or historical files casually
- change API contracts without documenting it
- use transcript secrets as live credentials
- claim E2E is complete without a real Facebook lead test

---

## Priority Order

When choosing what to do next, use this order:

1. confirm repository state
2. resolve webhook route truth
3. finish Facebook Lead Ads E2E
4. stabilize diagnostics and error handling for that flow
5. document exact test steps
6. only then move to dashboard / UI / billing / broader product features

---

## Required Investigation Checklist

Before substantial edits, answer these:

- Which webhook routes are actually registered?
- Is Facebook verification GET handler present and working?
- Does POST webhook resolve by integration ID or page ID?
- Where is `source_page_id` stored?
- Where is page access token stored?
- Is `source_form_id` optional or enforced in runtime flow?
- How is `dest_credentials` stored and decrypted?
- Is dedup enabled in processor path or only in adapter path?
- Are retry and DLQ semantics truly wired, or only planned?
- What exact env vars are used by code right now?

---

## Required Output Discipline

For any task completed by an agent, leave behind concise documentation in repo artifacts such as:
- `STATUS_REPORT.md`
- `TEST_FACEBOOK_E2E.md`
- `IMPLEMENTATION_NOTES.md`

Each should contain:
- what was inspected
- what was changed
- commands run
- outcomes
- remaining risks
- next exact action

---

## Definition of Done

A task is done only when all are true:

- code aligns with current architecture
- typecheck passes
- relevant tests pass
- changed flow is manually verifiable
- no secrets are leaked
- documentation is updated
- no unrelated regressions introduced

For Facebook E2E specifically, done means:
- real Meta lead test reached CRM successfully
- logs clearly show each stage
- required manual steps are documented
- failure modes are understandable and actionable

---

## Final Working Attitude

Act like a production engineer continuing a live commercial integration product.

Be conservative.
Be explicit.
Be verifiable.
Prefer stable progress over impressive rewrites.

---

## Platform-Level Product Expansion (Non-MVP)

The platform direction now explicitly includes:
- Marketing API based lead ingestion and delivery
- Meta Pixel (browser tracking) integration
- Meta Conversions API event delivery with dedup-friendly semantics
- Trigger/Action workflow model (Albato/n8n class UX)
- Mapping UX for source fields to destination fields
- Lead-level and workflow-level observability
- Analytics dashboards for delivery + marketing economics
- Optional admin/management panels for multi-tenant operations

### Feature Priorities for Agents

When proposing or implementing new work, prioritize in this order:
1. existing lead bridge reliability (Meta -> queue -> CRM)
2. trigger/action workflow primitives
3. conversion event pipeline (CAPI)
4. observability and analytics
5. connector expansion (new sources/destinations)
6. admin/ops controls

### Workflow Engine Guardrails

Agents must preserve these design constraints:
- workflow definitions must be versioned and immutable after publish
- runtime executions must reference a concrete workflow version
- every step execution must have explicit status and error details
- replay/retry must be deterministic and auditable
- no hidden side-effects inside route handlers

### Field Mapping UX Expectations

Any changes around mapping must support:
- clear source schema and destination schema discovery
- explicit mapping table with validation
- transform functions that are testable and deterministic
- backward-compatible handling for unmapped optional fields

### Conversion API Requirements

For CAPI-related features, agents must enforce:
- explicit event model (`event_name`, `event_time`, `event_id`, `action_source`, `user_data`, `custom_data`)
- dedup-aware behavior with stable event identifiers
- clear retryability classification for API failures
- strict PII handling and hashing where applicable

### Pixel Requirements

For Pixel-related features, agents must enforce:
- explicit Pixel identity per tenant/workspace (`pixel_id` ownership clarity)
- browser event instrumentation that can share `event_id` with server-side CAPI
- diagnostics for browser/server mismatch (missing dedup key, event name mismatch, timestamp drift)
- safe configuration UX (no raw token leakage, masked secrets in logs/UI)
- clear fallback behavior when browser tracking is blocked (ad blockers/cookie restrictions)

### Analytics and Logging Requirements

Beyond current logs, future changes should move toward:
- per-lead correlation ID across ingestion, queue, worker, destination
- step-level execution timeline
- destination response fingerprinting (without secrets)
- dashboard-ready event ledger (received, transformed, delivered, failed, retried)

### Management Panel Readiness

If admin/support features are introduced, they must provide:
- tenant-aware trace view
- safe replay controls (scoped and audited)
- operational diagnostics without raw secret exposure

### Prohibited Shortcuts (Platform Scope)

Do not:
- add CAPI events without dedup/event-id strategy
- add Pixel events without cross-channel dedup plan (`event_id` parity with CAPI where needed)
- add workflow features without execution logs
- add analytics from lossy or non-auditable derived data only
- merge source and destination adapter responsibilities
- ship “magic mapping” without explicit user-visible rules
