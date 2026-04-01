# Platform UI Modules (LeadFlow Production)

## 1) Overview
Goal:
- Give operator an immediate health snapshot and fastest route to incidents.

Must include:
- KPI strip: received, delivered, failed, DLQ, avg delivery time
- Incident panel: latest failed runs/leads
- Quick actions: retry failed run, open integration health, dispatch test

## 2) Integrations
Goal:
- Connect and maintain source/destination bridges safely.

Must include:
- Meta page/form linkage status
- CRM auth status (valid/expired)
- Token health + expiry/re-auth action
- Test connection + structured diagnostics

## 3) Workflows
Goal:
- Author, version, publish, and dispatch workflows with confidence.

Must include:
- Workflow list with active/published markers
- Version history and published pointer
- Definition editor sections (trigger/actions/mapping)
- Dispatch test with run link in success response

## 4) Runs
Goal:
- Diagnose failures quickly and confidently.

Must include:
- Filterable run list
- Run detail with ordered steps
- Input/output/error payload viewer
- Clear retry/remediation affordance

## 5) Leads
Goal:
- Track every lead delivery lifecycle.

Must include:
- Lead table with status and attempts
- Source + integration context
- Raw/mapped snapshots where safe
- Error reason and retry visibility

## 6) Analytics
Goal:
- Give targetolog/operators actionable optimization data.

Must include:
- Breakdown by source/page/form/campaign
- Delivery rate and failure reason distribution
- Time-to-delivery trend
- Pixel/CAPI diagnostics (dedup health)

## 7) Visual System
Must define:
- typography scale
- spacing scale
- semantic colors
- status color mapping
- cards/tables/forms/timelines primitives

## 8) Interaction Standards
- Every table must support loading/empty/error states.
- Every async mutation must return visible feedback.
- Every critical failure must show next step action.
- Every deep detail screen must be linkable via route.
