# Pre-#45 production fingerprint — hosted zrah

Captured **2026-08-19 11:46:57 UTC**, immediately before the first #45 hosted
write, against `zrahptwsnjcdyzfywbeh`.

**This is not PITR and is not a platform backup.** No Supabase management
credential exists in the delivery environment and the Lovable MCP surface
exposes no backup, restore or snapshot tool, so platform-level recovery could
not be independently verified. The owner accepted that risk on 2026-08-19 and
approved this logical capture as the recovery baseline for this change.

WAL archiving was observed active on the instance (`archive_mode = on`,
`archive_command = /usr/bin/admin-mgr wal-push … wal-g`, `wal_level = logical`).
That shows the backup plumbing runs; it proves nothing about PITR being enabled,
a restorable base backup existing, or the retention window. It is recorded as an
observation, not as confirmation.

## Recovery rule

If a migration fails partially or produces unexpected state: do not edit the
hosted ledger, do not `db push`, do not improvise SQL. Compare hosted state
against this document and remediate with a new forward migration.

## Ledger and governance

|                                       |                  |
| ------------------------------------- | ---------------- |
| ledger max version                    | `20260819112914` |
| ledger rows                           | 102              |
| live `closed_test` grants             | **0**            |
| review gates approved (sg-b-\*)       | **0**            |
| review requirements not `outstanding` | **0**            |

## Schema and ACL state

```json
{
  "complete_human_review_signatures": [
    "_review_id uuid, _outcome text, _rationale text, _contribution numeric, _safety_severity text"
  ],
  "review_queue_out_columns": [
    "review_id",
    "attempt_id",
    "trigger_reason",
    "opened_at",
    "participant_ref",
    "organisation_name",
    "assessment_name",
    "assessment_slug",
    "governance_mode",
    "validation_status_at_assignment",
    "purpose_code",
    "item_display_order",
    "item_scenario",
    "item_prompt",
    "is_safety_critical",
    "severity_required",
    "item_format",
    "response_text",
    "chosen_label",
    "chosen_best_label",
    "chosen_worst_label",
    "outstanding_in_attempt"
  ],
  "evidence_columns": {
    "contribution": "numeric",
    "review_status": "text",
    "safety_severity": "text",
    "is_safety_critical": "boolean"
  },
  "evidence_check_constraints": [
    "scp_competency_evidence_confidence_check",
    "scp_competency_evidence_context_type_check",
    "scp_competency_evidence_contribution_check",
    "scp_competency_evidence_disclosure_class_check",
    "scp_competency_evidence_provenance_type_check",
    "scp_competency_evidence_review_status_check",
    "scp_competency_evidence_safety_severity_check",
    "scp_evidence_context_pair",
    "scp_evidence_not_self_superseding",
    "scp_evidence_safety_is_specified",
    "scp_evidence_supersession_complete"
  ],
  "scp_review_rubric_scores_exists": false,
  "acls": {
    "scp_complete_human_review(numeric) authenticated": true,
    "scp_complete_human_review(numeric) anon": false,
    "scp_review_queue authenticated": true,
    "scp_review_queue anon": false,
    "scp_compute_maturity authenticated": false,
    "scp_attempt_maturity authenticated": false,
    "scp_display_evidence_state authenticated": false,
    "scp_attempt_evidence_state authenticated": false
  },
  "rls_policy_counts": {
    "scp_attempts": 2,
    "scp_candidate_responses": 2,
    "scp_competency_evidence": 2,
    "scp_human_reviews": 1,
    "scp_report_snapshots": 2
  },
  "row_counts": {
    "scp_competency_evidence": 4,
    "scp_human_reviews": 1,
    "scp_attempts": 2,
    "scp_report_snapshots": 2,
    "sg_item_versions": 18
  },
  "function_fingerprints_md5": {
    "scp_complete_human_review(uuid,text,text,numeric,text)": "9b97fb55698ac31926dc86293e5af959",
    "scp_review_queue(text)": "6f415875c5724981bee1b284a9944142",
    "scp_compute_maturity(...)": "8a232e00e78d2f74b61e098e679658a9",
    "scp_attempt_maturity(...)": "4554405d0d8f436638bc45406cf3df31",
    "scp_display_evidence_state(...)": "d8a230dcc95a9cf92239f75ec62c8839",
    "scp_attempt_evidence_state(...)": "5937668e0fb1c03515a6eee0f63de2a8",
    "scp_release_attempt_report(uuid)": "34f36bd2afd194463c5de14c2941f392",
    "scp_guard_evidence_append_only()": "89a81ce2521e0c15de12a7b6cc691440"
  }
}
```

## SG v1 content state

```json
{
  "behaviour_competency_map": {
    "situational_judgement": "SCC-03",
    "proportional_decision_making": "SCC-04",
    "mandate_and_escalation": "SCC-09",
    "operational_communication": "SCC-06",
    "de_escalation": "SCC-05",
    "factual_reporting": "SCC-11",
    "integrity_and_information_handling": "SCC-01",
    "operational_coordination": "SCC-08"
  },
  "role_competency_map_security_guard_se": [
    "SCC-01",
    "SCC-03",
    "SCC-04",
    "SCC-05",
    "SCC-06",
    "SCC-08",
    "SCC-09",
    "SCC-11"
  ],
  "item_competency_ids": {
    "sg-b-01": "SCC-03",
    "sg-b-02": "SCC-03",
    "sg-b-03": "SCC-04",
    "sg-b-04": "SCC-04",
    "sg-b-05": "SCC-09",
    "sg-b-06": "SCC-09",
    "sg-b-07": "SCC-06",
    "sg-b-08": "SCC-06",
    "sg-b-09": "SCC-05",
    "sg-b-10": "SCC-05",
    "sg-b-11": "SCC-08",
    "sg-b-12": "SCC-01",
    "sg-b-13": "SCC-04",
    "sg-b-14": "SCC-05",
    "sg-b-15": "SCC-09",
    "sg-b-16": "SCC-11",
    "sg-b-17": "SCC-11",
    "sg-b-18": "SCC-01"
  },
  "language_scope": ["sv-SE"],
  "adaptation_statuses": { "adaptation_pending": 36 },
  "legal_basis_required/legal_review_status": {
    "sg-b-02": "false/not_required",
    "sg-b-04": "true/pending",
    "sg-b-05": "true/pending",
    "sg-b-06": "true/pending",
    "sg-b-15": "false/not_required",
    "sg-b-18": "false/not_required"
  },
  "bestworst_display_order": {
    "sg-b-13": { "A": 1, "B": 2, "C": 3, "D": 4 },
    "sg-b-14": { "A": 1, "B": 2, "C": 3, "D": 4 },
    "sg-b-15": { "A": 1, "B": 2, "C": 3, "D": 4 }
  },
  "sg_b_03_option_a_labels": {
    "sv-SE": "Tala lugnt med personen och erbjud att hen lämnar frivilligt.",
    "en-GB": "Speak calmly and offer the person a voluntary exit."
  }
}
```
