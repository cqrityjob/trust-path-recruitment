# PR B — manual Security Work workspace

Baseline: `14e25672551657a7cafb67870fb7a28ac47a05c9` (merged PR A, #287).
Branch: `codex/security-work-monitoring`. The PR records the exact reviewed head
and its CI results. This change stops at owner review; no merge or publication.

The [read-only hosted verification](hosted-application.md) was completed before
application implementation. All 312 migrations are applied, including the
unchanged Security Work foundation. PR B adds no migration, dependency or
provider configuration. The deploy plan is empty.

## Usable journey

An authenticated person chooses **Mitt säkerhetsarbete / My Security Work**
from the existing account menu, independently of employer registration. The
separate `/security-work` layout offers overview, monitoring, sources and
settings, with an explicit return to My Career. Existing Career navigation,
Passport, CV and recruitment permissions remain in their own contexts.

The idempotent foundation RPC creates one personal workspace. Profile progress
can be saved incomplete and resumed; optional geography and asset groups are
collapsible. Settings collect existing profile fields and editable monitoring
questions. Frequency is labelled as a preference, with no active schedule.

A person registers a source, then previews and saves a manual title, reference,
optional publication date and text extract. Source descriptions remain editable;
registered original material does not. The inbox opens the original text and
lets an editor mark it relevant or dismissed with a required human rationale.
The recorded actor, time, status and immutable decision history survive reload
and a fresh login. Overview counts and next steps come from saved records.

URLs are references only. Text renders as escaped React text, never HTML.
The UI states that classified or otherwise prohibited information must not be
entered. No collection, upload, scheduler, AI inference, approval, risk, action
or report workflow is represented as available in this delivery.

## Authorization, integrity and failure handling

- All 13 server functions require the existing authenticated middleware and a
  strict request whitelist. The domain service uses only the caller's Supabase
  client. Current membership and role are checked on every operation, in
  addition to database RLS and composite workspace foreign keys.
- Query keys include user and workspace. Workspace/account switching, logout,
  denied access and revoked membership cancel and remove the relevant cache.
  Read results recheck membership before returning. Viewer mode is read-only;
  changing a URL or invoking a server function does not confer access.
- Updates carry their original version. Stale edits preserve the user's draft
  and require an explicit reload of the current record. Temporary read errors
  preserve drafts; authorization errors remove the workspace surface.
- A stable request UUID is also the original's primary key. Retries compare
  every immutable fact, including source identity. Concurrent retries cannot
  create another original even if a caller changes the source. No upsert
  rewrites source facts.
- If the original commits but inbox creation fails, the UI exposes that saved
  original and a recoverable pending state. A deleted question is visibly
  invalid and can be explicitly replaced or cleared. An existing triage
  receipt cannot be silently rewritten by retrying the original submission.
- The existing database owns actor/time/version and audit writes. A decided
  rationale cannot be edited in place without an explicit state change.
  No generic service-role access or production fixture write is introduced.

## Review and local reproduction

The browser harness starts a dedicated temporary Supabase stack with real
GoTrue sessions, PostgREST and PostgreSQL 17. It strictly replays all migrations;
there are no mocked domain responses in the happy path. One controlled failed
inbox request verifies recovery after a real original has committed. Synthetic
accounts cover owner A, owner B, viewer, revoked and ordinary users. A fresh
suffix isolates reruns without deleting append-only history.

```sh
export SW_BROWSER_STATE_DIR="$(mktemp -d /tmp/security-work.XXXXXX)"
bash scripts/security-work-browser-stack.sh up
source "$SW_BROWSER_STATE_DIR/run.env"
bun run security-work:service-check
bun run security-work:browser
bash scripts/security-work-browser-stack.sh down
```

Prerequisites: pinned Supabase CLI 2.111.0, Docker, Bun, psql, jq and installed
Playwright Chromium. The scripts reject nonlocal test targets. Local env files,
raw reports and authenticated traces remain in the private temporary directory.
The CI publication gate requires all six journeys to pass once without skips or
retries, validates 24 PNGs, records hashes and commit/dirty-tree provenance, and
runs the existing evidence leak scanner with no allowlist. Nine gate controls
prove rejection of incomplete or unsafe evidence. CI uploads only validated
screenshots and their minimal manifest.

## Deliberate limits and next delivery

The source/question catalogue supports up to 1,000 records each; an exceeded
limit returns an error instead of silently truncating. Original material is
paged in batches of 50, including originals awaiting inbox recovery. A detail
view shows the latest 100 audit entries. Membership administration, source
adapters, automatic collection, document uploads and AI are outside PR B.

The following references were searched for among available attachments and
were not found: `CQrityjob AI Operating Manual – Full Version.docx`,
`CQrityjob Product Vision 2030.docx`, and `hemsidor.txt`. Their contents have not
been inferred. They remain inputs for source prioritization and terms,
operating rules, retention/erasure policy and the longer-term product roadmap;
they do not prevent this independent manual workflow.

The next cohesive delivery should connect approved source adapters to
provenance-preserving intake, then produce evidence-cited AI draft assessments
for explicit human review before risks/actions/reports. It first needs source
and provider choices, collection permissions, minimization and retention rules,
failure/retry semantics and an evaluation set. Any necessary schema change must
pass a separate schema-first release before consumers activate. This work has
not started and needs owner approval. Astra is the development agent, not a
product-provider selection.
