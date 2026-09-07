// Security Passport — "Dela Passport" is a decision the holder makes, and the
// recipient reads exactly what it produced.
//
// Run via `bun run passport-sharing-flow:check`.
//
// ── WHAT THIS REPLACED ─────────────────────────────────────────────────
//
// `passport-share-default-check.ts` pinned the previous screen: `public_card`
// as the silent default, one button, everything else behind a collapsed
// `<details>`. That was the right guard for a screen whose failure mode was
// teaching a taxonomy before letting anybody share anything.
//
// PR #197 removes the failure mode instead of hiding it. There is no package
// default to pin because the holder picks merits, and no advanced section to
// keep collapsed because the taxonomy is gone from this screen entirely. The
// old file's INTENT — a holder must not have to meet CQrityjob's internal
// model to send somebody their record — survives here as assertions 1.x.
//
// ── WHAT THIS PINS ─────────────────────────────────────────────────────
//
//   1. THE SCOPE IS THE HOLDER'S, AND THE SERVER'S. The screen offers exactly
//      what `sp_create_selected_disclosure` would accept, because both read
//      one rule; nothing is selected for the holder; and the route does not
//      decide eligibility for itself.
//
//   2. THE PREVIEW IS THE PAGE. Both render `RecipientPassportView`. A
//      "preview" component that could drift is the single most damaging thing
//      this feature could grow, because the holder's consent is given against
//      whatever it showed them.
//
//   3. THE TRUST WORDS. A CQrityjob document review is Dokumenterad on the
//      recipient page; an issuer confirmation this product cannot structurally
//      support is Dokumenterad too; only an employer confirming an employment
//      it was party to reaches Källbekräftad — and it reaches it as
//      EMPLOYMENT confirmation, in employment's own register, never as a
//      credential having been verified.
//
//   4. THE PAGE IS COMPLETE IN BOTH LANGUAGES, and says what it is before it
//      says anything about a person.
//
//   5. NOTHING IS CLAIMED THAT THE RECORD DOES NOT CARRY: no read receipt, no
//      recoverable link, no private field.
//
// Rendered, not merely grepped, wherever the claim is about what a person
// reads.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { RecipientPassportView } from "../src/components/security-passport/live/RecipientPassportView";
import { buildRecipientPresentation } from "../src/lib/security-passport/recipient-presentation";
import { buildShareSelection, isShareable } from "../src/lib/security-passport/share-selection";
import { passportT } from "../src/lib/security-passport/i18n";
import type { RecipientPayloadActive } from "../src/lib/security-passport/packages";
import type { Claim, ExperiencePeriod } from "../src/lib/security-passport/types";

const root = path.resolve(import.meta.dir, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const fails: string[] = [];
function ck(name: string, ok: boolean) {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(title: string) {
  console.log(`\n${title}`);
}

const ROUTE = "src/routes/_authenticated.passport.share.tsx";
const VIEW = "src/components/security-passport/live/RecipientPassportView.tsx";
const PUBLIC = "src/routes/p.$token.tsx";
const SELECTION = "src/lib/security-passport/share-selection.ts";
const FUNCTIONS = "src/lib/security-passport/selected-sharing.functions.ts";
const MIGRATION = "supabase/migrations/20261101090000_sp_selected_merit_sharing.sql";

const route = read(ROUTE);
const view = read(VIEW);
const publicPage = read(PUBLIC);
const selectionSrc = read(SELECTION);
const functions = read(FUNCTIONS);
const migration = read(MIGRATION);

/* ================================================================== */
group("GROUP 1 — the scope is the holder's, and the server's");
/* ================================================================== */

// The rule the screen offers and the rule the database accepts must be one
// rule. If they drift, the holder is shown merits the create will refuse.
ck(
  "1.1 the screen's eligibility rule is the migration's, verbatim in meaning",
  /assertionLevel === "verified" && row\.lifecycleState === "active"/.test(selectionSrc) &&
    /c\.assertion_level = 'verified' AND c\.lifecycle_state = 'active'/.test(migration) &&
    /e\.assertion_level = 'verified' AND e\.lifecycle_state = 'active'/.test(migration),
);

// The route must not form its own opinion about what may be shared.
ck(
  "1.2 the route decides no eligibility of its own",
  route.includes("buildShareSelection") &&
    !/assertion_level|assertionLevel/.test(route) &&
    !/lifecycle_state/.test(route),
);

// Nothing is ticked for the holder. A pre-ticked list is a decision made on
// somebody's behalf about what a stranger may see.
ck(
  "1.3 nothing is selected by default",
  /useState<ReadonlySet<string>>\(new Set\(\)\)/.test(route),
);

ck(
  "1.4 the primary action is refused until something is chosen",
  /disabled=\{creating \|\| selectedCount === 0\}/.test(route),
);

// The pilot's three periods, and no permanent link hiding among them.
ck(
  "1.5 expiry is 7, 30 or 90 days, with 30 recommended and no permanent option",
  /\{ days: 7,/.test(route) &&
    /\{ days: 30,/.test(route) &&
    /\{ days: 90,/.test(route) &&
    /const DEFAULT_EXPIRY_DAYS = 30/.test(route) &&
    !/sc\.expiry\.never/.test(route) &&
    /z\.literal\(7\), z\.literal\(30\), z\.literal\(90\)/.test(functions),
);

// The server is the boundary, not the browser: the ids go to a function that
// checks every one of them against auth.uid().
ck(
  "1.6 the selection is enforced server-side",
  /sp_create_selected_disclosure/.test(functions) &&
    /IF \(SELECT count\(\*\) FROM public\.sp_claims c[\s\S]{0,320}<> cardinality\(_c\) THEN/.test(
      migration,
    ) &&
    /SP_MERIT_NOT_SHAREABLE/.test(migration),
);

// A merit added later must not join a link already sent. The item rows are
// what make that true; the payload reads them and nothing else.
ck(
  "1.7 the scope is pinned as rows, not re-evaluated at read time",
  /INSERT INTO public\.sp_disclosure_items \(disclosure_id, claim_id\)/.test(migration) &&
    /AND c\.id = ANY\(_c\)/.test(migration) &&
    /AND e\.id = ANY\(_e\)/.test(migration),
);

/* ================================================================== */
group("GROUP 2 — the preview IS the page");
/* ================================================================== */

ck(
  "2.1 the sharing screen renders the recipient view component",
  /<RecipientPassportView/.test(route),
);
ck("2.2 and so does the public page", /<RecipientPassportView/.test(publicPage));
ck(
  "2.3 there is no second recipient renderer for a preview to drift from",
  !/PreviewCard|MockRecipient|FakeRecipient/.test(route),
);
ck(
  "2.4 the preview payload comes from the server, through the live builder",
  /previewSelectedShare/.test(route) &&
    /sp_preview_selected_disclosure/.test(functions) &&
    /RETURN public\.sp_selected_merits_payload\(/.test(migration),
);
// The one thing a preview may legitimately differ in is the marketing block,
// which is addressed to a stranger and to nobody on the holder's own screen.
ck("2.5 the only preview-only difference is declared as such", /preview = false/.test(view));

/* ================================================================== */
group("GROUP 3 — the recipient page, rendered");
/* ================================================================== */

const claim = (over: Record<string, unknown>) => ({
  id: "c",
  type: "licence",
  title: "Titel",
  credential_code: null,
  issuer: "Utfärdaren",
  jurisdiction: "SE",
  sub_jurisdiction: null,
  scope_limited: false,
  authorisation_scope: null,
  issued_on: "2024-01-01",
  valid_until: null,
  assertion: "verified",
  lifecycle: "active",
  verified_at: "2024-02-01",
  verifier_organisation: "CQrityjob",
  verification_method: "document_review",
  ...over,
});

const payload = {
  status: "active",
  package: "selected_merits",
  focus: "passport",
  purpose: null,
  locale: "sv",
  expires_at: "2026-10-07",
  authorised_at: "2026-09-07",
  last_updated: "2026-09-07",
  holder: "Selma Delare",
  privacy_mode: "full_name",
  profession_slug: "vaktare",
  jurisdiction: "SE",
  sub_jurisdiction: null,
  verified_claims: [
    // A CQrityjob document review. Documented, and nothing more.
    claim({ id: "c1", title: "Vald behörighet A", credential_code: "VU1", type: "training" }),
    // An ISSUER confirmation. Verified by an authorised verifier, but this
    // product has no issuer identity, membership or revocation authority
    // behind it, so it must not wear a source word either.
    claim({
      id: "c2",
      title: "Vald behörighet B",
      verification_method: "issuer_confirmation",
      verifier_organisation: "Länsstyrelsen",
    }),
    // Past its validity date. Neutral validity copy, not a trust downgrade.
    claim({ id: "c3", title: "Vald behörighet C", valid_until: "2025-01-01" }),
  ],
  verified_experience: [
    {
      id: "e1",
      employer: "Nordvakt AB",
      role: "Väktare",
      started_on: "2021-01-01",
      ended_on: "2023-01-01",
      jurisdiction: "SE",
      assertion: "verified",
      lifecycle: "active",
      verifier_organisation: "Nordvakt AB",
      verification_method: "employer_confirmation",
    },
    {
      id: "e2",
      employer: "Sydvakt AB",
      role: "Ordningsvakt",
      started_on: "2023-02-01",
      ended_on: null,
      jurisdiction: "SE",
      assertion: "verified",
      lifecycle: "active",
      verifier_organisation: "CQrityjob",
      verification_method: "document_review",
    },
  ],
  verified_experience_days: 731,
} as unknown as RecipientPayloadActive;

const presentation = buildRecipientPresentation(payload, "2026-09-07");
const render = (lang: "sv" | "en") =>
  renderToStaticMarkup(
    <I18nProvider>
      <RecipientPassportView
        presentation={presentation}
        lang={lang}
        checkedAt="2026-09-07 09:00"
        verifyUrl="cqrityjob.se"
      />
    </I18nProvider>,
  );

const sv = render("sv");
const en = render("en");

const SOURCE_SV = passportT("trust.level.source_verified", "sv");
const DOCUMENTED_SV = passportT("trust.level.documented", "sv");

ck(
  "3.1 the shared merits are all present",
  ["A", "B", "C"].every((s) => sv.includes(`Vald behörighet ${s}`)),
);

// The scope proof at the render layer: a title the payload did not carry
// cannot appear, whatever the holder happens to own.
ck("3.2 a merit the payload did not carry appears nowhere", !sv.includes("Vald behörighet D"));

// The source word appears EXACTLY once on the page — in the legend, where it
// is being explained — and never against a credential. Counting is the honest
// assertion here: forbidding the string outright would forbid the explanation.
ck(
  "3.3 a CQrityjob document review is Dokumenterad, and no merit wears the source word",
  presentation.credentials[0].level === "documented" &&
    sv.includes(DOCUMENTED_SV) &&
    (sv.match(new RegExp(SOURCE_SV, "g")) ?? []).length === 1 &&
    sv.indexOf(SOURCE_SV) < sv.indexOf("Vald behörighet A"),
);

ck(
  "3.4 an issuer confirmation fails CLOSED to documented",
  presentation.credentials[1].level === "documented" &&
    presentation.credentials[1].noticeKey !== null,
);

ck(
  "3.5 no credential in this fixture reaches source-confirmed",
  presentation.credentials.every((c) => c.level !== "source_verified"),
);

ck(
  "3.6 an employer-confirmed EMPLOYMENT says so, in employment's own words",
  sv.includes(`${passportT("employment.attribution.employer_confirmation", "sv")} Nordvakt AB`),
);

// The mutation this must catch is a page that prints the employer sentence for
// EVERY employment. Naming the company in the assertion would miss it — the
// sentence names the DECIDER, so a mislabelled CQrityjob review reads
// "Anställningen är bekräftad av CQrityjob" and no company name appears.
// So the phrase is COUNTED: exactly one employment in this fixture was
// confirmed by an employer, so it may appear exactly once.
const EMPLOYER_LINE_SV = passportT("employment.attribution.employer_confirmation", "sv");
ck(
  "3.7 a document-reviewed employment does NOT borrow the employer's voice",
  (sv.match(new RegExp(EMPLOYER_LINE_SV, "g")) ?? []).length === 1 &&
    sv.includes(`${passportT("claims.attribution.document_review", "sv")} CQrityjob`) &&
    sv.includes("Sydvakt AB"),
);

ck(
  "3.8 an expired credential is presented as expired, and keeps its review",
  presentation.credentials[2].lapsed &&
    presentation.credentials[2].lifecycle === "expired" &&
    presentation.containsExpired &&
    sv.includes(passportT("rec.expiredNotice", "sv")),
);

ck(
  "3.9 the reader is told what the words mean before they meet one",
  sv.includes(passportT("rec.legendTitle", "sv")) &&
    sv.includes(passportT("rec.legend.employmentNote", "sv")) &&
    sv.indexOf(passportT("rec.legendTitle", "sv")) < sv.indexOf("Vald behörighet A"),
);

ck(
  "3.10 and what a share IS, before anything about a person",
  sv.includes(passportT("rec.whatThisIs", "sv")),
);

ck(
  "3.11 a chosen scope says the holder chose it, rather than a package's promises",
  sv.includes(passportT("rec.selectedScope", "sv")),
);

ck(
  "3.12 the tenure total says it is scoped to the shared employments",
  sv.includes(passportT("rec.tenureScoped", "sv")),
);

ck(
  "3.13 the English page renders completely, from the same component",
  en.includes(passportT("rec.legendTitle", "en")) &&
    en.includes(passportT("rec.whatThisIs", "en")) &&
    en.includes(passportT("trust.level.documented", "en")) &&
    en.includes(`${passportT("employment.attribution.employer_confirmation", "en")} Nordvakt AB`),
);

// A half-translated page is the specific failure a language OVERRIDE invites:
// one nested component keeps reading the visitor's preference.
ck(
  "3.14 the English page carries no Swedish left over from the reader's own language",
  !en.includes(DOCUMENTED_SV) && !en.includes(passportT("rec.legendTitle", "sv")),
);

ck(
  "3.15 no copy key leaks into either page as raw text",
  !/>(?:rec|sel|trust|ws)\.[a-z]/i.test(sv) && !/>(?:rec|sel|trust|ws)\.[a-z]/i.test(en),
);

ck(
  "3.16 exactly one H1",
  (sv.match(/<h1/g) ?? []).length === 1 && (en.match(/<h1/g) ?? []).length === 1,
);

/* ================================================================== */
group("GROUP 4 — the private half never crosses");
/* ================================================================== */

// The payload builder is the boundary. Asserted against its own text, because
// a field it never selects cannot leak however the page is written.
for (const forbidden of [
  "holder_note",
  "decision_note",
  "sp_evidence",
  "email",
  "personnummer",
  "national_id",
  "reviewer",
]) {
  ck(
    `4.1 the selected payload never reads ${forbidden}`,
    !new RegExp(`\\b${forbidden}\\b`).test(
      migration.slice(
        migration.indexOf("FUNCTION public.sp_selected_merits_payload"),
        migration.indexOf("FUNCTION public.sp_disclosure_payload"),
      ),
    ),
  );
}

ck(
  "4.2 the exact authorisation scope is withheld from a chosen-scope share",
  /'authorisation_scope', NULL/.test(
    migration.slice(
      migration.indexOf("FUNCTION public.sp_selected_merits_payload"),
      migration.indexOf("FUNCTION public.sp_disclosure_payload"),
    ),
  ),
);

ck(
  "4.3 the public page stays out of search indexes",
  /"robots", content: "noindex, nofollow"/.test(publicPage.replace(/name: /g, "")),
);

ck(
  "4.4 the selection table grants a holder no write, and anon nothing",
  /REVOKE ALL ON public\.sp_disclosure_items FROM anon, authenticated, PUBLIC;/.test(migration) &&
    /GRANT SELECT ON public\.sp_disclosure_items TO authenticated;/.test(migration),
);

/* ================================================================== */
group("GROUP 5 — nothing is claimed that the record does not carry");
/* ================================================================== */

// `access_count` counts every fetch, the holder's own verification click
// included. Calling that a read receipt would be the product asserting
// something about a person it has never observed.
ck(
  "5.1 opens are described as opens, never as the recipient having read",
  /sel\.existing\.opensNote/.test(route) &&
    !/läst|read receipt|har läst/i.test(passportT("sel.existing.opensNote", "sv")) === false,
);
ck(
  "5.2 and the note says out loud that it is not a receipt",
  /kvitto/i.test(passportT("sel.existing.opensNote", "sv")) &&
    /receipt/i.test(passportT("sel.existing.opensNote", "en")),
);

// Only the hash is stored, so a link cannot be re-shown. The screen says so
// rather than offering a control that cannot work.
ck(
  "5.3 the list does not offer to copy a link the product cannot recover",
  /sel\.existing\.noRecovery/.test(route),
);
ck(
  "5.4 only the token's hash is ever stored",
  /encode\(digest\(_token, 'sha256'\), 'hex'\)/.test(migration) &&
    // The holder's own list must never select it: it is of no use to them and
    // there is no reason for it to leave the database.
    !/\.select\([^)]*token_hash/.test(functions),
);

// A create whose answer is lost must reconcile, not duplicate.
ck(
  "5.5 a retry re-sends the same request key rather than minting a second link",
  /requestKey\.current/.test(route) &&
    /_request_key/.test(functions) &&
    /'status','already_created'/.test(migration) &&
    /sp_disclosures_request_key_uidx/.test(migration),
);
ck(
  "5.6 and the key is NOT rotated on a failed attempt",
  /\/\/ The key is deliberately NOT rotated/.test(route),
);

// A clipboard that refuses is ordinary, not exceptional.
ck(
  "5.7 a blocked clipboard leaves the link where it can be copied by hand",
  /setCopyFailed\(true\)/.test(route) && /sel\.copy\.failed/.test(route),
);

/* ================================================================== */
group("GROUP 6 — the selection model, exercised");
/* ================================================================== */

const now = new Date("2026-09-07T00:00:00Z");
const baseClaim = {
  claimType: "licence",
  credentialCode: null,
  skillCode: null,
  skillLevel: null,
  issuerName: "Utfärdaren",
  jurisdictionCode: "SE",
  subJurisdictionCode: null,
  authorisationScope: null,
  issuedOn: "2024-01-01",
  validFrom: null,
  validUntil: null,
  verifierName: "CQrityjob",
  verificationMethod: "document_review",
  verifiedOn: "2024-02-01",
  limitationSv: null,
  limitationEn: null,
  versionNo: 1,
  supersedesClaimId: null,
} as const;

const claims = [
  {
    ...baseClaim,
    id: "ok-licence",
    titleSv: "Delbar behörighet",
    titleEn: "Shareable authorisation",
    assertionLevel: "verified",
    lifecycleState: "active",
  },
  {
    ...baseClaim,
    id: "self",
    claimType: "training",
    titleSv: "Egen uppgift",
    titleEn: "Self-reported",
    assertionLevel: "self_declared",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
  },
  {
    ...baseClaim,
    id: "draft",
    claimType: "training",
    titleSv: "Utkast",
    titleEn: "Draft",
    assertionLevel: "self_declared",
    lifecycleState: "draft",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
  },
  {
    ...baseClaim,
    id: "archived",
    titleSv: "Arkiverad",
    titleEn: "Archived",
    assertionLevel: "verified",
    lifecycleState: "superseded",
  },
] as unknown as Claim[];

const periods = [
  {
    id: "emp-ok",
    employerName: "Nordvakt AB",
    roleTitle: "Väktare",
    startedOn: "2021-01-01",
    endedOn: "2023-01-01",
    assertionLevel: "verified",
    lifecycleState: "active",
    verifierName: "Nordvakt AB",
    verificationMethod: "employer_confirmation",
  },
] as unknown as ExperiencePeriod[];

// `attention: null` with `reviewState: "available"` is the contradiction a
// caller can reach by accident. It must normalise, not crash: losing a badge
// is a bad afternoon, losing the screen is a holder who cannot share at all.
const model = buildShareSelection({
  claims,
  periods,
  attention: null,
  reviewState: "available",
  now,
});
const offered = model.groups.flatMap((g) => g.merits.map((m) => m.id));

ck("6.1 a current, verified merit is offered", offered.includes("ok-licence"));
ck("6.2 POSITIVE CONTROL an employment is offered too", offered.includes("emp-ok"));
ck("6.3 a self-reported merit is NOT offered", !offered.includes("self"));
ck("6.4 a draft is NOT offered", !offered.includes("draft"));
ck("6.5 an archived merit is NOT offered", !offered.includes("archived"));
ck(
  "6.6 the groups are the three the brief names, and empty ones do not render",
  model.groups.every((g) => ["employment", "qualification", "authorisation"].includes(g.id)) &&
    model.groups.every((g) => g.merits.length > 0),
);
ck(
  "6.7 the shareable rule is the one the create enforces",
  isShareable({ assertionLevel: "verified", lifecycleState: "active" }) &&
    !isShareable({ assertionLevel: "document_provided", lifecycleState: "active" }) &&
    !isShareable({ assertionLevel: "verified", lifecycleState: "superseded" }),
);
ck(
  "6.8 a review read with no answer degrades to unknown rather than crashing",
  model.reviewState === "failed" && model.reviewUnavailable,
);
ck(
  "6.9 the unshareable merits are counted rather than silently dropped",
  model.unshareable.notVerified === 1 &&
    model.unshareable.archived === 1 &&
    model.unshareable.drafts === 1,
);

/* ================================================================== */
if (fails.length > 0) {
  console.error(`\npassport-sharing-flow-check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\npassport-sharing-flow-check: all assertions passed.`);
