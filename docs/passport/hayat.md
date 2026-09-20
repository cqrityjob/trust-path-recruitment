# HAYAT in Security Passport — what was built, and what was deliberately not

Implements `HAYAT_verifieringsmodell_v0.1` (18 September 2026) inside the existing
`/passport/credentials/new` form. No new module, no new route, no migration.

**"Document read" and "credential verified" are two facts and two boxes on the page.**
Reading a document never grants a verification status — there is no code path by which
it could.

## 1. What the holder now gets

At **Dokument (valfritt) → Välj fil** on step 4 of the existing wizard (also when
correcting a credential):

1. The existing validation runs first, unchanged: PDF/JPG/PNG/HEIC, non-empty, ≤ 8 MB.
2. **"HAYAT läser dokumentet …"** — the file is read *in the browser*.
3. Certificate/licence number, issue date and expiry date are suggested in the existing
   fields and marked **"Avläst av HAYAT"**. The mark disappears the moment the holder
   edits the value.
4. A value the holder already typed is **never overwritten**. If the document disagrees,
   both are shown and the holder chooses. If it agrees, that is confirmed.
5. Uncertain values are **offered, not filled**: an ambiguous date (`03/04/2026`), an
   OCR'd number containing `O`/`0`-style characters, low OCR confidence, several
   candidates, or dates that contradict each other.
6. Issuer and credential type are **compared with the selection, never changed**. A
   document for a different catalogue credential is flagged with a "choose a different
   credential" action; a name that is simply not found is a softer note.
7. The name on the document is compared with the account's `profiles.display_name` (the
   same canonical source as the Passport identity surface). It is a consistency check: a
   match proves nothing about identity, and a difference is reported as a difference —
   never as a conclusion.
   A photo turned 90°, 180° or 270° is read the right way up: when the upright reading is
   poor, a small copy is read in the other orientations and the full pass runs in the best
   one. An upright document costs nothing extra.
8. Replacing or removing the file **aborts the running reading and withdraws what it
   filled** (but keeps anything the holder edited). A late result from the old file is
   dropped by a generation check and can never land.
9. A failed reading keeps the whole form and says what to do: password-protected PDF,
   unreadable file, HEIC (not decodable in most browsers), too large to process,
   timeout, no legible text, reader could not start (with a retry).
10. A separate **Verifiering** box states the verification result. For an uploaded PDF,
    scan or photo that is, truthfully, **"Kan inte verifieras automatiskt"**.

Saving is unchanged: claim first, then the existing private upload, then the entry page.
An upload still moves a claim to `document_provided` at most.

## 2. Architecture decisions, with the evidence

| Decision | Why |
| --- | --- |
| **Reading runs in the browser** | The server runtime is Cloudflare Workers (`vite.config.ts` → nitro/cloudflare). Tesseract's WASM + language data does not fit a Worker, and Docling is Python. Better still: the document never leaves the device in order to be read — no OCR text is uploaded, stored or logged. |
| **Deterministic parsing, no AI call** | The only approved AI integration (`selectProvider()` → Anthropic) is scoped to Interview Intelligence and its `scp_iv_ai_run_*` envelope is keyed to interview cases. Sending candidate certificates to it would be a new data category for an external processor — explicitly out of bounds without approval. A rule-based parser also has no prompt to inject. |
| **OCR engine served from this origin** | Tesseract.js defaults to fetching worker, WASM core and language data from `cdn.jsdelivr.net`. `scripts/vite/hayat-ocr-assets.ts` publishes the lockfile-pinned files under `/hayat-ocr/` instead (dev: served from `node_modules`; build: emitted into the client output). Nothing binary is committed. |
| **Reader excluded from the server bundle** | The first build put pdf.js and Tesseract's Node build (~1.4 MB) into the Worker. The dynamic import is now behind `import.meta.env.SSR`, and the server output contains neither. |
| **Verification = signed credential + pinned key, via `jose`** | The one path that needs nobody's permission: the evidence is a signature. `jose` runs on WebCrypto, which Workers provide. `@digitalbazaar/vc` was **not** installed: it serves Data Integrity proofs, needs a JSON-LD context loader (a second SSRF surface) and no issuer needs it yet. Blockcerts: no Blockcerts input exists. Docling/PaddleOCR/walt.id: not needed — the simple path passed the document tests. |
| **Signed input arrives as a baked PNG** | Open Badges 3.0 "baking" stores the credential in a PNG `iTXt` chunk. It comes through the existing file control with no new file type, bucket rule or upload path. |
| **Approved issuer variations match; only the governed name is shown** | `sp_certification_issuer_aliases` are governed as "never rendered". HAYAT now lets them reach document **matching** through one pinned expression (`issuerMatchTerms`, issuing organisations only), so a certificate printed "(ISC)²" or under a historical name is recognised — and a mismatch is always reported under the governed name. The existing alias guard states and pins the new rule; `passport-hayat:check` 3.11–3.13 prove no alias can appear in a reading. |
| **The first real source is Credly's hosted Open Badges 2.0 assertion — built, not enabled** | See [hayat-sources.md](hayat-sources.md). It is a different format from the signed-PNG verifier, carries no certificate number, and permission for automated retrieval is not confirmed. |

### Libraries (exact, pinned)

| Package | Version | Licence | Role |
| --- | --- | --- | --- |
| `pdfjs-dist` | 6.3.289 | Apache-2.0 | PDF text extraction; renders scanned pages (legacy build, browser only) |
| `tesseract.js` | 7.0.0 | Apache-2.0 | OCR of images and rendered pages (LSTM-only core 7.0.0) |
| `@tesseract.js-data/swe` | 1.0.0 | MIT (pkg) / Apache-2.0 (tessdata) | Swedish language data, `4.0.0_best_int` |
| `@tesseract.js-data/eng` | 1.0.0 | MIT (pkg) / Apache-2.0 (tessdata) | English language data, `4.0.0_best_int` |
| `jose` | 6.2.12 | MIT | JWS verification on WebCrypto (was already present transitively at 6.2.3) |

Licence texts and a version notice are published with the assets at
`/hayat-ocr/licenses/` and `/hayat-ocr/NOTICE.txt`.

### Processing limits (`src/lib/security-passport/hayat/limits.ts`)

8 MB bounds the file, not the work. Pages read: 3 (a PDF declaring > 50 is refused).
Image pixels: refused above 40 MP **from the header, before decoding**. OCR input:
longest edge 2600 px. Rendered PDF page: ≤ 6.5 MP. Wall clock: 60 s, engine start
included. One page and one canvas at a time; the worker is terminated and canvases are
released after every reading and on abort. Parser input: ≤ 600 lines × 400 chars.

## 3. The verification model

`src/lib/security-passport/hayat/verification/`

Eight separate checks — supported profile, approved issuer **for this credential type**,
authoritative evidence, claim matches evidence, subject binding, validity, revocation,
freshness — each `passed | failed | unknown | not_applicable`. **No score. `unknown`
never rounds up.** One pure rule (`decide`) maps them to the nine statuses in the
specification's table.

**Supported today:** Open Badges 3.0 `OpenBadgeCredential` secured as a compact JWS
(VC-JWT), `EdDSA` / `ES256` / `RS256`, verified against **pinned** keys from the issuer
policy registry. Holder binding = the issuer's recipient identity (salted SHA-256 of an
email) matched to the account's **confirmed** email, read from the session on the server
— reported as *email control*, explicitly not identity proofing. Revocation =
`1EdTechRevocationList`, fetched only from hosts the issuer's policy lists.

**Second adapter:** Open Badges 2.0 *hosted* assertions as Credly serves them
(`hosted-open-badge.ts`) — complete, and disabled pending written permission. See
[hayat-sources.md](hayat-sources.md).

**Not supported, and reported as such:** Data Integrity (embedded) proofs,
`BitstringStatusList`, Blockcerts, verifiable presentations (so nonce/replay does not
arise yet), any register or issuer API.

### The registry is empty in production — on purpose

`PRODUCTION_ISSUER_POLICIES = []`. No issuer has been onboarded: ASIS issues through
Credly, and CQrityjob has neither confirmed API access nor confirmed terms. A public
badge URL proves nothing about who holds it. So **every real credential currently
resolves to "cannot be verified automatically"** — the honest answer. The verifier is
complete and proven against synthetic issuers whose keys are generated inside the test
run. The server function never accepts a registry from a caller; adding a trust anchor
is a reviewed code change.

### Saved assessments (this branch; needs migration 20261204090000 applied first)

| Step | What happens |
| --- | --- |
| Save | Claim first, then the private upload — unchanged. **Then**, only if the file carried a signed credential or the holder gave a link, `assessSavedCredential` runs. Its failure never blocks saving. |
| Check | The server reads the claim and its evidence through the **holder's own session** (another holder's claim id finds nothing), takes the claim's fingerprint **before** checking, and for a file extracts the signed credential itself from the stored bytes. The browser is never asked what a file contains. |
| Record | One service-only writer (`hayat-assessment.server.ts` → `sp_hayat_record_assessment`). Bound to: the claim, a fingerprint of the five assessed fields, the exact document (sha256) or the holder's link, the adapter, the rule version and the check time. An outage, or a result that checked nothing, is shown and **never stored**. |
| Reopen | The credential page shows the saved check: **current**, or **history** with the reason — corrected, document replaced/withdrawn, or aged out — plus scope limits, binding level, date and rule version. |
| Re-check | "Kontrollera igen" re-runs the same source. A correction creates a successor claim (that is how Passport edits), so a corrected credential starts unchecked **by construction** and the old check becomes history. |

It does **not** move `assertion_level`, does not appear in any share, and says so on the
card. Promoting a machine result into what a *recipient* sees is a separate trust-policy
change (the `issuer_confirmation` containment of `20261030090000`) and is not made here.

**Trust-policy change to review:** a *second named service-role exception* in the Passport
domain. The recipient boundary has no identity for RLS to key on; this writer has an
identity that must not be able to write — a holder can call any `authenticated`-executable
function through PostgREST. `passport-separation:check` pins it as tightly as the first:
one file, exactly one rpc, no table or storage access, holder id from the verified session,
one permitted importer.

## 4. Security properties, and where each is pinned

| Property | Pinned by |
| --- | --- |
| No client path to `verified`; server input is `.strict()` with no result-shaped field | `passport-hayat:check` 9.2, 9.7–9.11 + control `HAYAT-NC-CLIENT-SUPPLIED-RESULT` |
| Account email comes from the session, never the request | 9.10 |
| Document text reaches no request except the existing private upload; no third-party engine host | e2e `assertNothingLeft` |
| Private documents and readings stay out of shared views | 9.19 + existing `passport-sharing-flow:check`, SQL suites 4.4 / 5.7 |
| Embedded instructions have no effect | 2.22–2.23 (there is no model to address) |
| SSRF: https only, no credentials/port/IP literal in any spelling, exact host allow-list, redirects never followed, 5 s, 256 kB, two attempts | group 8, 7.25–7.29 + control `HAYAT-NC-FETCH-ALLOWLIST-DROPPED` |
| Nothing logged | 9.4 |

Known limit: Cloudflare Workers cannot resolve DNS, so a resolved address cannot be
pinned against rebinding. The exact-host allow-list carries that risk; a listed host is
only ever added after review.

**Access from another account:** there is no server-side extraction job or stored
reading to access — a reading lives in the holder's browser tab. The uploaded file keeps
its existing protection (`sp_attach_evidence` path ownership, Storage policies; SQL
suites `security_passport_phase3_test.sql` 1.3, 4.4).

## 5. Tests

| Suite | Result |
| --- | --- |
| `bun run passport-hayat:check` — 271 deterministic checks (dates, fields sv/en, OCR errors, conflicts, issuer variations, limits, baked PNG, every verification acceptance case for both adapters, SSRF, structure) | pass |
| `bun run negative-controls:passport-hayat` — 8 planted defects, each must turn the guard red | 8/8 detected |
| `e2e/passport-hayat-reading.spec.ts` — real pdf.js + Tesseract in Chromium: text PDF (en), scanned PDF (sv), JPEG, photos turned 90° and 180°, ambiguous date, missing field, wrong credential, replacement mid-read, removal, oversized / unsupported / unreadable / password-protected / HEIC, baked PNG → server, link field hidden/shown by availability | 12/12 on the dev server **and** 10/10 against the production build in workerd |

Measured locally (Apple silicon, Chromium headless, cold engine each test): text PDF
≈ 1–2 s; one scanned page or photo ≈ 4–6 s including engine start. First OCR use
downloads ≈ 4 MB core + ≈ 5.5 MB language data from this origin (cached afterwards;
never fetched for text PDFs). No accuracy percentage is claimed from eight synthetic
documents.

**Production build:** the same browser suite passes against `.output` served by
`wrangler dev` (workerd, the real Workers runtime): pdf.js worker, OCR worker, WASM core and
both language files load from the built assets (all 200, `.gz` without `Content-Encoding`).
Run it with `E2E_SERVERFN_RESOLVER=.output/server/__23tanstack-start-server-fn-resolver-*.mjs`.

**Not tested:** real certificates; skew beyond a few degrees; handwriting; Safari/Firefox;
low-memory phones; a live issuer, a live Credly assertion, a real revocation or a real
timeout against a live host; HEIC on Safari.

`e2e/passport-credential-ui.spec.ts › a lapsed credential is never presented as current`
fails identically on untouched `origin/main` (2df1a39, reproduced in a clean worktree): the
page says "Expired · Documented" where the test expects "PREVIOUSLY VERIFIED". It is not in
CI and is not caused by this change.

## 6. Rollback

No database change, no stored data, no production configuration.

1. Revert the PR (one merge commit). The form returns to its previous behaviour; the
   upload path was never modified.
2. Nothing to clean up: no rows, no bucket objects, no environment variables. The
   `/hayat-ocr/` assets disappear with the next build.
3. Faster switch without a revert: remove the `onAssess` prop from the two routes to
   disable server assessment; the reading has no server dependency at all.

## 7. Owner test script — `/passport/credentials/new`

Use synthetic or your own documents. Sign in as a candidate.

1. Add credential → choose e.g. ASIS CPP → reach **Dina uppgifter**.
2. **Välj fil** → a text PDF certificate. Expect "HAYAT läser dokumentet …", then number
   and dates filled with **Avläst av HAYAT**, a **Dokument avläst** box, and a separate
   **Verifiering** box saying **Kan inte verifieras automatiskt**.
3. Edit the number → its badge disappears. **Ta bort fil** → untouched HAYAT values
   clear, your edit stays.
4. Type your own number first, then choose the file → your number stays; "Dokumentet
   anger … Ditt värde är kvar." → **Använd dokumentets värde** replaces it.
5. Choose a phone photo or a scanned PDF → same result, plus the note that the text was
   machine-read. First time takes a few seconds longer.
6. Choose a certificate for a *different* credential → flagged, selection unchanged.
7. Choose a password-protected PDF, then a > 8 MB file → clear message each time, form
   intact.
8. Choose file A (a photo), and immediately file B (a PDF) → only B's values appear.
9. Continue → **Spara merit**. The credential opens as registered by you, with the
   document attached privately. Create a share link → the document and nothing read from
   it appear there.
10. Browser dev tools → Network: no request to `jsdelivr`/any CDN, and no request carrying
    the document's text other than the existing `uploadEvidence` after save.
