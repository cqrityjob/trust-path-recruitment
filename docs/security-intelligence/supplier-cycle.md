# Security Work — the supplier cycle

From a change in the world to a decision, a responsible supplier or internal
owner and a verified improvement (technical vision plan v1, stages A–C).
Schema: `20270330090000` (#503). Application: the app PR that follows it.
Reuse map: [supplier-cycle-reuse-map.md](supplier-cycle-reuse-map.md).

## What a person can do

1. **Observe and connect.** Observations come from approved feeds, manual
   sources or documents, as before. A risk's link to an asset records whether
   the impact is unconfirmed, confirmed or ruled out, and who checked it.
   Assets have typed relations (supplied by, depends on, located at, runs on).
2. **Decide.** Decisions are documented and append-only: investigate,
   remediate, defer with a review date, accept risk, no action, scope and cost
   (amount, currency, scope, mandate), temporary protection, close with a
   documented deviation. Accepting risk, scope and cost, and closing with a
   deviation need the approval right.
3. **Ask the supplier.** A supplier is an asset of category _suppliers_ with a
   profile. A request is the supplier part of an existing action, never a
   second action. Its basis is explicit: information, a confirmed contract
   obligation, a deviation, or an order backed by a scope and cost decision.
4. **Share exactly what is approved.** Only a member with the external sharing
   right (granted by an owner) approves the external version. It contains the
   reference, task, expected result, requested date, response instruction and
   the contract clause — never the risk, internal criteria or notes. Editing
   the content makes the shared version stale; the recipient's copy is never
   changed afterwards. Export: Markdown download or print.
5. **Send and receive outside the platform.** The person sends through their
   own channel and records when, how and to whom. Responses received by mail,
   phone or meeting are registered with the stated author, the channel and who
   registered them. The platform does not authenticate the supplier.
6. **Verify.** The supplier's "done" goes to verification; it never closes
   anything. Only the approval right accepts or asks for a revision, against
   the internal criteria. A critical request needs a verifier other than its
   owner, its creator and whoever recorded the response. An approver can
   reopen an accepted request into a new cycle; earlier outcomes stay.
7. **Close the action.** The action can be completed only when every request
   on it is accepted or withdrawn, or an approver has documented a deviation.
8. **Follow up.** The supplier page shows open, overdue and to-verify
   requests, contracts, confirmed requirements and figures with their
   denominators: responded on time (per the requirement's response days),
   done on time (per the agreed date), accepted at first verification,
   revisions, reopenings and the median time of each party. A review stores
   findings, decisions and proposed requirement changes; its figures are
   computed when shown, from what the reader may see.
9. **See what needs someone now.** The overview's work list follows the plan's
   order (assess, decide, chase, verify, overdue actions, monitoring gaps),
   each row opening the step that resolves it, with a security-manager and a
   CISO view that filter the same data and never grant anything.

## Try the synthetic pilot (about 15 minutes)

Use a test workspace with one owner (approver) and one editor.

1. _Er verksamhet → Skyddsvärden_: add "Passersystem" (system) and an office.
2. _Risker och åtgärder_: add the risk "Sårbarhet i passersystem" and the
   action "Säkra passersystemet".
3. _Leverantörer_: add "Passage Systems AB"; add the relation _Passersystem
   levereras av Passage Systems AB_; record contract `PS-2024-01`, verify it;
   record requirement § 7.2 with a 5-day response time, confirm it.
4. _Ny leverantörsbegäran_ on the action, basis _Befintlig
   avtalsförpliktelse_. As owner, grant yourself the sharing right
   (_Verksamhet och team → Team → Ge rätt att dela externt_) and approve the
   external version. Download it; check that the internal criteria are absent.
5. Record the dispatch. Record a "done" that lacks evidence; ask for a
   revision. Record an objection ("not in the agreement") with a proposed
   date; document a scope and cost decision and temporary protection; agree a
   date with a reason.
6. Record a new "done" with evidence and accept it. Complete the action.
7. On the supplier page, check the figures and save and approve a review.

## Known limits (stated, not hidden)

- **No supplier portal and no automatic mail.** Exchange is manual by design
  in this version; nothing is sent by the platform.
- **Calendar days only.** No business calendar, pause rule or contractual SLA
  calendar is applied, so no figure says "breach". Missing data shows as
  missing, never as zero or green.
- **AI is not part of the cycle.** A typed task seam exists
  (`src/lib/security-work/ai/tasks.ts`) over the existing connection; with
  generative AI off it always returns the manual path. A customer-chosen model
  is a separate, verified delivery.
- **Attachments** are existing workspace sources (Underlag); responses cite
  them. No new file storage was added.
- **The sharing right** is granted and removed per member by an owner on the
  team page; it is never implied by the editor role.
