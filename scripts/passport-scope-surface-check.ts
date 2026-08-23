/**
 * Security Passport — what each audience actually SEES of a scope.
 *
 * The database boundary is asserted in
 * supabase/tests/security_passport_scope_disclosure_boundary_test.sql. This is
 * the other half: the payload can be perfectly correct and the surface can
 * still fail to render it, or render it to the wrong reader.
 *
 * That is exactly what happened. `sp_disclosure_payload` carried the scope to
 * an application-scoped employer, `buildRecipientPresentation` read it — and
 * `RecipientPassportCard`, which is what the employer's ApplicationPassportPanel
 * renders, never mentioned it. The employer saw an approval with no limits
 * stated at all.
 *
 * Three audiences, three different correct answers:
 *
 *   application-scoped employer   the exact protected object
 *   public card                   "limited, details withheld" and NOT the object
 *   social / export               neither the object nor the words
 *
 * Run: bun run passport-scope-surface:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRecipientPresentation } from "../src/lib/security-passport/recipient-presentation";
import { buildSocialCard, SOCIAL_FORBIDDEN_KEYS } from "../src/lib/security-passport/social";
import { PERSONAS, FIXTURE_EVALUATION_DATE } from "../src/lib/security-passport/fixtures/personas";
import type { RecipientPayloadActive } from "../src/lib/security-passport/packages";

const PROTECTED_OBJECT = "Skyddsobjekt: Hamnen, Kaj 12";
const TODAY = "2026-08-23";

let checks = 0;
const failures: string[] = [];

function ok(condition: boolean, label: string) {
  checks += 1;
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

/** A disclosed skyddsvakt approval, as sp_disclosure_payload emits it. The
 *  `authorisation_scope` field is present or null exactly as the database
 *  decides — this never invents a different rule. */
function payload(opts: {
  readonly package: RecipientPayloadActive["package"];
  readonly exactScope: string | null;
}): RecipientPayloadActive {
  return {
    status: "active",
    package: opts.package,
    purpose: null,
    expires_at: null,
    last_updated: "2026-08-20T09:00:00Z",
    holder: "Stina Testsson",
    privacy_mode: "full_name",
    profession_slug: "vaktare",
    jurisdiction: "SE",
    verified_claims: [
      {
        id: "c-sv",
        type: "licence",
        title: "Skyddsvaktsförordnande",
        credential_code: "SV",
        issuer: "Länsstyrelsen",
        jurisdiction: "SE",
        sub_jurisdiction: null,
        scope_limited: true,
        authorisation_scope: opts.exactScope,
        issued_on: "2025-01-01",
        valid_until: "2029-01-15",
        assertion: "verified",
        lifecycle: "active",
        verified_at: "2025-02-01T09:00:00Z",
        verifier_organisation: "CQrityjob",
        verification_method: "document_review",
      },
    ],
    verified_experience: [],
    verified_experience_days: 0,
  };
}

console.log("passport-scope-surface-check\n");

/* ------------------------------------------------------------------ */
console.log("GROUP 1 -- the application-scoped employer sees the exact scope");

{
  // What sp_disclosure_payload emits for an application disclosure.
  const p = buildRecipientPresentation(
    payload({ package: "employer_review", exactScope: PROTECTED_OBJECT }),
    TODAY,
  );
  const c = p.credentials[0];

  ok(c !== undefined, "POSITIVE CONTROL the disclosure carries the credential at all");
  ok(c.scopeLimited === true, "the presentation reports the approval as limited");
  ok(
    c.authorisationScope === PROTECTED_OBJECT,
    "and carries the exact protected object through to the surface",
  );
}

/* ------------------------------------------------------------------ */
console.log("\nGROUP 2 -- the public card is told there are limits, not what they are");

{
  const p = buildRecipientPresentation(
    payload({ package: "public_card", exactScope: null }),
    TODAY,
  );
  const c = p.credentials[0];

  ok(c.scopeLimited === true, "the public card still says the approval IS limited");
  ok(
    c.authorisationScope === null,
    "MUTATION: and carries no protected object for the surface to render",
  );
  ok(
    JSON.stringify(p).includes(PROTECTED_OBJECT) === false,
    "MUTATION: the object appears nowhere in the whole public presentation",
  );
}

/* ------------------------------------------------------------------ */
console.log("\nGROUP 3 -- one component renders it, so the surfaces cannot disagree");

{
  // The employer's ApplicationPassportPanel renders RecipientPassportCard.
  // If that component does not render the scope, the employer never sees it —
  // which is the defect this check exists for.
  const card = readFileSync(
    join(process.cwd(), "src/components/security-passport/live/RecipientPassportCard.tsx"),
    "utf8",
  );
  ok(
    card.includes("CredentialScopeLine"),
    "RecipientPassportCard renders the scope line — this is what the employer panel draws",
  );

  const panel = readFileSync(
    join(process.cwd(), "src/components/employer/ApplicationPassportPanel.tsx"),
    "utf8",
  );
  ok(
    panel.includes("RecipientPassportCard"),
    "POSITIVE CONTROL the employer panel does render that card",
  );

  const publicPage = readFileSync(join(process.cwd(), "src/routes/p.$token.tsx"), "utf8");
  ok(
    publicPage.includes("CredentialScopeLine"),
    "the public page renders the same component, not a second interpretation",
  );

  const shared = readFileSync(
    join(process.cwd(), "src/components/security-passport/live/CredentialScopeLine.tsx"),
    "utf8",
  );
  ok(
    shared.includes("rec.scopeWithheld"),
    "and the shared component falls back to the withheld wording rather than silence",
  );
  ok(
    !/authorisationScope\s*\?\?\s*credential\./.test(shared) &&
      shared.includes("credential.authorisationScope ?? pt("),
    "it renders what the payload decided and never reaches for another source",
  );

  // The holder must be able to READ what they own, not only type it.
  const holderView = readFileSync(
    join(process.cwd(), "src/routes/_authenticated.passport.entry.$kind.$entryId.tsx"),
    "utf8",
  );
  ok(
    holderView.includes("claim.authorisationScope"),
    "the holder's own entry view displays the stored scope, not only the correction input",
  );
}

/* ------------------------------------------------------------------ */
console.log("\nGROUP 4 -- nothing about the scope reaches a social or exported card");

{
  ok(
    SOCIAL_FORBIDDEN_KEYS.includes("authorisationScope") &&
      SOCIAL_FORBIDDEN_KEYS.includes("authorisation_scope") &&
      SOCIAL_FORBIDDEN_KEYS.includes("scopeRestriction"),
    "all three scope field names are on the social forbidden-key list",
  );

  let leaked = 0;
  let cards = 0;
  for (const persona of PERSONAS) {
    for (const privacy of ["full_name", "initials", "anonymous"] as const) {
      const social = buildSocialCard(persona, FIXTURE_EVALUATION_DATE, {
        privacyMode: privacy,
        anonymousLabel: "Anonym innehavare",
      });
      cards += 1;
      const serialised = JSON.stringify(social);
      if (serialised.includes("Skyddsobjekt") || serialised.includes("authorisationScope"))
        leaked += 1;
      // The words themselves must not travel either: a social card saying
      // "limited approval" invites the reader to ask what the limit is, on a
      // surface with no way to answer and no revocation.
      if (serialised.includes("scopeLimited") || serialised.includes("scope_limited")) leaked += 1;
    }
  }
  ok(
    leaked === 0,
    `MUTATION: no scope field, protected object or limit wording in ${cards} social cards`,
  );
}

/* ------------------------------------------------------------------ */

console.log("");
if (failures.length > 0) {
  console.error(`passport-scope-surface-check FAILED (${failures.length} of ${checks}):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`passport-scope-surface-check: ${checks} assertions passed.`);
