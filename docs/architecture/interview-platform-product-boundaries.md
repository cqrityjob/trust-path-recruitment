# Interview platform — product boundaries

**Status:** architecture note. No investigative-interviewing capability is built,
designed or scheduled by this document. Nothing in it changes the shipped
product, and nothing in it should be read as a claim that such a product is
close.

## Why this note exists

CQrity Interview Intelligence is a structured-interview platform whose first
commercial product is recruitment, and whose first vertical is Swedish security
recruitment. There is credible interest in the underlying concept as
professional interview support outside recruitment.

This note records what would have to be **separated** before any such product
could exist, so that today's implementation choices do not quietly make the
separation impossible later. It is a boundary, not a roadmap.

## The one thing this note is really about

Recruitment interviewing and investigative interviewing look similar and are
not the same activity. They differ in what the interview is FOR, what the
interviewee's position is, what may lawfully be inferred, and what happens to
the record afterwards.

**Recruitment methodology and content must not be reused for investigative
interviewing.** The governed Väktare pack, the 5E evidence structure, the TRUST
stage bindings and the behavioural anchors were written for assessing
work-related competence against role requirements. None of them has been
validated for, or reviewed against, an investigative context. Reusing them
because the data model happens to fit would be the most damaging possible
version of "extensible architecture".

PEACE and ORBIT-related research may be relevant to both. That is a reason for
a separate research and expert-review process, not a reason to share content.

## What a separate product would need

A future Investigative Interview Support product would require its own:

- product mode, visible in the data and not merely in the UI
- legal and governance framework, with its own lawful basis
- research pack, separately reviewed and separately validated
- terminology, written for that domain rather than translated from this one
- permissions and user roles
- data classification, with categories this product does not have
- retention and deletion rules
- audit requirements
- interview templates and question sets
- AI task registry, with its own allowlist and its own prohibitions
- prohibited-use policy
- validation process, independent of the recruitment one

None of these can be a variant of the recruitment equivalent. Each is a
separate artefact that happens to sit on shared infrastructure.

## What is already safe to share

The parts of the platform that are genuinely domain-neutral, and where today's
naming does not need changing:

- organisation, membership and role-based access
- interview case lifecycle as a state machine
- source material with provenance and passage-level separation
- the human-confirmation boundary: a proposal is never a record
- AI run recording — provider, model, prompt version, cost, outcome
- the bilingual content mechanism
- audit trail and event log

These are interview-platform concerns, not recruitment concerns.

## What must not happen on the recruitment branch

- No suspect, witness or victim data model.
- No criminal-investigation workflow.
- No reuse of the recruitment research pack under an investigative label.
- No shared AI task registry entry serving both products.
- No generic renaming of stable recruitment tables for theoretical cleanliness.
  The MVP is recruitment; the architecture is extensible; the implementation
  stays focused.

## Naming

Within the product today:

- **CQrity Interview Intelligence** — the umbrella capability
- **Recruitment Interview Intelligence** — the current product
- *Investigative Interview Support* — a hypothetical future product, named here
  only so that the boundary has something to point at

This is not a branding decision and global navigation is not being redesigned
around it.

## The honest limit of this note

This is an engineering boundary written by an engineer. Whether an
investigative product is appropriate at all, on what lawful basis, and under
what professional oversight, are not engineering questions and are not answered
here.
