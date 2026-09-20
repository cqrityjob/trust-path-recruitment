# HAYAT — end-to-end verification after #275–#277

Written 2026-09-20, against `main` at `1b0b211957e77168320e584698f42f4bbaeacc7d`. This
records the test environments actually used and what each one proved, so that later work
does not have to take the earlier reports on trust.

## 1. What is published

Production is **1b0b211**. Two independent confirmations:

- Lovable reports `latest_commit_sha = 1b0b211…`, `is_published: true`.
- A local production build of the same commit produced **49 of the 52** JavaScript asset
  filenames the published page references, byte-identical by content hash — including
  `i18n-Cip16Sjg.js`, which carries every HAYAT string. The three that differ
  (`client-*`, `index-*`, `routes-*`) are the entry bundles that embed injected
  environment values.

No new deployment was started, and none was needed.

## 2. Verified on the published site

Read-only, signed in, **nothing saved**, at `https://trust-path-recruitment.lovable.app`:

| Check | Result |
| --- | --- |
| Text PDF read live | number `7741-2291-86`, issued `2024-03-12`, valid to `2027-03-31`, three "Avläst av HAYAT" |
| Image read live with real OCR | worker loaded from `/hayat-ocr/worker.min.js` on our own origin, not a CDN |
| Document text leaving the browser | `serverFnCalls: []` — none |
| Typed value kept, previous file's values withdrawn on replace | yes |
| Holder-name comparison | reported the difference, drew no conclusion |
| Credly link field | absent, because the source is disabled |
| Verification box | "Kan inte verifieras automatiskt / no_verifiable_source" |
| Review step wording | "Ett bifogat dokument är underlag, inte en verifiering." |

Production database, read-only: 0 assessment rows; RLS on; `anon` has no SELECT and no
EXECUTE on any `sp_hayat_*`; `authenticated` can neither INSERT nor execute the writer;
only `service_role` can; 3 triggers. All three RPC argument lists in the application match
`pg_get_function_arguments` on the hosted functions exactly, and every column
`getSavedAssessment` reads exists in the hosted `TABLE(...)` result.

## 3. The isolated environment — the full chain over HTTP

Docker could not host this at first: the colima VM's data disk was 100 % full. It was
**grown 40 GiB → 54 GiB** (`colima start --disk 55`), which is additive and non-destructive:
all 16 volumes and all 19 running containers came back, and the host kept 24 GiB free. No
volume was deleted; the retired `zrah` volume was left untouched. One container,
`beskt-e2e-postgrest`, is created with `--rm` by `scripts/local-stack/postgrest-docker.sh`
and is recreated on demand, so its disappearance across the restart is expected.

A separate Supabase project `hayat-iso` was then started on dedicated ports (API 55621,
DB 55622) with all **306 migrations** applied, a test holder, and **a controlled test
issuer whose Ed25519 keypair was generated for the run and never committed**. The
application ran against it. `PRODUCTION_ISSUER_POLICIES` was patched locally for the run
and reverted; production remains empty.

Real browser → real server functions → real GoTrue, PostgREST and Storage → real Postgres:

| Step | Result |
| --- | --- |
| Sign in | real password grant against GoTrue |
| Credential form | real catalogue over PostgREST |
| Upload a badge signed by the test issuer | read, then **preview `verified` with `recorded: false`** |
| Save | claim created; evidence uploaded to private Storage |
| Server check | ran server-side and wrote through `service_role` |
| Reopen | saved assessment `verified`, `current: true`, scope limit "återkallelse" stated |
| Re-check | ran; produced a new row and superseded the previous one |
| Console errors | 0 |

In the database afterwards: `adapter ob3-vc-jwt/1`, `source_kind signed_credential`,
`rule_version hayat-rules/2`, bound to the document's sha256, fingerprint matching the
claim — and the claim's own `assertion_level` still **`document_provided`**. A HAYAT
"verified" does not promote a credential.

**The database refused a promotion even from a direct SQL fixture** — attempting to set
`assertion_level = 'verified'` raised `SP_TRUST_FIELD_IMMUTABLE: assertion_level may only
change through the evidence or verification workflow`.

Isolation, in the same environment:

- A second account saw **0** assessments, 0 evidence, 0 claims; the holder saw 2 and 1.
- The private document returned **400** anonymously, with an anon key, on the public-object
  route, and as the second account — while the holder got **200 and the real PNG**
  (positive control, so the refusals are not a URL artefact).
- A real share link's anonymous payload (980 bytes, `status: active`) contained none of:
  `hayat`, `assessment`, `evidence`, `storage_path`, `sha256`, `binding_level`,
  `rule_version`, `scope_limits`, `adapter`.
- A badge signed by an **untrusted key** produced `action_needed / signature_invalid`,
  both in the preview and when saved. Never verified.

## 4. The timeout — investigated, no defect found

A scanned PDF timed out once in a real Chrome session during the earlier production walk.
It could not be reproduced against the same production build at 1×, 4×, 8× or 12× CPU
throttling, or at 8 and 20 Mbps: it reads in 1.3–8.4 s. Downloading the ~9.4 MB engine from
production takes ~1.6 s.

**The cause remains unknown.** Background-tab throttling in a headed browser is a
hypothesis that fits the symptom and that Playwright's headless Chromium cannot reproduce
— it is not an established explanation, and nothing here should be read as having
diagnosed it. What is established is only that the failure is safe: the form is kept, the
message is actionable, the retry works, and the abandoned reading cannot land.

What *was* missing was a test. The reader's cancellation was only ever checked by reading
its source (`passport-hayat:check` 9.18). A regression test now holds the OCR language
data past the 60 s budget and proves, against the real reader:

- the reading gives up at the budget with `failure=timeout`;
- the holder's typed value survives and the message offers "Läs dokumentet igen";
- after a **new file** is chosen, the abandoned reading — given 25 s more to finish —
  **never lands**: the new file's values still stand.

The 60 s budget does include the one-time engine download. That is a deliberate,
documented limit, and the failure is safe: the form is kept and the retry is fast because
the engine is then cached.

## 5. What still cannot be claimed

- **No production save has been run.** It needs a designated test account; the flow is
  written up for the owner in the final report. The isolated environment covers the same
  chain with a real backend.
- **No real issuer is connected.** With `PRODUCTION_ISSUER_POLICIES` empty and Credly
  disabled, an ordinary document returns `no_verifiable_source`, which is in `NOT_A_CHECK`,
  so the service-role writer is never reached in production. The saved-assessment card
  correctly reads "Ingen automatisk kontroll har gjorts". The machinery is deployed and
  proven; it is idle by design.
- **Credly remains disabled.** The blocker is contractual and **unresolved**, not
  prohibited — see `docs/passport/hayat-sources.md`, which corrects the earlier review.
