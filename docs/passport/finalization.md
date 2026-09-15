# Passport finalization

Authoritative baseline: 6fbf4f61edc006bfc33749d65f7348cc7a47fd0e. Owner waived recovery of Fable's analysis-only workspace. Hosted changes are not authorized.

## Unit 1 — ownership and read models

Existing: one canonical Profile/CV writer and independent verification/lifecycle axes. Gap: Passport's shared snapshot includes employment and general CV claims. Added a pure credential-only projection without changing the v1/CV snapshot. Current title reads security_career_profiles and the published cig_professions catalogue, matching ProfessionalIdentityV1, and never falls back to the legacy Passport headline.

Passport includes certifications, licences and governed training/authorisation credentials. Generic courses, degrees, memberships, skills and employment stay with CV. No records are copied or deleted.

Validation: 9 domain tests passed (12 expectations); application typecheck and changed-file lint recorded in local logs.

## Lint baseline

Full original output: finalization-evidence/lint-baseline.log.gz (gzip). Uncompressed SHA-256: 011e7592b393fe5dc464c1cb1006c6bdc8fc245f1f932f627b421a5b29560bcc.

Tracked files: 1,117 errors / 74 warnings. Nested historical worktrees: 98,253 errors / 395 warnings. Full command: 99,370 errors / 469 warnings. Owner accepts these as pre-existing debt. Final comparison must distinguish tracked branch files from other worktrees and enforce no newly introduced findings.
