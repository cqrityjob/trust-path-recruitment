/**
 * Security Passport — the classifier, EXECUTED.
 *
 * Run via `bun run passport-classifier-behaviour:check`.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM THE OTHER GUARDS ───────────────────
 *
 * `scripts/passport-global-certification-check.ts` reads source text. It can
 * prove that `isNationalCredential` is imported and that no title matching
 * appears; it cannot prove what `classify()` RETURNS. That gap is not
 * hypothetical — it is exactly how two defects survived a green build:
 *
 *   1. `classification.ts` imported `isGlobalCertification` and used it, so
 *      every regex assertion about governed scope passed. The national branch
 *      meanwhile tested `if (claim.jurisdictionCode)`, so a training course
 *      recorded in Sweden was classified as a current-market REGULATED
 *      credential. `isNationalCredential` existed and was called by nothing.
 *   2. The header said an unknown lifecycle state fails closed. The code
 *      checked `draft` and the historical list and let every other string
 *      through into the international and current-market branches.
 *
 * Both are invisible to a text guard and obvious to a call. So this file
 * IMPORTS the real modules and RUNS them. Nothing here reads a source file.
 *
 * The negative controls in
 * `scripts/negative-controls/classifier-behaviour-controls.ts` plant each of
 * those defects back and require THIS suite to fail.
 */
import {
  EVERY_BUCKET,
  DISCLOSABLE_BUCKETS,
  classify,
  classifyAll,
  compareForHighlight,
  groupByJurisdiction,
  inBucket,
  isHistoricalState,
  orderForDisplay,
  type ClassifiableClaim,
  type PassportBucket,
} from "../src/lib/security-passport/classification";
import {
  GLOBAL_PROFESSIONAL_SCOPE,
  NATIONAL_REGULATED_SCOPE,
} from "../src/lib/security-passport/certification-scope";
import type { WorkLocation } from "../src/lib/security-passport/jurisdiction-relevance";

const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`);
  if (!cond) fails.push(name);
}
function eq<T>(actual: T, expected: T, name: string): void {
  ok(Object.is(actual, expected), `${name} (got ${String(actual)})`);
}

/* ------------------------------------------------------------------ */
/* Fixtures — typed, so a drifting interface is a compile error        */
/* ------------------------------------------------------------------ */

const GLOBAL_DEF = { scopeCode: GLOBAL_PROFESSIONAL_SCOPE } as const;
const NATIONAL_DEF = { scopeCode: NATIONAL_REGULATED_SCOPE } as const;
/** A governed row nobody has reviewed for scope yet. Every pre-existing
 *  definition is this, and it must be neither global nor national. */
const UNDECLARED_DEF = { scopeCode: null } as const;

const SE: WorkLocation = { jurisdictionCode: "SE", subJurisdictionCode: null };
const GB: WorkLocation = { jurisdictionCode: "GB", subJurisdictionCode: null };
const AE_DU: WorkLocation = { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" };
const AE_AZ: WorkLocation = { jurisdictionCode: "AE", subJurisdictionCode: "AE-AZ" };
const UNSTATED: WorkLocation = { jurisdictionCode: null, subJurisdictionCode: null };

function claim(over: Partial<ClassifiableClaim> & { id: string }): ClassifiableClaim {
  return {
    claimType: "certification",
    lifecycleState: "active",
    assertionLevel: "self_declared",
    credentialCode: null,
    jurisdictionCode: null,
    subJurisdictionCode: null,
    definition: null,
    issuedOn: null,
    ...over,
  };
}

/** The exact lifecycle allowlist `sp_claims` carries, restated here so a
 *  migration that changes it and forgets this file shows up as a failure
 *  rather than as silence. 20260817090000 §sp_claims:
 *  CHECK (lifecycle_state IN ('draft','active','expired','revoked',
 *  'superseded','disputed','withdrawn')). */
const SCHEMA_LIFECYCLE_STATES = [
  "draft",
  "active",
  "expired",
  "revoked",
  "superseded",
  "disputed",
  "withdrawn",
] as const;
const SCHEMA_HISTORICAL = ["expired", "revoked", "superseded", "disputed", "withdrawn"] as const;

/* ══════════════════════════════════════════════════════════════════════
   1 — a governed global certification, and only a governed one
   ══════════════════════════════════════════════════════════════════════ */
console.log("1 -- the international bucket is reachable only by declared scope");

{
  const cpp = claim({ id: "c-cpp", credentialCode: "INTL_ASIS_CPP", definition: GLOBAL_DEF });
  const r = classify(cpp, SE);
  eq(r.bucket, "international_certification" as PassportBucket, "1.1 governed global + active");

  // 2. No country group, under any work location.
  for (const [label, work] of [
    ["SE", SE],
    ["GB", GB],
    ["AE-DU", AE_DU],
    ["unstated", UNSTATED],
  ] as const) {
    const c = classify(cpp, work);
    ok(
      c.bucket === "international_certification" && c.groupKey === null,
      `1.2 a CPP is international with no country group, working in ${label}`,
    );
  }

  // Even if a malformed row carried a jurisdiction, the scope decides and the
  // certification is still grouped under no country.
  const contaminated = claim({
    id: "c-bad",
    credentialCode: "INTL_ASIS_CPP",
    definition: GLOBAL_DEF,
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
  });
  const cr = classify(contaminated, SE);
  ok(
    cr.bucket === "international_certification" && cr.groupKey === null,
    "1.3 a global definition outranks a stray jurisdiction, and still groups under none",
  );

  // 8. Free text is never upgraded. No code, no definition, whatever the text.
  for (const text of [
    "CPP",
    "CISSP",
    "ASIS",
    "ISC2",
    "ACAMS",
    "test",
    "Certified Fraud Examiner",
  ]) {
    const free = claim({ id: `free-${text}`, claimType: "certification", definition: null });
    const b = classify(free, SE).bucket;
    ok(
      b !== "international_certification" && b !== "current_market_credential",
      `1.4 free-text "${text}" is neither international nor current-market (got ${b})`,
    );
  }
  // The classifier cannot even RECEIVE the text: the input type has no title.
  ok(
    !Object.prototype.hasOwnProperty.call(claim({ id: "x" }), "title"),
    "1.5 the classifier's input carries no title for it to match on",
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2 — a regulated national credential, and only a governed one
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n2 -- national regulated status comes from the definition, never a country");

{
  const vu1 = claim({
    id: "c-vu1",
    credentialCode: "VU1",
    definition: NATIONAL_DEF,
    jurisdictionCode: "SE",
  });
  eq(
    classify(vu1, SE).bucket,
    "current_market_credential" as PassportBucket,
    "2.1 SE credential, working in SE",
  );
  eq(
    classify(vu1, GB).bucket,
    "other_country_credential" as PassportBucket,
    "2.2 SE credential, working in GB",
  );
  eq(classify(vu1, GB).groupKey, "SE", "2.3 grouped by ITS OWN jurisdiction, not the holder's");

  const dubai = claim({
    id: "c-du",
    credentialCode: "AE_DU_SIRA",
    definition: NATIONAL_DEF,
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
  });
  eq(
    classify(dubai, AE_DU).bucket,
    "current_market_credential" as PassportBucket,
    "2.4 Dubai card in Dubai",
  );
  eq(
    classify(dubai, AE_AZ).bucket,
    "other_country_credential" as PassportBucket,
    "2.5 a Dubai card is not an Abu Dhabi card",
  );
  eq(classify(dubai, AE_AZ).groupKey, "AE-DU", "2.6 grouped by its own SUB-jurisdiction");

  // 6. THE DEFECT. A jurisdiction is provenance, not authority.
  const freeWithCountry = claim({
    id: "c-freeSE",
    claimType: "certification",
    definition: null,
    jurisdictionCode: "SE",
  });
  const b = classify(freeWithCountry, SE).bucket;
  ok(
    b !== "current_market_credential" && b !== "other_country_credential",
    `2.7 definition=null + jurisdiction is NOT a regulated credential (got ${b})`,
  );
  eq(b, "other_self_declared" as PassportBucket, "2.8 it is honestly labelled self-declared");

  // 7. And a factual merit keeps its own section, jurisdiction or not.
  for (const [type, expected] of [
    ["training", "education_and_training"],
    ["education", "education_and_training"],
    ["professional_membership", "membership"],
    ["language", "language"],
    ["skill", "skill"],
    ["document", "document"],
  ] as const) {
    const m = claim({ id: `m-${type}`, claimType: type, definition: null, jurisdictionCode: "SE" });
    eq(
      classify(m, SE).bucket,
      expected as PassportBucket,
      `2.9 ${type} recorded in SE stays ${expected}`,
    );
    eq(
      classify(m, GB).bucket,
      expected as PassportBucket,
      `2.10 ${type} stays ${expected} from abroad too`,
    );
  }

  // 9. An undeclared scope is neither.
  const undeclared = claim({
    id: "c-und",
    credentialCode: "LEGACY",
    definition: UNDECLARED_DEF,
    jurisdictionCode: "SE",
  });
  const ub = classify(undeclared, SE).bucket;
  ok(
    ub !== "international_certification" &&
      ub !== "current_market_credential" &&
      ub !== "other_country_credential",
    `2.11 an undeclared scope is neither global nor national (got ${ub})`,
  );

  // A national definition with no jurisdiction has no heading to sit under.
  const nationalNoCountry = claim({
    id: "c-nnc",
    definition: NATIONAL_DEF,
    jurisdictionCode: null,
  });
  const nb = classify(nationalNoCountry, SE).bucket;
  ok(
    nb !== "current_market_credential" && nb !== "other_country_credential",
    `2.12 a national definition with no jurisdiction is not placed in a market (got ${nb})`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   3 — lifecycle beats scope, and the gate fails closed
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n3 -- lifecycle is decided before scope, and an unknown state fails closed");

const SCOPES = [
  ["global", GLOBAL_DEF, "INTL_ASIS_CPP", null],
  ["national", NATIONAL_DEF, "VU1", "SE"],
  ["undeclared", UNDECLARED_DEF, "LEGACY", "SE"],
  ["free-text", null, null, "SE"],
] as const;

{
  // 10. draft wins over every scope.
  for (const [label, def, code, jur] of SCOPES) {
    const d = claim({
      id: `d-${label}`,
      lifecycleState: "draft",
      definition: def,
      credentialCode: code,
      jurisdictionCode: jur,
    });
    eq(classify(d, SE).bucket, "draft" as PassportBucket, `3.1 draft ${label} stays draft`);
  }

  // 11. every historical state wins over every scope.
  for (const state of SCHEMA_HISTORICAL) {
    for (const [label, def, code, jur] of SCOPES) {
      const h = claim({
        id: `h-${state}-${label}`,
        lifecycleState: state,
        definition: def,
        credentialCode: code,
        jurisdictionCode: jur,
      });
      eq(
        classify(h, SE).bucket,
        "historical" as PassportBucket,
        `3.2 ${state} ${label} is historical`,
      );
    }
  }
  // The two states the architecture names before the column carries them.
  for (const state of ["retired", "challenged"] as const) {
    ok(isHistoricalState(state), `3.3 the forward-looking state ${state} is historical`);
    eq(
      classify(claim({ id: `f-${state}`, lifecycleState: state, definition: GLOBAL_DEF }), SE)
        .bucket,
      "historical" as PassportBucket,
      `3.4 a ${state} CPP is historical, not international`,
    );
  }

  // 12. THE DEFECT. Anything that is not draft, not historical and not current
  //     must never be presented as current or international.
  const UNKNOWN = [
    "pending_review",
    "ACTIVE",
    "active ",
    "",
    "banana",
    "suspended",
    "provisional",
    "null",
    "undefined",
    "0",
  ];
  for (const state of UNKNOWN) {
    for (const [label, def, code, jur] of SCOPES) {
      const u = claim({
        id: `u-${state}-${label}`,
        lifecycleState: state,
        definition: def,
        credentialCode: code,
        jurisdictionCode: jur,
      });
      const bucket = classify(u, SE).bucket;
      ok(
        bucket !== "international_certification" &&
          bucket !== "current_market_credential" &&
          bucket !== "other_country_credential",
        `3.5 lifecycle "${state}" + ${label} is not presented as current (got ${bucket})`,
      );
    }
    // …and it does not sneak into a factual merit section either.
    const merit = claim({ id: `um-${state}`, claimType: "training", lifecycleState: state });
    eq(
      classify(merit, SE).bucket,
      "other_self_declared" as PassportBucket,
      `3.6 lifecycle "${state}" training is not a current merit section`,
    );
  }

  // Only ONE state is current, and the suite says which.
  const current = SCHEMA_LIFECYCLE_STATES.filter(
    (s) =>
      classify(claim({ id: `p-${s}`, definition: GLOBAL_DEF, lifecycleState: s }), SE).bucket ===
      "international_certification",
  );
  ok(
    current.length === 1 && current[0] === "active",
    `3.7 exactly one schema lifecycle state reaches the international bucket, and it is 'active' (got ${current.join(",") || "none"})`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4 — every row lands exactly once, and the work country rewrites nothing
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n4 -- one bucket per row, and work country is presentation only");

const POPULATION: readonly ClassifiableClaim[] = [
  claim({
    id: "p01",
    credentialCode: "INTL_ASIS_CPP",
    definition: GLOBAL_DEF,
    assertionLevel: "verified",
    issuedOn: "2024-01-01",
  }),
  claim({
    id: "p02",
    credentialCode: "INTL_ISC2_CISSP",
    definition: GLOBAL_DEF,
    issuedOn: "2023-06-01",
  }),
  claim({
    id: "p03",
    credentialCode: "VU1",
    definition: NATIONAL_DEF,
    jurisdictionCode: "SE",
    assertionLevel: "document_provided",
    issuedOn: "2025-02-02",
  }),
  claim({
    id: "p04",
    credentialCode: "SIA",
    definition: NATIONAL_DEF,
    jurisdictionCode: "GB",
    issuedOn: "2022-03-03",
  }),
  claim({
    id: "p05",
    credentialCode: "SIRA",
    definition: NATIONAL_DEF,
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
  }),
  claim({ id: "p06", claimType: "training", definition: null, jurisdictionCode: "SE" }),
  claim({ id: "p07", claimType: "language", definition: null }),
  claim({ id: "p08", claimType: "certification", definition: null, jurisdictionCode: "SE" }),
  claim({ id: "p09", lifecycleState: "draft", definition: GLOBAL_DEF }),
  claim({ id: "p10", lifecycleState: "revoked", definition: NATIONAL_DEF, jurisdictionCode: "SE" }),
  claim({ id: "p11", lifecycleState: "banana", definition: GLOBAL_DEF }),
  claim({
    id: "p12",
    credentialCode: "LEGACY",
    definition: UNDECLARED_DEF,
    jurisdictionCode: "NO",
  }),
];

{
  // 13. exactly once.
  const all = classifyAll(POPULATION, SE);
  eq(all.length, POPULATION.length, "4.1 every input row appears in the output");
  const ids = all.map((c) => c.claim.id);
  eq(new Set(ids).size, POPULATION.length, "4.2 …exactly once");
  const bucketed = EVERY_BUCKET.reduce((n, b) => n + inBucket(all, b).length, 0);
  eq(bucketed, POPULATION.length, "4.3 …and every row is in exactly one of the eleven buckets");
  eq(EVERY_BUCKET.length, new Set(EVERY_BUCKET).size, "4.4 EVERY_BUCKET lists each bucket once");
  eq(
    DISCLOSABLE_BUCKETS.length,
    EVERY_BUCKET.length - 1,
    "4.5 exactly one bucket (draft) is not disclosable",
  );
  ok(!DISCLOSABLE_BUCKETS.includes("draft"), "4.6 and it is draft");

  // 16. changing work country changes grouping only.
  const before = JSON.parse(JSON.stringify(POPULATION)) as unknown;
  const inSE = classifyAll(POPULATION, SE);
  const inGB = classifyAll(POPULATION, GB);
  const after = JSON.parse(JSON.stringify(POPULATION)) as unknown;
  ok(
    JSON.stringify(before) === JSON.stringify(after),
    "4.7 classifying under two work countries mutates no claim",
  );
  ok(
    inSE.every((c, i) => c.claim === POPULATION[i]),
    "4.8 the classified row carries the SAME claim object, not a copy",
  );
  const moved = inSE.filter((c, i) => c.bucket !== inGB[i]!.bucket);
  ok(
    moved.every(
      (c) =>
        (c.bucket === "current_market_credential" || c.bucket === "other_country_credential") &&
        (inGB.find((g) => g.claim.id === c.claim.id)!.bucket === "current_market_credential" ||
          inGB.find((g) => g.claim.id === c.claim.id)!.bucket === "other_country_credential"),
    ),
    "4.9 the only rows that move do so between the two market buckets",
  );
  ok(moved.length > 0, "4.10 …and at least one row really did move, so this proves something");

  // 5. grouping keys are the claims' own.
  const groups = groupByJurisdiction(inSE);
  ok(
    groups.every((g) =>
      g.claims.every(
        (c) => (c.claim.subJurisdictionCode ?? c.claim.jurisdictionCode) === g.jurisdiction,
      ),
    ),
    "4.11 every other-country group is keyed by its members' own jurisdiction",
  );
  ok(
    !groups.some((g) => g.jurisdiction === "SE"),
    "4.12 working in SE, no group is headed SE — those are current-market",
  );
  const keys = groups.map((g) => g.jurisdiction);
  eq(
    JSON.stringify(keys),
    JSON.stringify([...keys].sort()),
    "4.13 group headings are alphabetical",
  );
}

/* ══════════════════════════════════════════════════════════════════════
   5 — ordering is total, documented and permutation-invariant
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n5 -- the highlight order is total and independent of input order");

function rotate<T>(xs: readonly T[], n: number): T[] {
  return [...xs.slice(n), ...xs.slice(0, n)];
}

{
  const base = orderForDisplay(classifyAll(POPULATION, SE)).map((c) => c.claim.id);

  // 14. every rotation and the reversal produce the identical sequence.
  let invariant = true;
  for (let n = 0; n < POPULATION.length; n++) {
    const got = orderForDisplay(classifyAll(rotate(POPULATION, n), SE)).map((c) => c.claim.id);
    if (JSON.stringify(got) !== JSON.stringify(base)) invariant = false;
  }
  ok(invariant, "5.1 every rotation of the input produces the same order");
  const reversed = orderForDisplay(classifyAll([...POPULATION].reverse(), SE)).map(
    (c) => c.claim.id,
  );
  eq(JSON.stringify(reversed), JSON.stringify(base), "5.2 so does the reversed input");

  // A deterministic shuffle, so this is not only rotations.
  const shuffled = [...POPULATION].sort((a, b) => (a.id < b.id ? 1 : -1));
  eq(
    JSON.stringify(orderForDisplay(classifyAll(shuffled, SE)).map((c) => c.claim.id)),
    JSON.stringify(base),
    "5.3 and a reordered-by-id input",
  );

  // 15. the tie-break is the claim id, and it is total.
  const twins = [
    claim({
      id: "t-b",
      definition: GLOBAL_DEF,
      assertionLevel: "verified",
      issuedOn: "2024-01-01",
    }),
    claim({
      id: "t-a",
      definition: GLOBAL_DEF,
      assertionLevel: "verified",
      issuedOn: "2024-01-01",
    }),
  ];
  const t = orderForDisplay(classifyAll(twins, SE)).map((c) => c.claim.id);
  eq(
    JSON.stringify(t),
    JSON.stringify(["t-a", "t-b"]),
    "5.4 identical rows fall through to the id",
  );
  const tc = classifyAll(twins, SE);
  ok(
    compareForHighlight(tc[0]!, tc[1]!) !== 0 && compareForHighlight(tc[1]!, tc[0]!) !== 0,
    "5.5 the comparator never returns 0 for two different rows",
  );

  // 17. the documented contract: BUCKET, then trust, then recency, then id.
  const cmA = classifyAll(
    [
      claim({
        id: "z",
        definition: NATIONAL_DEF,
        jurisdictionCode: "SE",
        assertionLevel: "self_declared",
      }),
    ],
    SE,
  )[0]!;
  const cmB = classifyAll(
    [claim({ id: "a", definition: GLOBAL_DEF, assertionLevel: "verified" })],
    SE,
  )[0]!;
  ok(
    compareForHighlight(cmA, cmB) < 0,
    "5.6 BUCKET leads: a self-declared current-market credential outranks a verified international one",
  );

  const sameBucket = classifyAll(
    [
      claim({ id: "s1", definition: GLOBAL_DEF, assertionLevel: "self_declared" }),
      claim({ id: "s2", definition: GLOBAL_DEF, assertionLevel: "verified" }),
    ],
    SE,
  );
  ok(
    compareForHighlight(sameBucket[1]!, sameBucket[0]!) < 0,
    "5.7 within a bucket, trust leads: verified outranks self-declared",
  );

  const sameTrust = classifyAll(
    [
      claim({
        id: "r1",
        definition: GLOBAL_DEF,
        assertionLevel: "verified",
        issuedOn: "2020-01-01",
      }),
      claim({
        id: "r2",
        definition: GLOBAL_DEF,
        assertionLevel: "verified",
        issuedOn: "2025-01-01",
      }),
    ],
    SE,
  );
  ok(
    compareForHighlight(sameTrust[1]!, sameTrust[0]!) < 0,
    "5.8 within a trust level, the more recent leads",
  );
  const undated = classifyAll(
    [
      claim({ id: "n1", definition: GLOBAL_DEF, assertionLevel: "verified", issuedOn: null }),
      claim({
        id: "n2",
        definition: GLOBAL_DEF,
        assertionLevel: "verified",
        issuedOn: "2000-01-01",
      }),
    ],
    SE,
  );
  ok(compareForHighlight(undated[1]!, undated[0]!) < 0, "5.9 an undated row sorts last, not first");

  // An unknown assertion level must not outrank a real verification.
  const weird = classifyAll(
    [
      claim({ id: "w1", definition: GLOBAL_DEF, assertionLevel: "super_verified" }),
      claim({ id: "w2", definition: GLOBAL_DEF, assertionLevel: "verified" }),
    ],
    SE,
  );
  ok(
    compareForHighlight(weird[1]!, weird[0]!) < 0,
    "5.10 an unrecognised assertion level ranks below every known one",
  );

  // History never outranks a current fact; a draft never outranks anything.
  const hd = classifyAll(
    [
      claim({
        id: "hd1",
        lifecycleState: "revoked",
        definition: GLOBAL_DEF,
        assertionLevel: "verified",
      }),
      claim({ id: "hd2", definition: GLOBAL_DEF, assertionLevel: "self_declared" }),
      claim({
        id: "hd3",
        lifecycleState: "draft",
        definition: GLOBAL_DEF,
        assertionLevel: "verified",
      }),
    ],
    SE,
  );
  const order = orderForDisplay(hd).map((c) => c.claim.id);
  eq(
    JSON.stringify(order),
    JSON.stringify(["hd2", "hd1", "hd3"]),
    "5.11 current > historical > draft",
  );
}

console.log(
  fails.length === 0
    ? "\npassport-classifier-behaviour-check: all assertions passed."
    : `\npassport-classifier-behaviour-check FAILED (${fails.length})`,
);
if (fails.length > 0) {
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
