// The trust surfaces, asserted against what a candidate actually SEES.
//
// Run via `bun run trust-surface:check`.
//
// ── WHAT WENT WRONG ────────────────────────────────────────────────────
//
// The trust MODEL held up under independent pilot testing. Users could tell
// self-reported from document-provided from verified, issuer from verifier,
// and current trust from withdrawn trust. What leaked was the plumbing
// underneath it, onto the surfaces whose whole job is to look trustworthy:
//
//   L1  The credential symbol plate defaulted its text to the credential
//       CODE, truncated to four characters. Invisible while the only
//       credentials were VU1/VU2/OV/SV — each of which IS its own
//       `symbol_label` — and wrong the moment the Swedish truth model added
//       four where they differ. The private overview, the Passport Card, the
//       recipient page and the exported PNG printed "SE_P", "OV_R", and
//       "OV_T" for BOTH OV_TRAINING and OV_TRANSPORT.
//
//   L2  The Passport overview printed "Beräkningsregel: v1-prototype" under
//       the one badge in the product, from a constant whose own comment says
//       it is not a production policy version.
//
//   L3  Career Discovery printed "2026-scd-v3.1.0" beside a candidate's own
//       result on four surfaces, "v3.1-draft-4" verbatim on the history
//       list, and the definition version into the exported Career Card — the
//       one artefact a candidate posts publicly and cannot correct after.
//
//   L4  The My Career trust summary named markets by code — "SE · 4" — while
//       the Passport Card two panels away said "Sverige" for the same market.
//
// ── WHY IT RENDERS RATHER THAN ONLY READS ──────────────────────────────
//
// Every one of those is a property of MARKUP. A resolver that returns the
// right label and a component that never calls it passes any source scan and
// fixes nothing — which is exactly how L1 survived: `symbol_label` was
// correct in the database, correct in the domain type, and simply never
// reached the four surfaces that render a claim without a taxonomy row in
// hand. So the real components are rendered and the markup is asserted.
//
// The source scan in GROUP 6 is the complement, not the substitute: it is
// scoped to user-facing components, routes and copy tables, because a
// migration, a version module, a fixture and a guard are all allowed — and
// required — to name these identifiers.
//
// ── SWEDISH IS WHAT IS RENDERED ────────────────────────────────────────
//
// `I18nProvider` starts at "sv" on the server and exposes no way to seed a
// locale (see passport-decision-truthfulness-check for the same constraint).
// The English half of every assertion is taken from the copy module
// directly, and `passport-fixture-check` holds sv/en parity across the whole
// table.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { ClaimRow } from "../src/components/security-passport/ClaimRow";
import { MarketBadgeRow } from "../src/components/security-passport/MarketBadgeRow";
import { RecognitionPanel } from "../src/components/security-passport/RecognitionBadges";
import { AssertionChip } from "../src/components/security-passport/AssertionChip";
import { ExperienceTimeline } from "../src/components/security-passport/ExperienceTimeline";
import { credentialMark } from "../src/lib/security-passport/credentials";
import { recognitionFor } from "../src/lib/security-passport/recognition";
import { passportT } from "../src/lib/security-passport/i18n";
import {
  describeTrust,
  employmentTrustLine,
  isCurrentlyVerified,
  trustLabel,
} from "../src/lib/security-passport/trust-presentation";
import type { Claim, ExperiencePeriod } from "../src/lib/security-passport/types";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
}

/** The text a reader sees: markup with tags and attributes removed.
 *
 *  Attributes matter. `data-market="SE"` and `data-definition-version` are
 *  deliberate developer diagnostics, and a guard that searched raw markup
 *  would fail on the very affordance that keeps the diagnostic available
 *  without showing it to anybody. */
function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function claim(over: Partial<Claim>): Claim {
  return {
    id: "c1",
    claimType: "training",
    credentialCode: "VU1",
    skillCode: null,
    skillLevel: null,
    titleSv: "Väktarutbildning 1 (VU1)",
    titleEn: "Security Guard Training 1 (VU1)",
    issuerName: "BYA",
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    authorisationScope: null,
    issuedOn: "2024-03-01",
    validFrom: "2024-03-01",
    validUntil: null,
    assertionLevel: "self_declared",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    limitationSv: null,
    limitationEn: null,
    versionNo: 1,
    supersedesClaimId: null,
    ...over,
  } as Claim;
}

/** Every credential a Swedish holder can actually record, with the name the
 *  taxonomy gives it. Codes and names both come from the seed mirror; the
 *  point of the group below is that the NAME reaches the reader and the CODE
 *  does not. */
const SEEDED: readonly { code: string; sv: string; mark: string }[] = [
  { code: "VU1", sv: "Väktarutbildning 1 (VU1)", mark: "VU1" },
  { code: "VU2", sv: "Väktarutbildning 2 (VU2)", mark: "VU2" },
  { code: "OV", sv: "Ordningsvaktsförordnande", mark: "OV" },
  { code: "SV", sv: "Skyddsvaktsförordnande", mark: "SV" },
  { code: "OV_TRAINING", sv: "Ordningsvaktsutbildning (grundutbildning)", mark: "OVU" },
  { code: "OV_REFRESHER", sv: "Fortbildning för ordningsvakter", mark: "OVF" },
  { code: "OV_TRANSPORT", sv: "Ordningsvakt — särskild utbildning för transport", mark: "OVT" },
  { code: "SE_PERSONNEL_APPROVAL", sv: "Personalgodkännande (bevakningsföretag)", mark: "PG" },
];

function total(elapsedDays: number) {
  return { elapsedDays, fteWeightedDays: elapsedDays, contributingPeriodIds: [] };
}

console.log("trust-surface-check\n");

/* ================================================================== */
group("GROUP 1 -- a known credential shows its name, never its code");

for (const c of SEEDED) {
  const markup = render(<ClaimRow claim={claim({ credentialCode: c.code, titleSv: c.sv })} />);
  ck(`${c.code}: the localized credential name is rendered`, markup.includes(c.sv));
  // VU1, VU2, OV and SV ARE their own governed marks and appear inside their
  // own approved names ("Väktarutbildning 1 (VU1)"). The property that
  // matters is the one they cannot demonstrate: a code that is NOT the
  // approved mark must not reach the reader in any form, whole or truncated.
  if (c.code !== c.mark) {
    ck(`${c.code}: the raw code does not reach the reader`, !visibleText(markup).includes(c.code));
    ck(
      `${c.code}: no four-character fragment of the code reaches the reader either`,
      !visibleText(markup).includes(c.code.slice(0, 4)),
    );
  }
  ck(`${c.code}: the plate carries its governed mark "${c.mark}"`, markup.includes(`>${c.mark}<`));
}

// The defect that made two credentials indistinguishable.
ck(
  "OV_TRAINING and OV_TRANSPORT do not share one mark",
  credentialMark("OV_TRAINING") !== credentialMark("OV_TRANSPORT"),
);

/* ================================================================== */
group("GROUP 2 -- an unknown credential code falls back safely");

{
  const unknown = "SOME_INTERNAL_CODE";
  const markup = render(
    <ClaimRow
      claim={claim({
        credentialCode: unknown,
        titleSv: "Yrkesbehörighet",
        titleEn: "Professional credential",
      })}
    />,
  );
  ck("an unmapped code resolves to no mark", credentialMark(unknown) === null);
  ck("the raw code never reaches the reader", !visibleText(markup).includes(unknown));
  ck(
    "no fragment of the raw code reaches the reader",
    !visibleText(markup).includes(unknown.slice(0, 4)),
  );
  ck("the plate renders no legend rather than a guess", !/<text[^>]*>[^<]/.test(markup));
  // Unknown is not empty: the row is still a full trust row.
  ck("the row still renders its title", markup.includes("Yrkesbehörighet"));
  ck("the row still renders its issuer", markup.includes("BYA"));
  ck(
    "the row still renders its evidence level",
    visibleText(markup).includes(passportT("assertion.self_declared", "sv")),
  );
}

/* ================================================================== */
group("GROUP 3 -- issuer and verifier stay separate");

{
  const reviewed = claim({
    issuerName: "BYA",
    assertionLevel: "verified",
    verifierName: "CQrityjob",
    verificationMethod: "document_review",
    verifiedOn: "2026-02-10",
  });
  const markup = render(<ClaimRow claim={reviewed} />);
  const text = visibleText(markup);

  ck("the issuer is named under the issuer label", text.includes("BYA"));
  ck(
    "the verifier is attributed by METHOD, not as the issuer",
    text.includes(`${passportT("claims.attribution.document_review", "sv")} CQrityjob`),
  );
  ck(
    'the old issuer->verifier fallback is gone: never "Verifierad av BYA"',
    !text.includes(`${passportT("claims.verifier", "sv")} BYA`),
  );
  ck(
    "en: document review is attributed to CQrityjob",
    passportT("claims.attribution.document_review", "en") === "Document reviewed by",
  );

  // A verified credential nobody has attributed names no verifier at all
  // rather than borrowing the issuer's name.
  const unattributed = render(
    <ClaimRow claim={claim({ assertionLevel: "verified", verifierName: null })} />,
  );
  ck(
    "an unattributed verification names no verifier",
    !visibleText(unattributed).includes(passportT("claims.verifier", "sv")),
  );
}

{
  // The employment register. Same decision, different words, one engine.
  const employer = describeTrust({
    assertionLevel: "verified",
    verifierName: "Bevakning AB",
    verificationMethod: "employer_confirmation",
    // An EMPLOYMENT. Source-confirmed trust has exactly one shape, and the
    // subject is half of it: the same method on a credential is documented.
    subjectKind: "employment",
  });
  ck(
    "sv: an employer confirmation is attributed to the employer",
    employmentTrustLine(employer, "sv") === "Anställningen är bekräftad av Bevakning AB",
  );
  ck(
    "en: an employer confirmation is attributed to the employer",
    employmentTrustLine(employer, "en") === "Employment confirmed by Bevakning AB",
  );

  const reviewed = describeTrust({
    assertionLevel: "verified",
    verifierName: "CQrityjob",
    verificationMethod: "document_review",
  });
  ck(
    "an employment CQrityjob reviewed does NOT borrow the employer's voice",
    employmentTrustLine(reviewed, "en") === "Document reviewed by CQrityjob",
  );
  ck(
    "sv: document review keeps its own words on an employment",
    employmentTrustLine(reviewed, "sv") === "Dokument granskat av CQrityjob",
  );
  ck(
    "a credential-register line reads the same way",
    trustLabel(reviewed, "en") === "Document reviewed by CQrityjob",
  );
}

{
  // ── ONE ATTRIBUTION, ONE PUNCTUATION ───────────────────────────────
  //
  // The timeline joined the attribution KEY to the name with a literal colon
  // — "Bekräftat av: Nordvakt Bevakning AB" — while `ClaimRow` and every
  // export render the same attribution as the sentence the copy is written
  // to be. `formatVerifierAttribution` is the composer; a surface that
  // assembles its own is how the two drift.
  const period: ExperiencePeriod = {
    id: "p1",
    employerName: "Nordvakt Bevakning AB",
    roleTitle: "Väktare",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    employmentType: "permanent",
    fteFraction: 1,
    securityRelevance: "full",
    securityFraction: 1,
    startedOn: "2022-01-01",
    endedOn: "2025-01-01",
    assertionLevel: "verified",
    lifecycleState: "active",
    verifierName: "Nordvakt Bevakning AB",
    verificationMethod: "employer_confirmation",
    verifiedOn: "2026-02-10",
  };
  const text = visibleText(
    render(<ExperienceTimeline periods={[period]} evaluationOn="2026-08-31" />),
  );
  ck(
    "the timeline renders the composed attribution sentence",
    text.includes("Bekräftat av Nordvakt Bevakning AB"),
  );
  ck(
    "and never label-colon-value",
    !text.includes(`${passportT("claims.attribution.employer_confirmation", "sv")}:`),
  );
}

/* ================================================================== */
group("GROUP 4 -- current trust and historical trust are never both claimed");

{
  const revoked = claim({
    assertionLevel: "verified",
    lifecycleState: "revoked",
    verifierName: "CQrityjob",
    verificationMethod: "document_review",
    verifiedOn: "2026-02-10",
  });
  const text = visibleText(render(<ClaimRow claim={revoked} />));

  ck("the revoked state is named", text.includes(passportT("lifecycle.revoked", "sv")));
  // INVERTED (owner decision): a CQrityjob document review is DOCUMENTED, and
  // revocation does not un-review it. The chip keeps the level word
  // Dokumenterad beside the lifecycle word Återkallad; "previously verified"
  // would restate a verification that never was one.
  ck(
    "the level word Dokumenterad is kept, not 'previously verified'",
    text.includes(passportT("trust.level.documented", "sv")) &&
      !text.includes(passportT("assertion.verified.historical", "sv")),
  );
  // The historical word CONTAINS the present-tense one ("TIDIGARE
  // VERIFIERAD"), so the assertion is that no OTHER occurrence survives:
  // remove every historical chip and the present-tense word must be gone.
  ck(
    "and the present-tense VERIFIED chip is NOT also shown",
    !text
      .split(passportT("assertion.verified.historical", "sv"))
      .join("")
      .includes(passportT("assertion.verified", "sv")),
  );
  ck(
    "the engine agrees: a revoked credential is not currently verified",
    !isCurrentlyVerified(revoked),
  );
  ck(
    "en: the historical word is PREVIOUSLY VERIFIED",
    passportT("assertion.verified.historical", "en") === "PREVIOUSLY VERIFIED",
  );

  // History is not erased. The decision that happened is still readable.
  ck("the verification that happened is still attributed", text.includes("CQrityjob"));
}

{
  // An active verified credential keeps the present tense.
  const active = render(<AssertionChip level="verified" lifecycleState="active" />);
  ck(
    "an active verified credential still reads VERIFIERAD",
    visibleText(active).includes(passportT("assertion.verified", "sv")),
  );
  // Every state word is real text, not a colour. This is what a screen
  // reader gets.
  for (const key of [
    "assertion.self_declared",
    "assertion.document_provided",
    "assertion.verified",
    "assertion.verified.historical",
    "lifecycle.revoked",
  ] as const) {
    ck(
      `${key}: has a non-empty word in BOTH languages`,
      passportT(key, "sv").trim().length > 0 && passportT(key, "en").trim().length > 0,
    );
  }
}

/* ================================================================== */
group("GROUP 5 -- no internal version string on a candidate trust surface");

{
  const markup = render(
    <RecognitionPanel
      recognition={recognitionFor({
        reported: total(2000),
        documented: total(1500),
        verified: total(1200),
        evaluationOn: "2026-08-31",
      })}
    />,
  );
  ck("the recognition panel prints no policy version", !markup.includes("v1-prototype"));
  ck(
    "and no calculation-rule label survives without one",
    !visibleText(markup).includes(passportT("recognition.policy", "sv")),
  );
  ck("the recognition itself still renders", markup.includes(passportT("recognition.title", "sv")));
}

{
  const markup = render(
    <MarketBadgeRow
      badges={[
        { marketCode: "SE", verifiedCount: 4 },
        { marketCode: "AE-DU", verifiedCount: 2 },
        { marketCode: "XX-ZZ", verifiedCount: 1 },
      ]}
    />,
  );
  const text = visibleText(markup);
  ck("sv: the Swedish market is named, not coded", text.includes("Sverige"));
  ck("the bare code is not printed as the caption", !/\sSE\s/.test(text));
  ck("Dubai is named as Dubai", text.includes("Dubai"));
  ck(
    "and never flattened to the UAE, which is a different regulator",
    !text.includes("Förenade Arabemiraten"),
  );
  ck(
    "an unreviewed market falls back to its code rather than an invented country",
    text.includes("XX-ZZ"),
  );
  ck("the code is still available as a diagnostic", markup.includes('data-market="SE"'));
  ck("en: the Swedish market is named Sweden", passportT("jurisdiction.SE", "en") === "Sweden");
}

/* ================================================================== */
group("GROUP 6 -- no forbidden identifier in user-facing source");

/** The literals the pilot found on a candidate surface, plus the families
 *  they belong to. */
const FORBIDDEN: readonly RegExp[] = [
  /v1-prototype/,
  /v3\.1-draft/,
  /cig-areas-v1/,
  /\b2026-scd-v/,
  /SE_PERSONNEL_APPROVAL/,
  /OV_TRAINING/,
  /OV_REFRESHER/,
  /OV_TRANSPORT/,
];

/** Scoped to what a candidate can reach.
 *
 *  Excluded deliberately (§28: no brittle false positives): the developer
 *  harnesses, the admin and employer portals, and the domain modules that
 *  legitimately OWN these identifiers — the version modules, the taxonomy
 *  mirrors and the market rules exist to state them. */
const SCAN_ROOTS = ["src/components", "src/routes"];
const SCAN_FILES = ["src/i18n/dictionaries.ts", "src/lib/security-passport/i18n.ts"];
const EXCLUDED =
  /Fixture|PrototypeShell|CredentialSymbolMatrix|CandidateHomeMock|[/.]admin[/.]|[/.]employer[/.]|routes[/]dev\./;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

/** Comments are stripped: the prose in these files DISCUSSES the very
 *  identifiers being banned, which is how the fix documents itself. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

{
  const files = [
    ...SCAN_ROOTS.flatMap((r) => walk(path.join(process.cwd(), r))),
    ...SCAN_FILES.map((f) => path.join(process.cwd(), f)),
  ].filter((f) => !EXCLUDED.test(f.replace(process.cwd(), "")));

  ck(`scanning ${files.length} user-facing files`, files.length > 100);

  for (const pattern of FORBIDDEN) {
    const hits = files.filter((f) => pattern.test(code(f)));
    ck(
      `${pattern.source} appears in no user-facing component, route or copy table` +
        (hits.length
          ? ` — found in ${hits.map((h) => path.relative(process.cwd(), h)).join(", ")}`
          : ""),
      hits.length === 0,
    );
  }
}

/* ================================================================== */
group("GROUP 7 -- premium polish that a trust row must not lose");

{
  // A long credential name, a long issuer and a long verifier, together.
  const long = claim({
    credentialCode: "SE_PERSONNEL_APPROVAL",
    titleSv: "Personalgodkännande (bevakningsföretag) för auktoriserat bevakningsföretag i Sverige",
    issuerName: "Länsstyrelsen i Västra Götalands län, enheten för tillståndsprövning",
    assertionLevel: "verified",
    verifierName: "CQrityjob Dokumentgranskning och Verifieringsenhet",
    verificationMethod: "document_review",
    verifiedOn: "2026-02-10",
  });
  const markup = render(<ClaimRow claim={long} />);
  ck("a long row constrains its columns rather than overflowing", markup.includes("min-w-0"));
  ck("its fields truncate inside their own cell", markup.includes("truncate"));
  ck("its header wraps rather than pushing the chips off", markup.includes("flex-wrap"));
  ck(
    "the trust status word itself is never truncated",
    !/class="[^"]*truncate[^"]*"[^>]*>\s*<[^>]*>\s*VERIFIERAD/.test(markup),
  );

  // "—" is a model sentinel, not a label a reader should meet.
  const noIssuer = visibleText(render(<ClaimRow claim={claim({ issuerName: "—" })} />));
  ck(
    "an unrecorded issuer says so in words rather than printing a dash",
    noIssuer.includes(passportT("common.notStated", "sv")),
  );
}

/* ================================================================== */
console.log(
  fails.length === 0
    ? `\ntrust-surface-check OK (${SEEDED.length} seeded credentials, unknown-code fallback, issuer/verifier separation, current-vs-historical trust, version leakage and ${FORBIDDEN.length} forbidden identifiers)`
    : `\ntrust-surface-check FAILED\n${fails.map((f) => "  - " + f).join("\n")}`,
);
process.exit(fails.length === 0 ? 0 : 1);
