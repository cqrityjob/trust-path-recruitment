# Security Work report print verification

Verified locally on 2026-09-24 with synthetic inputs only. This is proof of the report renderer and browser print path, not proof of a real AI provider's analysis quality or a production deployment.

## Product behaviour

The export remains **HTML with browser Print / Save as PDF**. It contains the immutable approved bundle, approved version and date (UTC), saved method and template IDs, approved section order, uncertainty, risks, actions and source references. Action priority, account ID, due date, status and completion evidence are shown only when preserved in that bundle. Missing owners, dates and priority remain explicit. The current live action state does not rewrite an approved export.

Exact saved claims and explicitly targeted risk citations appear beside their matching text. An unmatched citation remains in a separate section; the renderer does not invent a semantic link. The source register includes cited immutable originals, publication date or an explicit unknown, and recorded date where available. Unquoted source text is not exported. RSA uses the preserved 25-cell matrix, including orange S3/K4 and S4/K3. The monitoring and legacy templates do not acquire RSA numbers or colours.

The review UI shows original source title, publisher, date and locator next to AI evidence quotations. Follow-up forms explain the decision need, distinguish user information from assumptions and no longer pre-fill a question merely because a structured field is empty. Applied AI questions retain their original explanation and exact citations from the immutable application receipt; if the human edits the question, the original question and historical nature of that explanation remain visible.

A scanned/image-only PDF is not claimed to have been read. The upload panel explains the lack of OCR and offers a keyboard-focusable route to the existing manual source/immutable extract form. The user transcribes and reviews that extract explicitly.

## Reproducible proof

```sh
bun run scripts/security-work-analysis-check.ts
SW_REPORT_PDF_DIR=/path/to/private-output bun run scripts/security-work-report-print-check.ts
```

The first command runs 62 behavioural checks, including all 25 independent matrix cells, frozen method/template behaviour, escaping, historical action state, explicit unknowns and exact citation placement. The print command launches headless Chromium with no backend or login and blocks every browser network request. It writes exactly six synthetic examples plus `manifest.json`:

- `rsa-sv.pdf`, `rsa-en.pdf`
- `monitoring-sv.pdf`, `monitoring-en.pdf`
- `legacy_security-sv.pdf`, `legacy_security-en.pdf`

All six passed locally, with eight A4 pages each. PDF.js reads the actual PDF bytes and checks approval date/version/status, frozen section order, method and template, quoted source text, uncertainty, action ownership and missing values. It also verifies text margins, non-empty pages, and repeated column headings on a genuine multi-page action table. The manifest records each PDF's SHA-256, page count, language and template. CI publishes only these six known synthetic files and the manifest as `security-work-synthetic-pdf-print`; it does not publish authenticated browser traces or environment files.

All 48 pages were rendered using Poppler and visually inspected. The review covered headings, Swedish glyphs, table continuation, text wrapping, page numbers, quotations and source attribution. It caught and corrected a citation/source split and an isolated final footer. The final layout keeps short citation blocks and action descriptions together, repeats table headings, and keeps the source register with the final approval/hash note. Pagination may differ slightly between operating-system fonts; the checks do not require an exact page count.

The real isolated application journey is in `e2e/security-work-analysis.spec.ts`. It uploads and extracts a text PDF, verifies an image-only PDF fails extraction, continues through a manually transcribed source and human review, saves a follow-up answer, approves a report and downloads its immutable HTML. It then prints that exact HTML in a fresh browser context without authentication cookies and without network requests. Those application PDFs stay with private test output, separate from the allowlisted synthetic publication artifacts. All six real journeys passed once on desktop, 375 px and 390 px in Swedish and English (4.5 minutes). The evidence gate accepted all 42 PNG captures and scanned 43 files including the manifest. This local run records base commit `f3b91f34dab59d9c09579cebcb17af0c142634f8` with `workingTreeDirty: true`; final-commit CI remains the separate release proof.

## Limits

OCR remains unavailable in this delivery. Publication dates absent from source metadata remain unknown; the UI does not infer currency. Account IDs are deliberately preserved instead of looking up or inventing a person's name after approval. A successful print and valid structured draft do not establish factual analysis quality; provider quality evaluation and owner configuration decisions have their own evidence.
