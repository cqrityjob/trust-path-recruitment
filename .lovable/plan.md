# Security Passport Visual Correction Pass

## Scope and baseline

- Work only on isolated Preview branch `edit/edt-a34179ff-1ab2-4bc1-be58-7527a44a9535` at baseline `8a5549fb`.
- Use the uploaded image only as a quality benchmark; do not copy its people, wording, claims, identifiers, QR treatment, certificates, or physical-card composition.
- Keep all Supabase resources, migrations, RLS, grants, auth behavior, routes, governed catalogues, assessment logic, BESKT, BCP, sharing rules, and trust derivation unchanged.
- Do not merge, publish, or deploy.

## Current state

- The Passport overview is composed by `src/routes/_authenticated.passport.index.tsx`, `CredentialWallet`, `PassportSideColumn`, and `SecurityPassportPreview`.
- The incorrect phrase “Ditt privata yrkespass / Your private professional passport” exists only in `CredentialWallet`.
- Name and title already come from Profile; credentials and summaries already come from the existing Passport snapshot and governed metadata.
- Credential status, lifecycle, review, issuer/source, jurisdiction, expiry, and actions are already derived by existing product logic and must remain unchanged.
- The add flow is the existing five-step `InternationalCredentialForm`; saving and evidence upload remain separate existing operations.
- The share screen already pins selected credentials, uses the real recipient payload for preview, limits expiry, excludes evidence/CV, and supports revocation/reissue. Those behaviors are frozen.
- The homepage already uses a generic, non-fictional Passport anchor and keeps Career Discovery visible.

## Implementation

### 1. Product naming and Profile separation

- Remove “Ditt privata yrkespass / Your private professional passport”.
- Keep “Security Passport” as the product name everywhere touched.
- Label the holder name and professional title explicitly as Profile information without changing their source.
- Add focused terminology guards so alternative Passport names cannot return.

### 2. Flagship overview

- Recompose the overview header as a premium deep-navy identity and trust surface with clearer zones for Profile identity, privacy, credential summary, review summary, and sharing actions.
- Replace dashboard-like metric tiles and administrative rows with a restrained passport/wallet hierarchy using the existing navy, trust-blue, off-white, Sora, and Manrope system.
- Refine the side preview and privacy summary into one intentional share-preview area while preserving canonical links and privacy mode.

### 3. Premium credential records

- Strengthen `CredentialSymbol` presentation for real governed credentials, including APP, CPP, PSP, and other catalogue entries when present.
- Present each credential as a distinctive professional record with its real name, source/issuer, jurisdiction, trust state, lifecycle state, expiry, and existing action.
- Keep document review visually and verbally distinct from source verification; retain explicit Self-reported, Evidence submitted, Document reviewed, Source verified, Expired, and Revoked states.
- Do not add credentials, issuers, identifiers, or claims.

### 4. Curated add-credential flow

- Restyle the existing five-step flow with a premium Passport header, clearer progress rail, stronger selected states, refined catalogue/result treatment, and compact mobile spacing.
- Keep the current steps, inputs, validation, catalogue filtering, save behavior, evidence rules, and navigation unchanged.

### 5. Selective sharing and recipient preview

- Give the existing choose–preview–settings–create flow a consistent Passport visual frame.
- Make selected scope, source/jurisdiction, trust state, holder-controlled privacy, expiry, selective disclosure, and revocability easier to scan.
- Refine the real recipient preview and created-link panel without adding verification-like claims or changing selection, token, expiry, revoke, or reissue behavior.

### 6. Homepage coherence

- Make only the minimum visual adjustments to `HomePassportPreview` needed to match the corrected Passport surfaces.
- Preserve the light editorial homepage, Career Discovery entrance, login hierarchy, routes, and navigation behavior.

## Expected files

Primary presentation files:

- `src/components/security-passport/CredentialWallet.tsx`
- `src/components/security-passport/SecurityPassportPreview.tsx`
- `src/components/security-passport/PassportSideColumn.tsx`
- `src/components/security-passport/CredentialSymbol.tsx`
- `src/components/security-passport/InternationalCredentialForm.tsx`
- `src/routes/_authenticated.passport.index.tsx`
- `src/routes/_authenticated.passport.credentials.new.tsx`
- `src/routes/_authenticated.passport.share.tsx`
- `src/components/site/HomePassportPreview.tsx`
- Passport SV/EN copy only where necessary
- Focused Passport/homepage visual and terminology checks

No server-function, database, generated-type, catalogue, assessment, BESKT, BCP, or auth files will be changed.

## Acceptance criteria

- “Ditt privata yrkespass” and its English equivalent are absent.
- Profile identity and Security Passport documentation are visibly distinct.
- The overview reads as a premium professional Passport rather than a dashboard.
- Existing APP/CPP/PSP or other real credentials receive a distinctive visual record treatment without invented data.
- Trust and lifecycle states remain explicit and semantically correct.
- Add credential and sharing visually belong to the same Passport product.
- Homepage Passport anchor matches without a broader homepage redesign.
- Swedish and English work at desktop, 390px, and 375px with no overlap or horizontal overflow.
- Existing routes, actions, writes, permissions, and navigation behave unchanged.

## Verification and screenshots

Run focused static checks, changed-file lint, typecheck, and relevant Passport/homepage browser suites. If typecheck reports only the accepted generated nullable-RPC baseline mismatch, report it without touching protected logic.

Capture Preview evidence for:

1. Security Passport overview — desktop
2. Security Passport overview — mobile (390px and check 375px)
3. Add credential flow
4. Credential display with real ASIS-style catalogue credentials visible where the available Preview data supports it
5. Share / recipient preview state
6. Homepage Passport anchor

Authenticated screenshots depend on a usable Preview session. If the unmanaged external authentication boundary prevents automated authenticated capture, verify public and local safe surfaces, preserve the blocker explicitly, and do not fabricate account data.

## Regression risks and controls

- **Trust overstatement:** reuse existing status derivation and labels; test document-reviewed versus source-verified separation.
- **Catalogue drift:** presentation consumes existing metadata only; no hardcoded credential inventory.
- **Share behavior regression:** retain handlers and payloads; test selection, preview, expiry, creation, revoke, and reissue controls.
- **Mobile overflow:** test long Swedish/English labels, credential names, and action wrapping at 375/390px.
- **Navigation drift:** preserve all canonical Passport and homepage destinations.
- **Rollback:** revert this isolated visual branch; no database rollback is required.

## Final report

Report exact files changed, checks run and results, screenshot evidence, unresolved authentication limits, regression/security status, rollback method, branch and commit hash, and the exact final status: **Not merged and not published.**
