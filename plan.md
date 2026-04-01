# Lead Transfer Platform — Production Roadmap

## Product Direction

Build a production-grade automation platform in the category of Albato / n8n / Yuboraman-style services:
- connect traffic sources (Meta Lead Ads first, then others)
- transform and route leads/events
- deliver to destination CRMs (Bitrix24, AmoCRM, others)
- track every event/attempt with operational logs and business analytics
- support triggers, actions, and conversion/event flows
- support Meta Pixel + Conversions API hybrid tracking (browser + server)

This roadmap is for a commercial platform, not an MVP.

---

## Current Baseline (already validated)

- Meta Lead Ads webhook ingestion works.
- Queue + worker processing works.
- Bitrix24 lead delivery works in real flow.
- Lead lifecycle statuses are persisted (`pending/processing/delivered/failed/dlq/...`).

This baseline is the foundation for scale-out.

---

## Guiding Principles

1. Reliability first: at-least-once delivery, idempotency keys, deterministic retries, DLQ.
2. Tenant isolation: strict user/workspace boundaries in auth, data, queues, and logs.
3. Auditability: every state transition and outbound request is traceable.
4. Extensibility: source adapters and destination adapters stay decoupled.
5. Safe operations: observability, replay tools, runbooks, and controlled rollout.

---

## Phase 1 — Core Platform Hardening (Now)

- [ ] Canonical webhook route policy (single public callback URL + compatibility strategy).
- [ ] Enforce deterministic source matching:
  - [ ] `source_page_id`
  - [ ] optional `source_form_id`
  - [ ] stable precedence rules when multiple bridges exist.
- [ ] Retry/DLQ hardening:
  - [ ] regression tests for job-id replay path
  - [ ] manual replay tooling for DLQ.
- [ ] Secrets hygiene:
  - [ ] token rotation playbook
  - [ ] secrets masking in logs and diagnostics.
- [ ] Rate limiting and abuse protection:
  - [ ] auth routes
  - [ ] webhook routes.

Exit criteria:
- no known blocking reliability bugs in lead ingestion/delivery path
- reproducible replay for failed leads
- zero plaintext secret leakage in logs

---

## Phase 2 — Workflow Engine (Triggers & Actions)

- [ ] Introduce workflow entities:
  - [ ] Trigger (source event)
  - [ ] Action (destination operation)
  - [ ] Step (transform/filter/branch)
  - [ ] Workflow versioning.
- [ ] Trigger catalog (initial):
  - [ ] Meta Lead Created
  - [ ] Telegram Lead Received (planned)
  - [ ] Webhook Catcher (generic).
- [ ] Action catalog (initial):
  - [ ] Create Lead in Bitrix24
  - [ ] Create Lead in AmoCRM
  - [ ] Send Telegram notification
  - [ ] HTTP request action (generic).
- [ ] Field mapping UX contract:
  - [ ] source schema introspection
  - [ ] destination schema introspection
  - [ ] drag-and-map experience with defaults and validation.
- [ ] Basic logic blocks:
  - [ ] filter
  - [ ] IF/ELSE branch
  - [ ] value transform (concat, normalize phone/email/date).

Exit criteria:
- one trigger can fan out to multiple actions with per-step status logs
- workflow version is immutable after publish

---

## Phase 3 — Meta Marketing API + Conversions API

- [ ] Marketing API operational layer:
  - [ ] lead retrieval resilience and permissions diagnostics
  - [ ] page/app/token validity checks surfaced in UI.
- [ ] Conversions API module:
  - [ ] event model (`event_name`, `event_time`, `event_id`, `action_source`, `user_data`, `custom_data`)
  - [ ] dedup strategy with browser events (`event_id` parity)
  - [ ] test-event mode and diagnostics.
- [ ] Meta Pixel module (browser-side):
  - [ ] Pixel connection UX (per tenant/workspace)
  - [ ] pixel_id + token/config storage with masking
  - [ ] standard browser events (e.g. `PageView`, `Lead`, `CompleteRegistration`) wiring
  - [ ] event_id generation strategy shared with server-side CAPI for dedup
  - [ ] Pixel diagnostics (last events, rejected events, mismatch warnings).
- [ ] Conversion workflows:
  - [ ] map CRM outcomes (qualified/deal/won) -> Meta conversion events
  - [ ] configurable attribution windows and event priorities.
- [ ] Compliance controls:
  - [ ] PII hashing requirements for Conversions API user_data
  - [ ] retention policy for sensitive payload segments.

Exit criteria:
- Pixel + CAPI events sent successfully with dedup-capable payloads
- clear observability per event and per ad account/page context

---

## Phase 4 — Analytics & Targetologist Dashboard

- [ ] Event ledger model:
  - [ ] inbound event
  - [ ] workflow step attempts
  - [ ] destination responses
  - [ ] final outcome and latency.
- [ ] KPI dashboard:
  - [ ] leads received, delivered, failed, DLQ
  - [ ] conversion counts and rates
  - [ ] cost per lead / cost per conversion inputs
  - [ ] source/page/form/ad breakdown.
- [ ] Funnel analytics:
  - [ ] lead -> CRM lead -> deal stages
  - [ ] drop-off points and error categories.
- [ ] Operational analytics:
  - [ ] retry rates
  - [ ] top failure signatures
  - [ ] SLA by connector.

Exit criteria:
- marketer can diagnose campaign-to-CRM delivery health and economics from one dashboard

---

## Phase 5 — Multi-Service Expansion

- [ ] Additional sources:
  - [ ] Telegram Ads / bot lead capture
  - [ ] generic webhook sources
  - [ ] additional ad platforms (as adapters).
- [ ] Additional destinations:
  - [ ] full AmoCRM parity
  - [ ] extensible CRM SDK contract for new connectors.
- [ ] Template library:
  - [ ] prebuilt recipes (Meta -> Bitrix, Meta -> AmoCRM, Meta -> Telegram + CRM).

Exit criteria:
- onboarding to first successful automation in < 10 minutes for common templates

---

## Phase 6 — Management Panels (Admin/Ops)

- [ ] Admin panel:
  - [ ] tenant/user management
  - [ ] connector health overview
  - [ ] abuse and quota controls.
- [ ] Support/Ops panel:
  - [ ] per-lead trace viewer
  - [ ] replay controls
  - [ ] incident annotations.
- [ ] Billing hooks (if enabled later):
  - [ ] usage metering by tasks/events
  - [ ] plan quotas.

Exit criteria:
- support team can resolve delivery incidents without database access

---

## Non-Functional Requirements (Cross-Phase)

- [ ] SLO targets and alerting (ingestion latency, delivery success, queue lag).
- [ ] Structured logs + correlation IDs per lead/workflow run.
- [ ] Metrics + tracing for API, queue workers, adapters.
- [ ] Backpressure controls and per-tenant throttling.
- [ ] Blue/green or canary rollout strategy for risky connector changes.
- [ ] Security baseline:
  - [ ] encrypted credentials at rest
  - [ ] least-privilege access
  - [ ] secret rotation protocol
  - [ ] audit trails.
- [ ] Tracking integrity baseline:
  - [ ] browser/server event dedup correctness
  - [ ] event schema validation before dispatch
  - [ ] replay protection for conversion events.

---

## Suggested Delivery Order (Next 6–8 Weeks)

1. Phase 1 completion (hardening + tests + route/policy cleanup)
2. Phase 2 minimal workflow engine (trigger -> action -> logs)
3. Phase 3 Conversions API initial release
4. Phase 4 analytics v1
5. Phase 5 connector expansion kickoff

---

## Definition of Ready for “Production Platform” Claim

- Real customer workloads can run with predictable retries and audit logs.
- On-call can diagnose and replay failures quickly.
- Core Meta -> CRM bridge and Conversions API are both stable.
- Dashboard exposes both operational health and marketing outcomes.
- Security, tenancy, and observability controls are in place and tested.
