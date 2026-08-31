// CAREER JOURNEY + CANONICAL PROFESSIONAL PROFILE — regression.
//
// ── THE TWO DEFECTS THIS FILE EXISTS FOR ───────────────────────────────
//
// 1. ONE FACT, THREE HOMES. "What is your current profession?" was
//    writable in "Din karriärprofil" (security_career_profiles), in the
//    Passport's "Mina uppgifter" (sp_passport_profiles) and, per run, in
//    the Career Discovery context step. Nothing kept the first two in step,
//    so a candidate who corrected it in one place found the old answer in
//    the other, and no surface could say which the product believed.
//
// 2. A REPORT THAT CONTRADICTED ITSELF. The readiness language sat inside
//    a frozen snapshot, so it could state "possible next step" beside a
//    sentence saying the product did not know the candidate's situation --
//    and, once frozen, could never be corrected by the candidate telling
//    it. Updating a profile did nothing; retaking the whole assessment was
//    the only lever.
//
// ── WHAT IS ASSERTED, AND WHY IT IS ASSERTED THIS WAY ──────────────────
//
// Behaviour where behaviour is testable (the readiness engine is pure, so
// it is exercised directly against the scenarios in the brief), and SHAPE
// where behaviour alone would only prove that two implementations agree
// today: a second writer for the profession is a defect that reintroduces
// itself the moment somebody adds a field, and no output test would notice.
//
// Plain TS run with Bun, matching this repository's scripts/*-check.ts
// convention.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  computeCareerJourney,
  hasUsableSituation,
  resolveBaseline,
} from "../src/lib/career-journey/readiness";
import type {
  CareerJourney,
  JourneyProfileInput,
  JourneyTargetInput,
  ReadinessCategory,
} from "../src/lib/career-journey/types";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

console.log("career-journey-check\n");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function target(over: Partial<JourneyTargetInput> = {}): JourneyTargetInput {
  return {
    professionId: "p-entry-tech",
    cigProfessionSlug: "tekniker",
    careerAreaId: "SCA03",
    titleSv: "Säkerhetstekniker",
    titleEn: "Security Technician",
    careerStage: "entry",
    entryRole: true,
    regulated: false,
    transitionDifficulty: 4,
    ...over,
  };
}

function profile(over: Partial<JourneyProfileInput> = {}): JourneyProfileInput {
  return {
    currentStatus: "working_in_industry",
    currentProfessionSlug: null,
    currentProfessionTitleSv: null,
    currentProfessionTitleEn: null,
    currentProfessionOther: null,
    yearsOfExperience: null,
    currentProfessionStage: null,
    currentProfessionAreaId: null,
    ...over,
  };
}

function categoriesOf(j: CareerJourney): ReadinessCategory[] {
  return j.professions.map((p) => p.category);
}

/* ══════════════════════════════════════════════════════════════════════
   TC1 / TC8 — NO PROFILE: NOT ENOUGH INFORMATION, AND NOTHING ELSE
   ══════════════════════════════════════════════════════════════════════ */
console.log("UNKNOWN SITUATION -- the honest floor");
{
  const anonymous = computeCareerJourney({
    profile: null,
    targets: [target(), target({ professionId: "p2", careerStage: "senior" })],
    reachableCigSlugs: new Set(),
    evidence: null,
  });

  ck("an anonymous candidate's journey is not 'known'", anonymous.known === false);
  ck(
    "and EVERY profession reads not_enough_information",
    categoriesOf(anonymous).every((c) => c === "not_enough_information"),
  );
  // The contradiction the whole model exists to prevent, stated as an
  // assertion rather than as a comment: no path language may coexist with
  // "we do not know your situation".
  ck(
    "no path claim can appear alongside an unknown situation",
    !categoriesOf(anonymous).some((c) =>
      ["explore_now", "possible_next_step", "longer_term_direction"].includes(c),
    ),
  );
  ck("provenance is 'unknown', not 'self_reported'", anonymous.provenance === "unknown");
  ck(
    "and there is nothing to render under 'where you are today'",
    anonymous.whereYouAreToday === null,
  );

  // An EMPTY profile row is not the same object as no profile row, and the
  // rule must treat them identically -- a deleted profile (TC8) leaves a row
  // full of nulls behind.
  const emptied = computeCareerJourney({
    profile: profile({ currentStatus: null }),
    targets: [target()],
    reachableCigSlugs: new Set(),
    evidence: null,
  });
  ck("an emptied profile falls back to the same unknown state", emptied.known === false);

  // "Annat" names no situation. Treating it as one would place somebody at a
  // career level on the strength of them saying none of the options fit.
  ck(
    "'other' alone is not a usable situation",
    !hasUsableSituation(profile({ currentStatus: "other" })),
  );
  // Experience with no role places nobody anywhere.
  ck(
    "experience alone is not a usable situation",
    !hasUsableSituation(profile({ currentStatus: null, yearsOfExperience: "10+" })),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TC3 — BEGINNER: ENTRY ROLES OPEN, SENIOR ROLES HONESTLY DISTANT
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nBEGINNER -- new to the industry");
{
  const beginner = profile({ currentStatus: "new_to_industry" });
  const j = computeCareerJourney({
    profile: beginner,
    targets: [
      target({ professionId: "entry", careerStage: "entry", entryRole: true }),
      target({ professionId: "developing", careerStage: "developing", entryRole: false }),
      target({ professionId: "senior", careerStage: "senior", entryRole: false }),
    ],
    reachableCigSlugs: new Set(),
    evidence: null,
  });

  ck("the journey is known", j.known === true);
  ck("an entry role is explorable now", j.professions[0].category === "explore_now");
  ck(
    "a developing role is not called a next step from nowhere",
    j.professions[1].category === "development_needed",
  );
  ck(
    "a senior role is a longer-term direction",
    j.professions[2].category === "longer_term_direction",
  );
  ck("the baseline for a beginner is entry", resolveBaseline(beginner) === 0);
}

/* ══════════════════════════════════════════════════════════════════════
   TC4 — POLICE OFFICER, 8+ YEARS: THE BRIEF'S WORKED EXAMPLE
   ══════════════════════════════════════════════════════════════════════
   Nothing below names policing. The distinction the brief asks for falls
   out of two independent inputs -- career-level distance and graph
   adjacency -- and would fall out the same way for any senior professional
   arriving from outside the security industry's own ladder. */
console.log("\nPOLICE OFFICER 8+ YEARS -- distance and adjacency are different questions");
{
  const officer = profile({
    currentStatus: "career_change",
    currentProfessionSlug: "polis",
    currentProfessionTitleSv: "Polis",
    currentProfessionTitleEn: "Police Officer",
    yearsOfExperience: "10+",
    currentProfessionStage: "developing",
    currentProfessionAreaId: "SCA07",
  });

  ck(
    "experience raises the baseline above the role's own level, never below it",
    resolveBaseline(officer) === 2,
  );

  const j = computeCareerJourney({
    profile: officer,
    targets: [
      // TECHNICAL: real affinity, different area, no published route.
      target({ professionId: "tech", careerAreaId: "SCA03", cigProfessionSlug: "tekniker" }),
      // RISK/CRISIS: the graph knows this move.
      target({
        professionId: "risk",
        careerAreaId: "SCA05",
        cigProfessionSlug: "riskanalytiker",
        careerStage: "developing",
        entryRole: false,
      }),
      // MANAGEMENT: senior, same distance as the baseline, different area.
      target({
        professionId: "mgmt",
        careerAreaId: "SCA08",
        cigProfessionSlug: "sakerhetschef",
        careerStage: "senior",
        entryRole: false,
      }),
    ],
    reachableCigSlugs: new Set(["riskanalytiker"]),
    evidence: null,
  });

  ck(
    "a technical direction with no evidence and no route is 'development needed', not 'explore now'",
    j.professions[0].category === "development_needed",
  );
  ck(
    "and it says why: no documented route, different part of the industry",
    j.professions[0].reasons.includes("not_adjacent_to_current_work"),
  );
  ck(
    "a direction the GRAPH connects is reachable rather than aspirational",
    j.professions[1].category === "explore_now",
  );
  ck(
    "and it cites the published transition, not a similarity",
    j.professions[1].reasons.includes("adjacent_via_published_transition"),
  );
  ck(
    "security management is not declared a direct next step without evidence for it",
    j.professions[2].category === "development_needed",
  );
  ck(
    "an entry role is not offered to somebody who is not new",
    // entryRole only creates adjacency for a candidate with no current
    // profession -- an experienced person is not "new to the industry"
    // because a profession happens to be an entry route.
    j.professions[0].reasons.includes("not_adjacent_to_current_work"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TC5 — A PROFILE CHANGE MOVES THE JOURNEY AND NOTHING ELSE
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nPROFILE UPDATED AFTER THE ASSESSMENT");
{
  const targets = [
    target({ professionId: "a", careerStage: "developing", entryRole: false }),
    target({ professionId: "b", careerStage: "senior", entryRole: false }),
  ];
  const before = computeCareerJourney({
    profile: profile({ currentStatus: "new_to_industry" }),
    targets,
    reachableCigSlugs: new Set(),
    evidence: null,
  });
  const after = computeCareerJourney({
    profile: profile({
      currentStatus: "working_in_industry",
      currentProfessionSlug: "vaktare",
      currentProfessionStage: "developing",
      currentProfessionAreaId: "SCA03",
      yearsOfExperience: "5-10",
    }),
    targets,
    reachableCigSlugs: new Set(),
    evidence: null,
  });

  ck(
    "the same frozen ranking produces a different journey after a profile change",
    JSON.stringify(categoriesOf(before)) !== JSON.stringify(categoriesOf(after)),
  );
  // The affinity ORDER is the frozen report's, and the journey may never
  // re-sort it: a journey that reordered the Top 3 would contradict the
  // report it is rendered inside.
  ck(
    "the profession order is preserved exactly, before and after",
    before.professions.map((p) => p.professionId).join(",") === "a,b" &&
      after.professions.map((p) => p.professionId).join(",") === "a,b",
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TC5b — THE FROZEN INPUT IS NOT TOUCHED
   ══════════════════════════════════════════════════════════════════════
   "Updating your profile changes the interpretation, never the assessment"
   is the promise the whole model rests on, so it is checked rather than
   argued: the ranked professions handed in are compared, deep, against a
   pristine copy after two different profiles have been run over them. A
   mutation here would be invisible in the returned journey and would corrupt
   the caller's frozen snapshot in place. */
console.log("\nTHE FROZEN RANKING IS AN INPUT, NOT A WORKSPACE");
{
  const targets = [
    target({ professionId: "a", careerStage: "developing", entryRole: false }),
    target({ professionId: "b", careerStage: "senior", regulated: true }),
  ];
  const pristine = JSON.stringify(targets);

  computeCareerJourney({
    profile: profile({ currentStatus: "new_to_industry" }),
    targets,
    reachableCigSlugs: new Set(),
    evidence: null,
  });
  computeCareerJourney({
    profile: profile({
      currentProfessionSlug: "vaktare",
      currentProfessionStage: "senior",
      yearsOfExperience: "10+",
    }),
    targets,
    reachableCigSlugs: new Set(["tekniker"]),
    evidence: {
      hasPassport: true,
      verifiedCredentialCount: 3,
      verifiedExperienceCount: 2,
      // Stated rather than omitted: these cases are about verified
      // evidence, and a recorded employment would establish a situation
      // on its own -- which is a different rule, tested separately.
      recordedExperienceCount: 2,
      hasWorkCountry: true,
    },
  });

  ck("the ranked professions handed in are not mutated", JSON.stringify(targets) === pristine);

  // And the composition writes nothing. A journey that persisted anything
  // would make a report's meaning depend on when it was last opened.
  const composition = read("src/lib/career-journey/career-journey.functions.ts");
  for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
    ck(`the journey composition never calls ${write}`, !composition.includes(write));
  }
}

/* ══════════════════════════════════════════════════════════════════════
   TC6 — PASSPORT EVIDENCE: PROVENANCE, NOT A PROMOTION
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nPASSPORT EVIDENCE -- what it may and may not do");
{
  const p = profile({
    currentStatus: "working_in_industry",
    currentProfessionSlug: "vaktare",
    currentProfessionStage: "developing",
    currentProfessionAreaId: "SCA01",
  });
  const unregulated = target({
    careerAreaId: "SCA01",
    regulated: false,
    careerStage: "developing",
  });

  const without = computeCareerJourney({
    profile: p,
    targets: [unregulated],
    reachableCigSlugs: new Set(),
    evidence: {
      hasPassport: true,
      verifiedCredentialCount: 0,
      verifiedExperienceCount: 0,
      // Stated rather than omitted: these cases are about verified
      // evidence, and a recorded employment would establish a situation
      // on its own -- which is a different rule, tested separately.
      recordedExperienceCount: 0,
      hasWorkCountry: true,
    },
  });
  const with_ = computeCareerJourney({
    profile: p,
    targets: [unregulated],
    reachableCigSlugs: new Set(),
    evidence: {
      hasPassport: true,
      verifiedCredentialCount: 2,
      verifiedExperienceCount: 1,
      // Stated rather than omitted: these cases are about verified
      // evidence, and a recorded employment would establish a situation
      // on its own -- which is a different rule, tested separately.
      recordedExperienceCount: 1,
      hasWorkCountry: true,
    },
  });

  ck(
    "verified evidence NEVER raises a readiness category on its own",
    without.professions[0].category === with_.professions[0].category,
  );
  ck(
    "what it changes is the provenance label",
    without.provenance === "self_reported" &&
      with_.provenance === "self_reported_with_verified_evidence",
  );
  ck(
    "and the statement records that evidence exists",
    with_.professions[0].reasons.includes("verified_evidence_present"),
  );

  // The one place evidence is load-bearing, in the direction of CAUTION.
  const regulated = target({ regulated: true, careerAreaId: "SCA01", careerStage: "developing" });
  const gated = computeCareerJourney({
    profile: p,
    targets: [regulated],
    reachableCigSlugs: new Set(),
    evidence: null,
  });
  ck(
    "a regulated profession with no verified credential is 'formal pathway required'",
    gated.professions[0].category === "formal_pathway_required",
  );
  ck(
    "and that outranks a high stage-compatibility, which is the point",
    gated.professions[0].reasons.includes("regulated_without_verified_credential"),
  );
  const lifted = computeCareerJourney({
    profile: p,
    targets: [regulated],
    reachableCigSlugs: new Set(),
    evidence: {
      hasPassport: true,
      verifiedCredentialCount: 1,
      verifiedExperienceCount: 0,
      // Stated rather than omitted: these cases are about verified
      // evidence, and a recorded employment would establish a situation
      // on its own -- which is a different rule, tested separately.
      recordedExperienceCount: 0,
      hasWorkCountry: true,
    },
  });
  ck(
    "verified evidence lifts the HEADLINE claim but keeps the regulated flag",
    lifted.professions[0].category !== "formal_pathway_required" &&
      lifted.professions[0].regulated === true,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   PURITY AND DETERMINISM
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nDETERMINISM");
{
  const args = {
    profile: profile({ currentProfessionSlug: "vaktare", currentProfessionStage: "developing" }),
    targets: [target(), target({ professionId: "x", careerStage: "senior" })],
    reachableCigSlugs: new Set(["tekniker"]),
    evidence: {
      hasPassport: true,
      verifiedCredentialCount: 1,
      verifiedExperienceCount: 0,
      // Stated rather than omitted: these cases are about verified
      // evidence, and a recorded employment would establish a situation
      // on its own -- which is a different rule, tested separately.
      recordedExperienceCount: 0,
      hasWorkCountry: true,
    },
  } as const;
  ck(
    "the same inputs produce byte-identical output",
    JSON.stringify(computeCareerJourney(args)) === JSON.stringify(computeCareerJourney(args)),
  );
  ck(
    "the readiness rules are versioned, so a screenshot can be explained later",
    computeCareerJourney(args).readinessVersion === "journey-readiness-v2",
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SHAPE — THE BOUNDARIES A BEHAVIOUR TEST CANNOT SEE
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nBOUNDARIES");
{
  const engine = read("src/lib/career-journey/readiness.ts");
  const types = read("src/lib/career-journey/types.ts");

  // The engine must be pure. A database client, a server function or a clock
  // inside it would make the journey untestable and non-deterministic, and
  // it is the determinism that lets a frozen report and a live journey be
  // rendered on one page without one of them drifting.
  for (const forbidden of [
    "@/integrations/supabase",
    "@tanstack/react-start",
    "Date.now",
    "Math.random",
  ]) {
    ck(`the readiness engine does not reach for ${forbidden}`, !engine.includes(forbidden));
  }
  // The circularity ban: readiness must never be derived from Career DNA.
  // "You are ready for this because you would enjoy it" is not readiness.
  for (const forbidden of ["dimension", "affinity", "fitTier", "scoring"]) {
    ck(
      `readiness is not derived from Career DNA (${forbidden})`,
      !new RegExp(`\\b${forbidden}\\b`, "i").test(
        engine.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""),
      ),
    );
  }
  // The Passport reaches the engine as counts and nothing else.
  // Anchored to the DECLARATION, not to every mention of the name: an
  // unanchored scan runs on into the next interface and reports its fields
  // as if they were the Passport's, which is a guard that fails for a reason
  // that has nothing to do with what it guards.
  const evidenceBlock =
    /export interface JourneyEvidenceInput \{[\s\S]*?\n\}/.exec(types)?.[0] ?? "";
  // Comments stripped first. The rule is about the FIELDS this interface
  // carries, and a doc comment that explains why a count is not a title was
  // failing a check written to stop the count BEING one -- which teaches the
  // next person to delete the explanation rather than keep the boundary.
  const evidenceFields = evidenceBlock.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
  ck(
    "the evidence input carries no titles, issuers or identifiers",
    evidenceBlock !== "" && !/title|issuer|credentialCode|holder|claimId/i.test(evidenceFields),
  );
  ck("and the engine imports no Passport module", !engine.includes("security-passport"));

  // Career Discovery must not reach the Passport, in either direction. That
  // is enforced by passport-separation-check; what is asserted HERE is that
  // the journey did not become the loophole -- the composition lives outside
  // both domains and is the only thing that reads them together.
  const composition = read("src/lib/career-journey/career-journey.functions.ts");
  ck(
    "the composition is the ONLY module reading both the Passport and the profile",
    composition.includes("security-passport/journey-evidence.functions") &&
      composition.includes("security_career_profiles"),
  );
  ck(
    "and the journey component reaches no Passport module",
    !read("src/components/career-journey/CareerJourneySection.tsx").includes("security-passport"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   ONE WRITER FOR THE CURRENT PROFESSION
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nONE FACT, ONE WRITER");
{
  const passport = read("src/lib/security-passport/passport.functions.ts");

  // The Passport must not write the profile-level profession column. It
  // still writes sp_experience_periods.cig_profession_slug -- a per-
  // employment role identity on an evidence-bearing row, which is a
  // different fact on a different table -- so the assertion is scoped to
  // the profile writes rather than to the column name everywhere.
  // Only lines that actually ASSIGN a caller-supplied value. Type
  // declarations (`cig_profession_slug: string | null`) name the column
  // without writing it, and counting them was a guard measuring the wrong
  // thing.
  const profileWrites = passport
    .split("\n")
    .filter((l) => /cig_profession_slug\s*[:=]\s*(data\.|patch|NEW\.)/.test(l));
  // Exactly one survivor is expected: the INSERT in addExperiencePeriod,
  // which is the experience row and not the profile.
  ck(
    "savePassportBasics no longer writes the profile profession",
    !/patch\.cig_profession_slug/.test(passport),
  );
  ck(
    "and neither does the onboarding autosave",
    !/professionSlug.*patch\.cig_profession_slug/.test(passport),
  );
  // Comments stripped first: both schemas explain in prose WHY the field is
  // gone, and a scan that could not tell an explanation from a declaration
  // would fail on the very comment that documents the fix.
  const passportCode = passport
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  ck(
    "the Passport's profile-write schemas no longer accept a professionSlug at all",
    !/const profileBasicsInput = z\.object\(\{[\s\S]*?\}\);/
      .exec(passportCode)?.[0]
      .includes("professionSlug") &&
      !/const onboardingInput = z\.object\(\{[\s\S]*?\}\);/
        .exec(passportCode)?.[0]
        .includes("professionSlug"),
  );
  ck(
    "the per-employment profession is untouched -- a different fact, a different table",
    profileWrites.length === 1,
  );

  // The canonical writer exists and is a PARTIAL patch. A caller holding one
  // field must not blank the other three as a side effect.
  const canonical = read("src/lib/security-career-profile/profile.functions.ts");
  ck("there is a partial writer for the profession", canonical.includes("setMyCurrentProfession"));
  ck(
    "and it does not touch status or experience",
    !/setMyCurrentProfession[\s\S]*?current_status:/.test(canonical) &&
      !/setMyCurrentProfession[\s\S]*?years_of_experience:/.test(canonical),
  );

  // The mirror is one-way. A reverse trigger would restore the two-writer
  // problem in the database, where no UI guard would ever see it.
  const migration = read("supabase/migrations/20261007090000_canonical_professional_profile.sql");
  ck(
    "the database mirror is canonical -> passport",
    /UPDATE public\.sp_passport_profiles[\s\S]{0,200}NEW\.current_profession_slug/.test(migration),
  );
  ck(
    "a Passport opened after the career profile is seeded from it",
    migration.includes("career_profile_seed_passport_profession"),
  );

  // ── THE ONE-WAY CLAIM IS A CONTRACT-PHASE PROPERTY ─────────────────
  //
  // The expand migration DOES contain a path from the Passport to the
  // canonical row, and it has to: during the compatibility window the running
  // application still writes that column, and the alternative to carrying
  // those writes through is refusing them, which breaks a live client.
  //
  // So the assertion is not "no such path exists" -- that would be false, and
  // a guard that is false gets deleted rather than fixed. It is: the path is
  // ONE named, temporary thing, and the contract migration removes it.
  const contract = read(
    "supabase/migrations/20261008090000_canonical_professional_profile_contract.sql",
  );
  const canonicalWriters = [
    ...migration.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(\)[\s\S]*?\n\$\$;/g),
  ]
    .filter((m) => /(UPDATE|INSERT INTO)\s+public\.security_career_profiles/.test(m[0]))
    .map((m) => m[1]);
  ck(
    "exactly one expand-phase function writes the canonical row from the Passport side",
    canonicalWriters.length === 1 &&
      canonicalWriters[0] === "career_profile_adopt_passport_profession",
  );
  ck(
    "and the contract migration drops it",
    contract.includes("DROP FUNCTION IF EXISTS public.career_profile_adopt_passport_profession"),
  );
  ck(
    "after which nothing writes the canonical row from the Passport side",
    !/(UPDATE|INSERT INTO)\s+public\.security_career_profiles/.test(contract),
  );
  ck(
    "and the contract keeps the mirror and the seed",
    !contract.includes("DROP FUNCTION IF EXISTS public.career_profile_mirror") &&
      !contract.includes("DROP FUNCTION IF EXISTS public.career_profile_seed"),
  );
  ck(
    "conflicting values are recorded rather than silently resolved",
    migration.includes("kept_canonical_conflict") && migration.includes("adopted_from_passport"),
  );
  ck(
    "the rollback restores the pre-consolidation Passport values",
    read("supabase/rollback/20261007090000_canonical_professional_profile_rollback.sql").includes(
      "SET cig_profession_slug = r.passport_value",
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   THIS PHASE DEPENDS ON NO UNAPPLIED SCHEMA
   ══════════════════════════════════════════════════════════════════════
   The expand migration ships and is applied FIRST, separately. What makes
   that possible is that none of the application code below names an object
   that migration introduces -- so this phase is merge-eligible on its own,
   and scripts/schema-first-release-check.ts can say so rather than being
   argued with. Asserted here because the coupling would come back the first
   time somebody added a convenient read of the reconciliation log. */
console.log("\nRELEASE INDEPENDENCE");
{
  const introduced = ["security_career_profile_reconciliations"];
  const appFiles = [
    "src/lib/security-career-profile/profile.functions.ts",
    "src/components/assessment/SecurityCareerProfileCard.tsx",
    "src/lib/career-journey/career-journey.functions.ts",
    "src/lib/career-journey/readiness.ts",
    "src/components/career-journey/CareerJourneySection.tsx",
    "src/components/career-journey/ProfileConnectionGate.tsx",
  ];
  for (const object of introduced) {
    for (const file of appFiles) {
      // Comments may explain the object; code may not call it. Same
      // distinction schema-first-release-check draws, for the same reason.
      const code = read(file)
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      ck(`${file} does not call ${object}`, !code.includes(object));
    }
  }
  // The contract migration ships WITH this phase and is applied after it is
  // live. It must introduce nothing, or it would create the very dependency
  // this section exists to deny.
  const contract = read(
    "supabase/migrations/20261008090000_canonical_professional_profile_contract.sql",
  );
  ck(
    "the contract migration only drops -- it introduces no object",
    !/CREATE\s+(TABLE|INDEX)/i.test(contract) && /DROP\s+(TRIGGER|FUNCTION)/i.test(contract),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   THE ASSESSMENT IS NEVER BLOCKED BY THE PROFILE
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nNO WALL");
{
  const gate = read("src/components/career-journey/ProfileConnectionGate.tsx");
  const flow = read("src/components/career-discovery/v31/PublicAssessmentFlow.tsx");

  ck(
    "the gate always offers a way to start the assessment",
    gate.includes("cj.gate.connected.start") && gate.includes("cj.gate.missing.start"),
  );
  ck(
    "an anonymous visitor never sees the gate",
    /setPhase\(isSignedIn \? "profile-gate" : "intro"\)/.test(flow),
  );
  ck(
    "the profile write after the context step never blocks the report",
    /void saveProfession\(/.test(flow) && /setPhase\("result"\)/.test(flow),
  );
  ck(
    "the experience band is deliberately NOT written back across two vocabularies",
    !/saveProfession\(\{[\s\S]{0,300}yearsOfExperience/.test(flow),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   COPY -- BOTH LOCALES, NO RAW KEYS
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nSV / EN");
{
  const dict = read("src/i18n/dictionaries.ts");
  const used = new Set(
    [
      ...read("src/components/career-journey/CareerJourneySection.tsx").matchAll(
        /"(cj\.[a-zA-Z0-9._]+)"/g,
      ),
      ...read("src/components/career-journey/ProfileConnectionGate.tsx").matchAll(
        /"(cj\.[a-zA-Z0-9._]+)"/g,
      ),
    ].map((m) => m[1]),
  );
  ck("the journey surfaces use copy keys at all", used.size > 20);
  for (const key of [...used].sort()) {
    const occurrences = dict.split(`"${key}":`).length - 1;
    if (occurrences !== 2) {
      ck(`${key} is authored in BOTH locales (found ${occurrences})`, false);
    }
  }
  ck(
    "every journey key is authored in both locales",
    fails.length === 0 || !fails.some((f) => f.includes("authored in BOTH")),
  );

  // The boundary sentence is the one piece of copy that cannot be softened:
  // it is what tells a candidate their background did not move their DNA.
  for (const locale of ["sv", "en"] as const) {
    const idx =
      locale === "sv"
        ? dict.indexOf('"cj.doesNotChangeDna"')
        : dict.lastIndexOf('"cj.doesNotChangeDna"');
    const text = dict.slice(idx, idx + 500);
    ck(
      `the DNA boundary is stated in ${locale}`,
      /Career DNA/.test(text) && /(aldrig|never)/.test(text),
    );
  }
}

// ---------------------------------------------------------------------------

if (fails.length > 0) {
  console.error(`\nFAIL (${fails.length}) — career-journey-check`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nPASS — career-journey-check");
