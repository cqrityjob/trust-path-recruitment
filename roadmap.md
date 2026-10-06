# UX/UI Product Polish Roadmap

- [x] Homepage: premium international first screen; product-led, compact, not login-led
- [x] Security Passport: strongest visual product experience; distinct from Profile and CV
- [x] Connected platform: clarify Profile, CV, Security Passport, Career and Jobs
- [x] Auth and role entry reviewed: existing candidate/employer paths preserved; homepage no longer login-led
- [x] Employer experience reviewed: stable overview, onboarding, job creation and applications left unchanged
- [x] Career and assessment presentation
- [x] Shared navigation, states, SV/EN and legal surfaces
- [x] Desktop/tablet/390px/375px Preview evidence and accessibility checks
- [x] Changed-file lint and focused homepage, header, candidate-journey and Passport regression suites
- [x] Final owner-review report; branch remains unmerged and unpublished
- [x] Security Passport correction: terminology and Profile separation
- [x] Security Passport correction: flagship overview and premium credential records
- [x] Security Passport product identity: globally coherent, profession-neutral credential wallet system
- [x] Security Passport correction: add-credential and selective-sharing presentation
- [x] Homepage Passport anchor coherence only
- [x] Final visual elevation: identity-first surface, restrained Passport signature, credential wallet depth, and premium share preview
- [ ] Preview evidence: overview desktop/mobile, add credential, real credential display, share preview, homepage anchor — blocked by unavailable authenticated Preview and missing browser system library
- [ ] Owner visual gate: prove at least one real Preview credential uses the premium record system, or report the data limitation
- [ ] Verification: focused static safeguards pass; SV/EN desktop, 390px, 375px browser smoke tests remain blocked by the Preview environment

## MVP UX fixes after #301/#302/#303 (pending plan approval)

- [x] Sync latest main (ee5bd661) into the preview branch — platform synced; types.ts aligned to main's #303 state
- [x] Job card title wrapping: "Säkerhetschef" must not break mid-word without a hyphen
- [x] Job ad: honest empty-description handling ("Arbetsbeskrivning saknas" / "Job description not provided"); remove duplicate template headings without touching stored data
- [x] Jobs mobile: collapse extra filters behind an accessible "Filter" button with active-filter count; keep search and result count visible; preserve URL filters
- [x] Homepage hero buttons: fix icon/text spacing
- [x] Preserve company-name spelling; no auto-capitalisation; use canonical display labels
- [ ] Login return to the ad with search context — UNVERIFIED (no test account in this environment); logged-out back-navigation verified in browser
- [x] Verify SV/EN desktop+mobile; report authenticated flows as unverified without a test account

## Frozen boundaries

- No hosted Supabase changes or migrations
- No generated type changes
- No auth, redirect, RLS, permission, catalogue, assessment, Interview Intelligence, BESKT or BCP logic changes
- No merge, deploy or publish

## Test layout after #442

- [x] Confirm #442 ancestry and unchanged Supabase binding.
- [x] Improve Sentinel runner, completion and result presentation only; preserve safeguards.
- [ ] Verify authenticated candidate/employer flows and TestBank in isolated stack — Docker and suitable isolated session unavailable.
- [ ] Run recovery and full Sentinel browser regressions — disposable Docker stack unavailable.
- [ ] Verify remote UI delivery commit — platform edit branch not currently advertised by origin.
