/**
 * Security Passport — the governed issuer, on the APPLICATION side.
 *
 * Run via `bun run passport-governed-issuer:check`.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DOES NOT ─────────────────────────────
 *
 * The database is the guarantee. Migration 20261112090000 refuses a forged
 * issuer for EVERY caller including a direct PostgREST write with the
 * holder's own token, and `supabase/tests/security_passport_governed_issuer_test.sql`
 * proves that against a real replay with real grants, RLS and triggers.
 *
 * This file proves the other half: that a holder using the PRODUCT never
 * meets that refusal, because the application resolves the governed issuer
 * itself and discards whatever the browser sent. A rule that only lived in
 * the database would be correct and would still hand every holder an error
 * message they cannot act on.
 *
 * The mapping half is EXECUTED — `credentialClaimFields` is pure and is
 * called here with real fixtures. The read half is a source assertion,
 * clearly labelled as such below, because resolving the catalogue needs a
 * database and that is what the SQL suite is for.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  credentialClaimFields,
  emptyCredentialDraft,
  type CredentialDraft,
  type CredentialType,
} from "../src/lib/security-passport/credentials";
import {
  GLOBAL_PROFESSIONAL_SCOPE,
  NATIONAL_REGULATED_SCOPE,
} from "../src/lib/security-passport/certification-scope";

const root = join(import.meta.dirname, "..");
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`);
  if (!cond) fails.push(name);
}

/** The governed display names, as the catalogue records them. Restated here
 *  so a seed change that renames an issuer shows up as a failure rather than
 *  as silence; the SQL suite reads them from the database itself. */
const ASIS: string = "ASIS International";
const ISC2: string = "ISC2";
/** A SEARCH alias. Never a stored or rendered issuer. Typed as `string`
 *  rather than left as a literal so 1.6 is a real runtime assertion instead
 *  of a comparison the compiler folds away. */
const ISC2_ALIAS: string = "(ISC)2";

function type(over: Partial<CredentialType> & { code: string }): CredentialType {
  return {
    category: "qualification",
    claimType: "certification",
    nameSv: over.code,
    nameEn: over.code,
    symbolLabel: "X",
    requiresValidUntil: false,
    requiresIssuer: false,
    requiresScope: false,
    narrowResultOnly: false,
    titleIsHolderWritten: false,
    jurisdictionCode: null,
    subJurisdictionCode: null,
    scopeCode: null,
    ...over,
  };
}

const CPP = type({ code: "INTL_ASIS_CPP", scopeCode: GLOBAL_PROFESSIONAL_SCOPE });
const CISSP = type({ code: "INTL_ISC2_CISSP", scopeCode: GLOBAL_PROFESSIONAL_SCOPE });
const VU1 = type({
  code: "VU1",
  claimType: "training",
  scopeCode: NATIONAL_REGULATED_SCOPE,
  jurisdictionCode: "SE",
});
/** A pre-existing row nobody has reviewed for scope. Neither global nor
 *  national, and its issuer stays the holder's to state. */
const LEGACY = type({ code: "LEGACY_COURSE", claimType: "training", scopeCode: null });

function draft(over: Partial<CredentialDraft> = {}): CredentialDraft {
  return { ...emptyCredentialDraft(), issuedOn: "2025-01-01", ...over };
}

/* ══════════════════════════════════════════════════════════════════════
   1 — the catalogue names the issuer, whatever the browser sent
   ══════════════════════════════════════════════════════════════════════ */
console.log("1 -- a governed certification takes its issuer from the catalogue");

{
  const forged = draft({ issuerName: "Fake Corporation" });

  const active = credentialClaimFields(forged, CPP, "active", ASIS);
  ok(
    active.claimed_issuer_name === ASIS,
    `1.1 an ACTIVE CPP records the governed issuer (got ${String(active.claimed_issuer_name)})`,
  );
  ok(
    active.claimed_issuer_name !== "Fake Corporation",
    "1.2 and the forged name the browser sent is DISCARDED, not stored",
  );

  const asDraft = credentialClaimFields(forged, CPP, "draft", ASIS);
  ok(
    asDraft.claimed_issuer_name === ASIS,
    `1.3 a DRAFT is governed identically — a forged issuer is never parked (got ${String(asDraft.claimed_issuer_name)})`,
  );

  // Even a plausible near miss is discarded: nothing here matches loosely.
  for (const attempt of ["ASIS", "asis international", "ASIS Int.", ""]) {
    const r = credentialClaimFields(draft({ issuerName: attempt }), CPP, "active", ASIS);
    ok(r.claimed_issuer_name === ASIS, `1.4 "${attempt}" does not survive into the row`);
  }

  // An ALIAS is a search vocabulary. It is never what gets stored.
  const aliased = credentialClaimFields(draft({ issuerName: ISC2_ALIAS }), CISSP, "active", ISC2);
  ok(
    aliased.claimed_issuer_name === ISC2,
    `1.5 a search alias is not stored as the issuer (got ${String(aliased.claimed_issuer_name)})`,
  );
  ok(ISC2_ALIAS !== ISC2, "1.6 …and the alias really is a different string from the display name");
}

/* ══════════════════════════════════════════════════════════════════════
   2 — a correction cannot keep the previous issuer
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n2 -- correcting one governed code to another rewrites the issuer");

{
  // The holder had a CPP and corrects it to a CISSP. The draft still carries
  // ASIS in the issuer field, because that is what the form was showing.
  const carriedOver = draft({ issuerName: ASIS });
  const corrected = credentialClaimFields(carriedOver, CISSP, "active", ISC2);
  ok(
    corrected.claimed_issuer_name === ISC2,
    `2.1 the corrected claim carries ISC2 (got ${String(corrected.claimed_issuer_name)})`,
  );
  ok(
    corrected.claimed_issuer_name !== ASIS,
    "2.2 and NOT the previous credential's issuer — the value is written, never left behind",
  );

  // The same property the territory rule has: both directions are WRITTEN.
  const backAgain = credentialClaimFields(draft({ issuerName: ISC2 }), CPP, "active", ASIS);
  ok(backAgain.claimed_issuer_name === ASIS, "2.3 and correcting back writes ASIS again");
}

/* ══════════════════════════════════════════════════════════════════════
   3 — nothing else changed
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n3 -- national, undeclared and free-text issuers are the holder's");

{
  const national = credentialClaimFields(
    draft({ issuerName: "Länsstyrelsen Stockholm", jurisdictionCode: "SE" }),
    VU1,
    "active",
  );
  ok(
    national.claimed_issuer_name === "Länsstyrelsen Stockholm",
    `3.1 a Swedish credential keeps the holder's appointing authority (got ${String(national.claimed_issuer_name)})`,
  );

  const blank = credentialClaimFields(draft({ issuerName: "  " }), VU1, "active");
  ok(blank.claimed_issuer_name === null, "3.2 …and a blank one is still null, not an empty string");

  const legacy = credentialClaimFields(draft({ issuerName: "Some Provider AB" }), LEGACY, "active");
  ok(
    legacy.claimed_issuer_name === "Some Provider AB",
    `3.3 an UNDECLARED scope is not governed, so its issuer is untouched (got ${String(legacy.claimed_issuer_name)})`,
  );

  // A governed issuer is never invented for a definition that has none.
  const orphan = credentialClaimFields(draft({ issuerName: "Fake Corporation" }), CPP, "active");
  ok(
    orphan.claimed_issuer_name === null,
    `3.4 a global definition with no resolved issuer writes NULL, never the client's text (got ${String(orphan.claimed_issuer_name)})`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4 — a controlled issuer upgrades nothing
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n4 -- knowing who awards a certification is not knowing this holder has it");

{
  const row = credentialClaimFields(draft({ issuerName: "Fake Corporation" }), CPP, "active", ASIS);

  // The write shape has no field for any of these, which is the guarantee:
  // a mapper cannot raise a trust level it cannot address.
  for (const forbidden of [
    "assertion_level",
    "verified_at",
    "verified_by_user_id",
    "issuer_confirmed_at",
    "issuer_confirmation_url",
    "status_source",
    "holder_user_id",
  ]) {
    ok(
      !Object.prototype.hasOwnProperty.call(row, forbidden),
      `4.1 the claim row has no ${forbidden} for a governed issuer to raise`,
    );
  }

  // And the scope still clears the territory: this changes nothing there.
  ok(
    row.jurisdiction_code === null && row.sub_jurisdiction_code === null,
    "4.2 a governed issuer does not give an international certification a country",
  );
  ok(row.lifecycle_state === "active", "4.3 nor does it change the lifecycle the holder chose");
}

/* ══════════════════════════════════════════════════════════════════════
   5 — the server resolves it; the browser is never asked
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n5 -- SOURCE ASSERTIONS: the resolution happens on the server");

{
  const server = readFileSync(
    join(root, "src/lib/security-passport/credentials.functions.ts"),
    "utf8",
  );
  const save = server.slice(server.indexOf("export const saveCredential"));

  ok(
    /\.from\("sp_certification_definitions"\)/.test(save),
    "5.1 saveCredential reads the certification catalogue",
  );
  ok(
    /isGlobalCertification\(type\)/.test(save),
    "5.2 …only for a definition that DECLARES the global scope",
  );
  ok(
    /credentialClaimFields\(draft, type, mode, governedIssuerName\)/.test(save),
    "5.3 …and hands the resolved name to the mapper",
  );
  ok(
    /if \(issuerError\) throw new Error\(issuerError\.message\)/.test(save),
    "5.4 a failed catalogue read throws rather than falling back to the client's value",
  );
  // The THROW, not merely the string: the name also appears in the comment
  // above the read, and a guard that matched that would pass with the refusal
  // deleted. ISSUER-NC-MISSING-DEFINITION-TOLERATED caught exactly that.
  ok(
    /if \(!definition\) throw new Error\("SP_GLOBAL_CERTIFICATION_ISSUER_UNKNOWN"\);/.test(save),
    "5.5 and a global definition with no issuer row is REFUSED by name",
  );

  // The mapper must not be reachable with the client's issuer for a global
  // definition. There is exactly one call site in the application.
  const callSites = [...server.matchAll(/credentialClaimFields\(/g)].length;
  ok(callSites === 1, `5.6 the application maps a claim in exactly one place (found ${callSites})`);

  const mapper = readFileSync(join(root, "src/lib/security-passport/credentials.ts"), "utf8");
  ok(
    /claimed_issuer_name: issuerNameFor\(draft, type, governedIssuerName\)/.test(mapper),
    "5.7 the row takes its issuer from one named function, not an inline expression",
  );
  ok(
    /if \(!isGlobalCertification\(type\)\) return nullIfBlank\(draft\.issuerName\);/.test(mapper),
    "5.8 that function branches on the DECLARED scope, not a code prefix or a title",
  );
  ok(
    /return governedIssuerName \? nullIfBlank\(governedIssuerName\) : null;/.test(mapper),
    "5.9 and a governed definition can only ever yield the catalogue's name or null",
  );
  const mapperCode = mapper.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  ok(
    !/sp_certification_issuer_aliases|alias/i.test(mapperCode),
    "5.10 and it never reads an alias",
  );
}

console.log(
  fails.length === 0
    ? "\npassport-governed-issuer-check: all assertions passed."
    : `\npassport-governed-issuer-check FAILED (${fails.length})`,
);
if (fails.length > 0) {
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
