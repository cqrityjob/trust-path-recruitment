# Security Work supplier cycle — reuse map

Baseline 2026-11-22: main `77c61119` (#501 and #502 merged). Production ledger:
408 rows ending `20270329090000`. The table below is what the supplier cycle
(technical vision plan v1, stages A–C) builds on, and the concrete gap for
each existing function.

| Existing function | Reused / extended | Concrete gap closed by this delivery |
| --- | --- | --- |
| Observations: monitoring items (`sw_intelligence_items`), feed items and impact briefs (`sw_change_briefs`), manual sources | Reused as the start of the cycle | A documented decision on the observation (investigate, remediate, defer with date, accept risk, no action) |
| Assets (`sw_protected_assets`, categories incl. `systems`, `facilities`, `suppliers`) | Reused; a supplier **is** an asset of category `suppliers` | Supplier profile (internal owner, contact route, services, active/ended) without a second supplier identity |
| Risk–asset links (`sw_risk_assets`) | Extended | Impact status per link: unconfirmed / confirmed / ruled out, stamped by who checked it |
| — | New: `sw_asset_dependencies` | Typed, FK-safe relations between assets (supplied by, depends on, located at, runs on), with confirmation |
| Actions (`sw_actions`) | Reused as **the** action; no second action engine | Supplier requests hang off an action; the action cannot be completed while a request is unverified, unless an approver documents a deviation |
| Approval right (`can_approve`) | Reused as the verifier right | Separate-verifier rule for critical requests |
| Memberships | Extended | Explicit external sharing right (`can_share_external`): only it can approve what leaves the platform |
| Evidence (`sw_sources`, `sw_evidence_links`) | Reused for response attachments | Responses reference sources in the same workspace |
| Restricted missions (#502: `can_see_record`, durable audit scope) | Reused | Requests, responses, shares, verifications, decisions and their audit follow the action's mission scope |
| Audit (`record_change`, `sw_audit_events`) | Reused | Request events are append-only and idempotent per operation |
| Management reports | Reused unchanged | Supplier review reports are computed live from visible data, so a restricted record never gets copied |
| AI (`processing/ai.server.ts`, Anthropic, activations, budgets) | Kept | A typed task interface and adapter seam (stage D prep); the core cycle never needs AI |

Not built here (stage E or later): authenticated supplier portal, automatic
mail, contract interpretation by AI, a second AI provider.
