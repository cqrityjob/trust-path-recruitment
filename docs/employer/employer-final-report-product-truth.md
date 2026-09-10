# The employer final report — what is true, state by state

Written for #216 (E4 CUTOVER) as the product-truth record the UI, the guards
and the PR description all have to agree with. Every claim here was read off
the current schema, the governed RPCs and the routed application on
`claude/interview-report-sharing-e4`; nothing is aspirational.

---

## 1 · What clicking "Finalise" actually means

**It means: an authorised recruitment owner locked this basis as the record.**
It does **not** mean the owner authored or approved a conclusion.

This distinction is not cosmetic, and it is easy to get wrong when reading the
screen quickly. What the product persists is:

| Persisted human judgement                        | Where                                                 | Who may write it                                                                                 | Present when                                         |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| One interpretation per assessor, per requirement | `scp_interview_assessments`                           | any case member with write access                                                                | always, once assessed                                |
| A **panel** conclusion, free text                | `scp_interview_panels.conclusion`                     | `scp_iv_panel_conclude`, gated on `scp_iv_can_write_case` — **any case member**, not owner/admin | only when a panel was opened, revealed and concluded |
| The finalisation act                             | `scp_interview_reports.finalised_by` / `finalised_at` | `scp_iv_finalise_previewed_report`, gated on `ARRAY['owner','admin']`                            | on every final version                               |

### The findings

1. **There is no server-owned, persisted recruitment-owner conclusion.** The
   only conclusion the model holds is the _panel's_, and the panel concluder
   and the report finaliser are gated on **different** roles — a member may
   conclude, only an owner or admin may finalise. They need not be the same
   person, and the schema does not require them to be.
2. **A case without a panel carries no human conclusion at all.**
   `payload.panel` is `null`, and the report is then exactly what it says it
   is: confirmed evidence plus each assessor's own interpretation.
3. **What does exist is bound properly.** The panel conclusion, its
   `concluded_by` and its `concluded_at` are inside `scp_iv_build_report_basis`,
   so they are covered by the basis hash, the content hash and the immutable
   payload. Actor and timestamp for the finalisation itself are server-derived
   from `auth.uid()` and `now()`.
4. **Correction creates a new version** — supersede plus increment, with the
   previous version kept byte-identical and readable.
5. **No correction reason is persisted for a report version.**
   `supersede_reason` exists on `scp_interview_assessments`; there is no
   equivalent column on `scp_interview_reports`. A reader of version 2 cannot
   learn from the record _why_ version 1 was superseded.

### What this branch therefore does and does not do

The UI already describes the truth: _"This is what finalising does — the basis
is frozen exactly as it stands now; a numbered version is created and cannot be
changed afterwards; who finalised and when is recorded; the report stays
readable."_ It nowhere says the owner authored a conclusion, and the panel's
prose is labelled "Panel conclusion" / "Panelens slutsats", never "the owner's
conclusion".

**Not invented here:** no owner-conclusion field in client state, no implication
in copy that the report contains one, and no migration in #216.

### Limitations A, B and C — stated, not invented, and not migrated in #216

These are the three capabilities the review asked about. Each one is **absent
from the schema today**. None of them is a defect introduced by #216, none is
worked around in the UI or in client state, and **none of them is implemented
through a migration in #216**. Each is future **schema-first** work: a column and a
governed RPC first, reviewed on its own, and only then a screen.

#### A · A recruitment-owner-authored conclusion

**Does not exist.** There is no column on `scp_interview_reports`, and no RPC
argument, that carries prose written by the finalising owner. Finalising is an
act of locking, not of authoring.

- _Consequence today:_ the report is an evidence-and-assessor document that an
  authorised owner freezes as the employer record. It is not a document the
  owner writes.
- _Why not here:_ it needs a new column inside the hashed basis, a governed
  write RPC, a role rule, and a decision about whether an owner conclusion may
  be corrected without minting a new version. That is a schema change with its
  own review, not a line in a CUTOVER PR.
- _What is forbidden meanwhile:_ inventing one in UI copy or client state.
  Asserted by `employer-final-report:check` 15.1–15.5.

#### B · The role and governance of the panel conclusion

**Exists, but is governed differently from finalisation.**
`scp_iv_panel_conclude` is gated on `scp_iv_can_write_case` — **any case
member**. `scp_iv_finalise_previewed_report` is gated on
`ARRAY['owner','admin']`.

- _Consequence today:_ the human who wrote the conclusion carried in the report
  may not be the human who locked it, and the schema does not require them to
  be. Both identities are recorded — `concluded_by` inside the hashed basis,
  `finalised_by` on the version — so a reader can always see the difference.
- _Why not here:_ tightening who may conclude is a **governance decision about
  how a panel works**, not a code tidy. Narrowing it silently would break
  existing cases whose conclusion was written by a member.
- _What is true meanwhile:_ the prose is labelled "Panel conclusion" /
  "Panelens slutsats", never as the owner's. Asserted by 15.3.

#### C · A persisted correction reason for a new report version

**Does not exist.** `supersede_reason` is a column on
`scp_interview_assessments`. `scp_interview_reports` has no equivalent.

- _Consequence today:_ correction works — supersede plus increment, with the
  previous version kept byte-identical and readable — but a reader of version 2
  cannot learn from the record **why** version 1 was superseded.
- _Why not here:_ a column plus an RPC argument plus a decision about whether
  the reason belongs inside the hashed basis (and therefore changes the digest)
  or beside it. Schema-first, with its own review.
- _What is forbidden meanwhile:_ collecting a reason in the UI and discarding
  it, which would tell an owner their explanation was recorded when nothing
  persisted it.

All three are stated here so the owner can decide whether the pilot needs them
before the interview product goes further.

---

## 2 · Product-truth table: the complete report journey

Columns are: **source** (what is authoritative) · **audience** · **what the user
is told** · **primary CTA** · **destination** · **blocks** · **loading** ·
**refused** · **failed** · **empty** · **persisted** · **immutable/versioned**.

`R` = `scp_iv_report_blockers` · `P` = `scp_iv_preview_report` ·
`F` = `scp_iv_finalise_previewed_report` · `B` = `scp_iv_final_report` /
`scp_iv_report_version` / `scp_iv_report_versions` · `C` =
`scp_iv_candidate_interview_detail`.

### 1 · Preparation

Source `scp_iv_*` case reads · employer owner/member · what the interview will
cover and against which requirements · **Approve the plan** · the case's own
prepare route · approval is withheld while `contextIsUsable` is false · skeleton,
never an empty plan · own sentence + no retry (a decision) · own sentence + retry
(an outage) · "no plan yet", offered as an action · persisted
(`scp_interview_prep_plans`) · versioned by supersede, not immutable.

### 2 · Interview

Source live session rows · employer · which question is open and what has been
noted · **Next question** (guarded by an explicit note flush) · same case · an
unsaved note blocks leaving · per-panel skeleton · refusal sentence · failure
sentence + retry · "nothing noted yet" · persisted
(`scp_interview_session_notes`) · not versioned; notes are append-and-correct.

### 3 · Evidence review

Source `scp_interview_evidence` + sources · employer · which material has been
confirmed, and from where · **Confirm as material** · the same question · a
question with no confirmed material blocks a substantive level · skeleton ·
refusal sentence · failure sentence · "no confirmed material", with a route to
fix it · persisted · append-only; corrections are new rows.

### 4 · Human assessment

Source `scp_interview_assessments` · employer · each assessor's level, rationale
and uncertainty · **Record assessment** · same question · no confirmed evidence
⇒ no substantive level · skeleton · refusal · failure · "not assessed yet" ·
persisted · **superseded, never edited** — `supersede_reason` required, and
in-place edits are refused (`SCP_IV_ASSESSMENT_EDITED_IN_PLACE`).

### 5 · Outstanding material

Source `scp_interview_findings` (open / needs_verification /
unresolved_difference) · employer · what is still open and why it matters ·
**Resolve** · the finding's own question · **open findings are a finalisation
blocker via `R`** · skeleton · refusal · failure · "nothing open" · persisted ·
state transitions, not versions.

### 6 · Report basis ready

Source `R` · employer · that the basis is complete and what remains · **Preview
the report** · same case, `s-preview` · any blocker from `R`, named · skeleton ·
refusal · failure · a case with **zero requirements** is never "ready" · derived,
not persisted · n/a.

### 7 · Exact preview

Source **`P`** — the server's own builder, the same one finalisation calls ·
employer owner/admin · the complete document exactly as it would be locked,
with basis hash and content hash under audit details · **Finalise** · `F`, sent
`previewInHand.basisHash` · finalise disabled until a preview is in hand ·
"previewing…" with the CTA busy · `SCP_IV_NOT_CASE_MEMBER` → refusal sentence ·
failure sentence, preview not claimed · a preview is never empty; blockers are
reported as blockers · **not persisted** — deliberately, so it cannot drift ·
n/a.

### 8 · Stale preview

Source `F` raising `SCP_IV_STALE_PREVIEW` · employer · that the basis moved
since the preview and nothing was written · **Preview again** · a fresh `P` ·
the finalise CTA is **withdrawn** · n/a · n/a · n/a · n/a · **nothing is
persisted — no insert, no supersede, no version increment** · n/a.

### 9 · Finalising

Source `F` in flight · employer · that the irreversible act is running ·
disabled · n/a · duplicate submission prevented by the busy state · CTA busy ·
`SCP_IV_FINALISE_ROLE` → refusal · failure sentence, and the outcome does **not**
claim success · n/a · the write is in progress · n/a.

### 10 · Written but readback not yet confirmed

Source `F` returned + `B` has not verified · employer · **that the irreversible
work succeeded and must not be repeated**, and to look again · re-read · same
case · nothing further offered · n/a · n/a · n/a · n/a · persisted (the report
exists) · immutable already.

### 11 · Verified final report

Source **`B`**, which recomputes the digest from the stored payload · employer ·
the immutable document, its version number, the named finaliser, the date, and
that the digest recomputed and matches · none — reading is the act ·
`fr-*` document · n/a · skeleton · "you are not permitted to read this — **and
that does not mean no report exists**" · "the read failed" + retry · never
rendered as "no report" · persisted · **immutable and versioned**.

### 12 · Integrity verification failed

Source `B` with `hash_verified = false` · employer · an announced `role="alert"`:
the stored digest and the stored basis disagree; do not use as decision support
until somebody has looked · none · n/a · the document is **not** presented as
trustworthy · n/a · n/a · n/a · n/a · persisted · immutable.

### 13 · Superseded report version

Source `scp_iv_report_version(report_id)` · employer · "Earlier version —
superseded" / "Tidigare version — ersatt", with its own finaliser and date ·
**Back to the current version** · the current report · n/a · skeleton ·
refusal · failure · n/a · persisted · **immutable**; a correction added a new
version and left this one byte-identical.

### 14 · No report

Source `B` returning no row · employer · that no report has been finalised yet ·
**Preview** · `s-preview` · n/a · skeleton — never "none" while loading · n/a ·
n/a · this is the **only** state entitled to say "no report" · n/a · n/a.

### 15 · Read refused

Source `42501` / `PGRST301` / `PGRST116` · employer · a permission decision —
**and explicitly not evidence that no report exists** · **no retry** (retrying
cannot change a decision) · n/a · n/a · n/a · n/a · n/a · **never rendered as
empty or absent** · n/a · n/a.

### 16 · Read failed

Source any other error · employer · the read failed, said plainly · **Retry**
(retrying could change it) · n/a · n/a · n/a · n/a · n/a · **never rendered as
empty or absent** · n/a · n/a.

### The invariant across 15 and 16

No failed or refused read may be rendered as **zero**, **absent**, **no
report**, **standalone interview**, **no advertised role** or **no assessment**.
This is enforced in three layers: the outcome unions have no path from an error
to `none`; `employer-final-report:check` and `interview-context-governance:check`
assert it; and negative controls restore each collapse in turn and require the
guard to fail with the matching diagnostic.

---

## 3 · The candidate's side of the boundary

| The candidate page shows                           | The candidate page does **not** show         |
| -------------------------------------------------- | -------------------------------------------- |
| Which organisation is interviewing, for which role | Employer interview assessments               |
| Which of their material is in use, and from where  | Interviewer notes                            |
| That AI proposes and a human confirms              | **The employer final report**                |
| Who can reach the material                         | Any interview summary — **none is promised** |
| Retention, or plainly that none is set             |                                              |
| Where to correct a factual error                   |                                              |

**Finalising an employer report shares nothing with the candidate.** The
candidate surface reads no finalised report and now says so in both languages.

**E2 is separate and unaffected.** The assessment **result** is a different,
genuinely governed document with its own release path
(`scp_release_attempt_report`), shared only when a person at the employer
decides to. Nothing in the interview boundary promises or denies it, and a
guard assertion forbids copy that would deny it.

---

## 4 · The legacy compatibility window — an owner risk-acceptance item

During CUTOVER the database carries **two** finalisation contracts:

| Contract                           | Shape              | Preview-bound?                                                         |
| ---------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `scp_iv_finalise_previewed_report` | 3 args, 0 defaults | **yes** — refuses `SCP_IV_PREVIEW_REQUIRED` and `SCP_IV_STALE_PREVIEW` |
| `scp_iv_finalise_report` (legacy)  | 2 args, 1 default  | **no** — md5, no basis hash, no stale check                            |

The legacy function must stay until #216 is published, because the currently
deployed bundle still calls it. **While it remains executable by
`authenticated`, preview binding is a property of the new application path, not
a universal database guarantee.** This PR does not claim otherwise.

What keeps this honest rather than hidden: legacy versions carry
`content_hash_algorithm IS NULL`, and the governed readback labels them **md5**
and verifies them **as md5**. They are never described as preview-bound or as
SHA-256 verified.

**This is an explicit owner risk-acceptance item before merge.**

The CONTRACT step — dropping the legacy function — remains **NOT SCHEDULED**
and absent from #216. It may begin only after: #216 is merged; Lovable
publishes the CUTOVER bundle; the served bundle is proven to call only
`scp_iv_finalise_previewed_report`; a real authorised preview → finalise →
verified readback succeeds; no legacy call remains or is observed; and the
owner explicitly approves that migration. See
`docs/release/scp-iv-finalise-report-contract-cleanup.md`.
