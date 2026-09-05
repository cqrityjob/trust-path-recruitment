/**
 * Security Passport — the professional identity engine, asserted by table.
 *
 * ── WHY THIS SUITE IS ADVERSARIAL ──────────────────────────────────────
 *
 * Almost every case here is a MUTATION: it holds one credential and asserts
 * that a title the product must not grant is absent. A suite that only checked
 * "OV produces Ordningsvakt" would pass just as happily against an engine that
 * returned every title for everybody.
 *
 * Two cases are load-bearing above the rest, and the mission names both:
 *
 *   * VU1 alone must NEVER produce the competence title Väktare.
 *   * Ordningsvakt TRAINING must NEVER produce the title Ordningsvakt.
 *
 * Both are asserted from the engine's own output AND from the rule data, so
 * neither an engine change nor a rule edit can make them pass silently.
 *
 * ── AND EVERY EXPIRY STATE ─────────────────────────────────────────────
 *
 * A verified appointment that lapsed yesterday, one that was revoked, one that
 * was disputed and one that was superseded must all produce nothing, while the
 * credential itself remains visible elsewhere with its state. That is the
 * whole reason derivation happens at read time.
 *
 * Run: bun run passport-identity-engine:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveVerifiedIdentity,
  derivePreviewIdentity,
} from "../src/lib/security-passport/identity/visibility";
import { deriveProfessionalIdentity } from "../src/lib/security-passport/identity/derive";
import { MIRRORED_TITLE_RULES } from "../src/lib/security-passport/identity/market-rules";
import {
  headlineIsSelfDeclared,
  labelFor,
  professionLine,
} from "../src/lib/security-passport/identity/presentation";
import type { ProfessionalIdentity } from "../src/lib/security-passport/identity/types";
import type { AssertionLevel, Claim, LifecycleState } from "../src/lib/security-passport/types";

const TODAY = "2026-08-22";
const FUTURE = "2028-01-31";
const PAST = "2026-01-31";

let checks = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  checks += 1;
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

/* ------------------------------------------------------------------ */

let seq = 0;
function claim(
  credentialCode: string,
  opts: {
    assertion?: AssertionLevel;
    lifecycle?: LifecycleState;
    validUntil?: string | null;
    jurisdiction?: string | null;
    scope?: string | null;
  } = {},
): Claim {
  seq += 1;
  return {
    id: `c-${seq}`,
    claimType: "training",
    credentialCode,
    skillCode: null,
    skillLevel: null,
    titleSv: credentialCode,
    titleEn: credentialCode,
    issuerName: "Testutbildarna AB",
    jurisdictionCode: opts.jurisdiction === undefined ? "SE" : opts.jurisdiction,
    subJurisdictionCode: null,
    authorisationScope: opts.scope ?? null,
    issuedOn: "2024-01-01",
    validFrom: "2024-01-01",
    validUntil: opts.validUntil === undefined ? null : opts.validUntil,
    assertionLevel: opts.assertion ?? "verified",
    lifecycleState: opts.lifecycle ?? "active",
    verifierName: "CQrityjob",
    // CQrityjob verifies credentials by reading the document. Stated
    // rather than left null: an approval must say how it was reached.
    verificationMethod: "document_review" as const,
    verifiedOn: "2026-01-01",
    limitationSv: null,
    limitationEn: null,
    versionNo: 1,
    supersedesClaimId: null,
  };
}

// ── WHY THE RAW ENGINE, AND NOT THE AUDIENCE GATE ────────────────────
//
// This file tests the RULES: which credentials, held together and current,
// support which outcome. It therefore calls the engine directly, where
// "verified" means the stored assertion level.
//
// The AUDIENCE GATE (deriveVerifiedIdentity / derivePreviewIdentity) applies
// a second question on top -- what does the recorded METHOD actually prove --
// and since the owner decision of 2026-09-05 no credential passes it: a
// CQrityjob document review is documented, and issuer confirmation has no
// structure behind it until the Issuer Foundation release. That is asserted
// as its own group at the end of this file, and in
// scripts/passport-trust-source-check.tsx. Testing the rules through the gate
// would assert nothing about the rules -- every answer would be empty.
const verified = (claims: readonly Claim[]) =>
  deriveProfessionalIdentity(claims, MIRRORED_TITLE_RULES, TODAY);
const preview = (claims: readonly Claim[]) =>
  deriveProfessionalIdentity(claims, MIRRORED_TITLE_RULES, TODAY, { includeSelfDeclared: true });

/** The four keys that actually hold derived titles.
 *
 *  This was `keyof ProfessionalIdentity` with a cast, which also admitted
 *  `engineVersion`, `evaluatedOn` and `includesSelfDeclared` — a string, a
 *  string and a boolean — and then asserted they were arrays of titles. The
 *  scripts typecheck added by B2 caught it the moment scripts/ came into
 *  scope, which is precisely the point of adding it. */
type TitleBucket =
  | "educationCompleted"
  | "professionalCompetence"
  | "localEligibility"
  | "activeTitles";

const rules = (id: ProfessionalIdentity, kind: TitleBucket) =>
  id[kind].map((t) => t.ruleCode).sort();

const has = (id: ProfessionalIdentity, kind: TitleBucket, code: string) =>
  rules(id, kind).includes(code);

/* ================================================================== */
console.log("passport-identity-engine-check\n");
console.log("GROUP 1 -- one credential at a time, and what it does NOT grant");

const vu1 = verified([claim("VU1")]);
assert(
  rules(vu1, "educationCompleted").join(",") === "SE_VU1_COMPLETED",
  "VU1 alone produces exactly one completed-education row",
);
// THE mutation test. If this ever passes wrongly, a course has become a
// professional competence claim.
assert(
  vu1.professionalCompetence.length === 0,
  "MUTATION: VU1 alone does NOT produce the competence title Väktare",
);
assert(vu1.activeTitles.length === 0, "MUTATION: VU1 alone produces no active title");
assert(vu1.localEligibility.length === 0, "MUTATION: VU1 alone produces no local eligibility");

const vu2 = verified([claim("VU2")]);
assert(
  vu2.professionalCompetence.length === 0,
  "MUTATION: VU2 alone does NOT produce the competence title Väktare either",
);

const ovTraining = verified([claim("OV_TRAINING")]);
assert(
  rules(ovTraining, "educationCompleted").join(",") === "SE_OV_TRAINING_COMPLETED",
  "ordningsvakt training records as completed education",
);
// The second mutation test the mission names by hand.
assert(
  ovTraining.activeTitles.length === 0,
  "MUTATION: ordningsvakt TRAINING does NOT produce the title Ordningsvakt",
);
assert(
  ovTraining.localEligibility.length === 0,
  "MUTATION: ordningsvakt training grants no local eligibility",
);

console.log("\nGROUP 2 -- the AND, and the appointment as the source of authority");

const bothSteps = verified([claim("VU1"), claim("VU2")]);
assert(
  has(bothSteps, "professionalCompetence", "SE_VAKTARE_COMPETENCE"),
  "VU1 AND VU2 together produce the competence title Väktare",
);
assert(
  bothSteps.activeTitles.length === 0,
  "MUTATION: even VU1 + VU2 produces no ACTIVE TITLE — competence is not authority",
);
assert(
  bothSteps.educationCompleted.length === 2,
  "both completed courses stay visible beside the competence they support",
);

const ov = verified([claim("OV", { validUntil: FUTURE })]);
assert(
  has(ov, "activeTitles", "SE_ORDNINGSVAKT_TITLE"),
  "a current, verified appointment produces the active title Ordningsvakt",
);
assert(
  has(ov, "localEligibility", "SE_ORDNINGSVAKT_ELIGIBILITY"),
  "the same appointment separately produces local eligibility",
);
assert(
  ov.professionalCompetence.length === 0,
  "MUTATION: an appointment does not retroactively grant Väktare competence",
);

const approval = verified([
  claim("SE_PERSONNEL_APPROVAL", { validUntil: FUTURE, scope: "Stadsskydd Sverige AB" }),
]);
assert(
  has(approval, "localEligibility", "SE_PERSONNEL_APPROVAL_CHECKED"),
  "a personnel approval produces local eligibility",
);
assert(
  approval.activeTitles.length === 0,
  "MUTATION: a personnel approval is NOT a professional title",
);
assert(
  approval.localEligibility[0].scopeRestriction === "Stadsskydd Sverige AB",
  "the scope travels with the derived eligibility rather than being dropped",
);

console.log("\nGROUP 3 -- expiry, revocation and dispute end a title on the same read");

for (const [label, opts] of [
  ["expired yesterday", { validUntil: PAST }],
  ["revoked", { validUntil: FUTURE, lifecycle: "revoked" as LifecycleState }],
  ["disputed", { validUntil: FUTURE, lifecycle: "disputed" as LifecycleState }],
  ["superseded", { validUntil: FUTURE, lifecycle: "superseded" as LifecycleState }],
] as const) {
  const id = verified([claim("OV", opts)]);
  assert(
    id.activeTitles.length === 0 && id.localEligibility.length === 0,
    `MUTATION: an appointment that is ${label} produces neither title nor eligibility`,
  );
}

// The positive control for GROUP 3. Without it, every assertion above would
// also pass against an engine that produced nothing at all.
assert(
  verified([claim("OV", { validUntil: FUTURE })]).activeTitles.length === 1,
  "POSITIVE CONTROL: the same appointment, current, still produces its title",
);

console.log("\nGROUP 4 -- evidence, and what the holder alone may preview");

const selfDeclaredOv = [claim("OV", { validUntil: FUTURE, assertion: "self_declared" })];
assert(
  verified(selfDeclaredOv).activeTitles.length === 0,
  "MUTATION: a self-declared appointment produces NO title in the verified derivation",
);

const previewed = preview(selfDeclaredOv);
assert(
  previewed.activeTitles.length === 1 && previewed.activeTitles[0].selfDeclared,
  "the holder's own preview shows it, flagged as self-declared",
);
assert(
  previewed.includesSelfDeclared,
  "the identity itself records that self-declared evidence was admitted",
);

const documentOnly = verified([
  claim("OV", { validUntil: FUTURE, assertion: "document_provided" }),
]);
assert(
  documentOnly.activeTitles.length === 0,
  "MUTATION: an uploaded document is not a verification, and grants no title",
);

// Weakest-link evidence: one verified credential must not launder a
// self-declared one standing beside it.
const mixed = preview([claim("VU1"), claim("VU2", { assertion: "self_declared" })]);
assert(
  mixed.professionalCompetence.length === 1 &&
    mixed.professionalCompetence[0].evidence === "self_declared" &&
    mixed.professionalCompetence[0].selfDeclared,
  "a title built from mixed evidence takes the WEAKEST of its sources",
);

console.log("\nGROUP 5 -- several titles at once, never collapsed");

const multi = verified([
  claim("VU1"),
  claim("VU2"),
  claim("OV", { validUntil: FUTURE }),
  claim("SV", { validUntil: FUTURE, scope: "Skyddsobjekt: Hamnen" }),
]);
assert(multi.activeTitles.length === 2, "a holder may carry two active titles at once");
assert(
  has(multi, "activeTitles", "SE_ORDNINGSVAKT_TITLE") &&
    has(multi, "activeTitles", "SE_SKYDDSVAKT_TITLE"),
  "Ordningsvakt and Skyddsvakt appear as two separate titles",
);
assert(
  professionLine(multi, "sv", "—") === "Ordningsvakt · Skyddsvakt",
  "the headline joins them rather than inventing a combined word",
);
assert(
  has(multi, "professionalCompetence", "SE_VAKTARE_COMPETENCE"),
  "the underlying Väktare competence is still derived beside them",
);
assert(
  professionLine(multi, "sv", "—").includes("Väktare") === false,
  "MUTATION: the headline shows the ACTIVE titles only, not the competence tier",
);

console.log("\nGROUP 5b -- A5: training is called training");

// Owner decision 1. VU1 and VU2 are grundutbildning. Completing both is not a
// personnel approval and not an appointment, and the WORDING must not suggest
// otherwise — the rule already refused to derive an active title from them.
{
  const vu1Only = verified([claim("VU1")]);
  const vu2Only = verified([claim("VU2")]);
  const both = verified([claim("VU1"), claim("VU2")]);

  assert(
    professionLine(vu1Only, "sv", "—") === "Väktarutbildning 1 (VU1) genomförd",
    "VU1 alone renders its own training and nothing else",
  );
  assert(
    professionLine(vu2Only, "sv", "—") === "Väktarutbildning 2 (VU2) genomförd",
    "VU2 alone renders its own training and nothing else",
  );
  assert(
    professionLine(both, "sv", "—") === "Väktarutbildning (VU1 + VU2)",
    "VU1 + VU2 renders the approved training wording",
  );
  assert(
    professionLine(both, "en", "—") === "Security Guard Training (VU1 + VU2)",
    "and its approved English wording",
  );
  // The headline is what a reader sees. It must never be the bare word.
  assert(
    professionLine(both, "sv", "—") !== "Väktare" &&
      professionLine(vu1Only, "sv", "—") !== "Väktare" &&
      professionLine(vu2Only, "sv", "—") !== "Väktare",
    "MUTATION: no combination of VU1 and VU2 renders the bare title Väktare",
  );
  // And the tier is unchanged — the label moved, the architecture did not.
  assert(
    both.professionalCompetence.length === 1 && both.activeTitles.length === 0,
    "the rewording left the tier alone: still competence, still no active title",
  );
}

console.log("\nGROUP 5c -- B1: a previewed title is marked, and never travels");

{
  const selfDeclared = [claim("OV", { validUntil: FUTURE, assertion: "self_declared" })];
  const preview = derivePreviewIdentity(selfDeclared, MIRRORED_TITLE_RULES, TODAY);
  const verified = deriveVerifiedIdentity(selfDeclared, MIRRORED_TITLE_RULES, TODAY);

  assert(
    headlineIsSelfDeclared(preview),
    "the holder's preview reports that its headline is self-declared",
  );
  assert(
    !headlineIsSelfDeclared(verified) && verified.activeTitles.length === 0,
    "MUTATION: the verified derivation has no such title to mark in the first place",
  );

  // The marker is only worth anything if something renders it. This is the
  // defect B1 names: the function existed, the copy existed in both languages,
  // and no call site did.
  const rendered = readFileSync(
    join(process.cwd(), "src/components/security-passport/PassportOverview.tsx"),
    "utf8",
  );
  assert(
    rendered.includes("headlineIsSelfDeclared") && rendered.includes("identity.selfDeclared"),
    "PassportOverview actually renders the marker — an unused export marks nothing",
  );

  const card = readFileSync(
    join(process.cwd(), "src/components/security-passport/PassportCard.tsx"),
    "utf8",
  );
  assert(
    card.includes("headlineIsSelfDeclared"),
    "PassportCard carries the same guard, for the artefact people screenshot",
  );

  // A mixed holder: the appointment that meets the bar stands, the
  // self-declared one is absent from what a recipient would see. Read at the
  // ENGINE, where "verified" is the stored level -- the audience gate adds
  // the METHOD question on top and is asserted in GROUP 9.
  // deriveProfessionalIdentity by name, not the module-level helper: this
  // block shadows it with a local const of the same name (the gate reading
  // used two assertions above).
  const mixed = deriveProfessionalIdentity(
    [
      claim("OV", { validUntil: FUTURE }),
      claim("SV", { validUntil: FUTURE, assertion: "self_declared" }),
    ],
    MIRRORED_TITLE_RULES,
    TODAY,
  );
  assert(
    mixed.activeTitles.length === 1 && mixed.activeTitles[0].ruleCode === "SE_ORDNINGSVAKT_TITLE",
    "MUTATION: a self-declared credential adds no title to what a recipient sees",
  );
}

console.log("\nGROUP 6 -- language changes the label and nothing else");

const sv = professionLine(ov, "sv", "—");
const en = professionLine(ov, "en", "—");
assert(sv === "Ordningsvakt", "Swedish shows the legal name as it appears on the decision");
assert(
  en === "Public Order Guard (Ordningsvakt)",
  "English explains it AND keeps the Swedish word a reader must check against",
);
// A4. The surfaces append the jurisdiction themselves, so a label that also
// carried it printed "· Sweden · Sweden" on screen. No derived label may name
// a COUNTRY; Dubai's emirate is not a country and is deliberately kept.
assert(
  !/(Sweden|Sverige|United Kingdom|UAE|United Arab Emirates)\s*$/.test(en) &&
    !/(Sweden|Sverige|United Kingdom|UAE|United Arab Emirates)\s*$/.test(sv),
  "MUTATION: a derived label never ends in a country — the surface appends it",
);
assert(
  MIRRORED_TITLE_RULES.every(
    (r) =>
      !/(Sweden|Sverige|United Kingdom|UAE|United Arab Emirates)\s*$/.test(r.nameEn) &&
      !/(Sweden|Sverige|United Kingdom|UAE|United Arab Emirates)\s*$/.test(r.nameLocal),
  ),
  "MUTATION: no rule in the whole mirror ends in a country name",
);
assert(sv !== en, "the two languages genuinely differ");

const svId = verified([claim("OV", { validUntil: FUTURE })]);
assert(
  JSON.stringify(rules(svId, "activeTitles")) === JSON.stringify(rules(ov, "activeTitles")),
  "MUTATION: the derivation is identical regardless of the reader's language",
);
assert(
  labelFor(ov.activeTitles[0], "ar") === ov.activeTitles[0].nameEn,
  "an unreviewed Arabic label falls back to English rather than being invented",
);

console.log("\nGROUP 7 -- nothing crosses a market");

const britishVu1 = verified([claim("VU1", { jurisdiction: "GB" })]);
assert(
  britishVu1.educationCompleted.length === 1,
  "the engine derives from the claim it is given, whatever jurisdiction it carries",
);
assert(
  britishVu1.educationCompleted[0].jurisdictionCode === "GB",
  "and the derived output carries that jurisdiction rather than assuming Sweden",
);

const straddling = verified([
  claim("VU1", { jurisdiction: "SE" }),
  claim("VU2", { jurisdiction: "GB" }),
]);
assert(
  straddling.professionalCompetence.length === 0,
  "MUTATION: sources from two different countries cannot jointly support one local title",
);

const noJurisdiction = verified([claim("VU1", { jurisdiction: null })]);
assert(
  noJurisdiction.educationCompleted.length === 0,
  "MUTATION: a claim with no jurisdiction derives nothing — a title must say where it applies",
);

console.log("\nGROUP 8 -- the empty Passport says so honestly");

const empty = verified([]);
assert(
  empty.activeTitles.length === 0 &&
    empty.professionalCompetence.length === 0 &&
    empty.educationCompleted.length === 0 &&
    empty.localEligibility.length === 0,
  "an empty Passport derives nothing at all",
);
assert(
  professionLine(empty, "sv", "Ingen aktiv yrkestitel") === "Ingen aktiv yrkestitel",
  "and renders the caller's honest fallback rather than a borrowed default",
);

console.log("\nGROUP 9 -- the rule data itself forbids the two headline mistakes");

const competence = MIRRORED_TITLE_RULES.find((r) => r.code === "SE_VAKTARE_COMPETENCE");
assert(
  competence !== undefined &&
    competence.requiresCredentialCodes.length === 2 &&
    competence.requiresCredentialCodes.includes("VU1") &&
    competence.requiresCredentialCodes.includes("VU2"),
  "the Väktare rule requires BOTH training steps in the data, not just in the engine",
);

const ovTitle = MIRRORED_TITLE_RULES.find((r) => r.code === "SE_ORDNINGSVAKT_TITLE");
assert(
  ovTitle !== undefined &&
    ovTitle.requiresCredentialCodes.join(",") === "OV" &&
    ovTitle.requiresAssertionLevel === "verified" &&
    ovTitle.requiresCurrentValidity,
  "the Ordningsvakt title rule names the APPOINTMENT, verified and current",
);
assert(
  MIRRORED_TITLE_RULES.filter((r) => r.outputKind === "active_title").every(
    (r) => !r.requiresCredentialCodes.some((c) => c.includes("TRAINING")),
  ),
  "MUTATION: no active-title rule anywhere may rest on a training credential",
);
assert(
  MIRRORED_TITLE_RULES.filter(
    (r) => r.outputKind === "active_title" || r.outputKind === "local_eligibility",
  ).every((r) => r.requiresAssertionLevel === "verified" && r.requiresCurrentValidity),
  "every authority-bearing rule demands verified, current evidence",
);

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
console.log("");
console.log("GROUP 9 -- the audience gate: what the recorded METHOD proves");
// The rules above are unchanged. What changed on 2026-09-05 is the bar in
// front of them: a title, a licence, an eligibility or an authority
// recognition may rest only on a SOURCE confirmation, and no credential can
// carry one today. The gate is where that is applied, once, for every
// audience -- so a rule that fires on the raw engine derives nothing through
// it, and will derive again, unchanged, when the Issuer Foundation release
// gives an issuer a structural identity.
{
  const gate = (claims: readonly Claim[]) =>
    deriveVerifiedIdentity(claims, MIRRORED_TITLE_RULES, TODAY);
  const withProvenance = (code: string, org: string | null, method: string | null): Claim => ({
    ...claim(code),
    verifierName: org,
    verificationMethod: method as Claim["verificationMethod"],
  });

  assert(
    rules(verified([claim("VU1"), claim("VU2")]), "professionalCompetence").length > 0,
    "9.1 the rule still fires on the raw engine -- VU1 + VU2 support the competence",
  );
  for (const [label, c] of [
    ["a CQrityjob document review", withProvenance("VU1", "CQrityjob", "document_review")],
    [
      "a legacy issuer confirmation by CQrityjob",
      withProvenance("VU1", "CQrityjob", "issuer_confirmation"),
    ],
    [
      "an issuer confirmation naming an authority",
      withProvenance("VU1", "Polismyndigheten", "issuer_confirmation"),
    ],
    [
      "an employer confirmation on a credential",
      withProvenance("VU1", "Bevakning AB", "employer_confirmation"),
    ],
    ["a verified level with no recorded method", withProvenance("VU1", null, null)],
  ] as const) {
    const id = gate([c]);
    assert(
      (
        [
          "educationCompleted",
          "professionalCompetence",
          "localEligibility",
          "activeTitles",
        ] as const
      ).every((k) => rules(id, k).length === 0),
      `9.2 ${label} derives no education, competence, eligibility or title`,
    );
  }
  assert(
    gate([withProvenance("SE_PERSONNEL_APPROVAL", "Länsstyrelsen", "issuer_confirmation")])
      .localEligibility.length === 0,
    "9.3 an issuer-confirmed personnel approval derives no local eligibility either",
  );
  assert(
    rules(verified([claim("SE_PERSONNEL_APPROVAL")]), "localEligibility").length > 0,
    "9.4 and the same rule DOES fire on the raw engine -- the gate is the bar, not a broken rule",
  );
}

console.log("");
if (failures.length > 0) {
  console.error(`passport-identity-engine-check FAILED (${failures.length} of ${checks}):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`passport-identity-engine-check: ${checks} assertions passed.`);
