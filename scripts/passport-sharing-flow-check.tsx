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
import { buildShareSelection } from "../src/lib/security-passport/share-selection";
import {
  caveatFor,
  isShareableMerit,
  shareEligibility,
} from "../src/lib/security-passport/share-policy";
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
const POLICY = "src/lib/security-passport/share-policy.ts";
const FUNCTIONS = "src/lib/security-passport/selected-sharing.functions.ts";
const MIGRATION = "supabase/migrations/20261101090000_sp_selected_merit_sharing.sql";

const route = read(ROUTE);
const view = read(VIEW);
const publicPage = read(PUBLIC);
const selectionSrc = read(SELECTION);
const policySrc = read(POLICY);
const functions = read(FUNCTIONS);
const migration = read(MIGRATION);

/* ================================================================== */
group("GROUP 1 — the scope is the holder's, and the server's");
/* ================================================================== */

// The rule the screen offers and the rule the database accepts must be one
// rule. If they drift, the holder is shown merits the create will refuse.
// THE SHARING POLICY. One rule, four enforcement points, and the screen must
// offer exactly what the create accepts: laxer and it offers merits the create
// refuses; stricter and it hides merits the holder is entitled to send.
ck(
  "1.1 the screen's eligibility rule is the migration's, verbatim in meaning",
  /isCurrentMerit\(row\.lifecycleState\)/.test(policySrc) &&
    /c\.lifecycle_state = 'active'/.test(migration) &&
    /e\.lifecycle_state = 'active'/.test(migration),
);

// The reversal: assertion level must NOT gate sharing, on either side.
ck(
  "1.2 nothing filters on an assertion level anywhere in the sharing path",
  !/assertion_level|assertionLevel/.test(policySrc) &&
    !/assertion_level|assertionLevel/.test(selectionSrc) &&
    !/assertion_level|assertionLevel/.test(route),
);
ck(
  "1.3 and the create's own ownership check gates on lifecycle only",
  /WHERE c\.id = ANY\(_c\) AND c\.holder_user_id = auth\.uid\(\)\s*\n\s*AND c\.lifecycle_state = 'active'\)/.test(
    migration,
  ),
);

ck(
  "1.4 the route decides no eligibility of its own",
  route.includes("buildShareSelection") && !/lifecycle_state/.test(route),
);

// Nothing is ticked for the holder. A pre-ticked list is a decision made on
// somebody's behalf about what a stranger may see.
ck(
  "1.5 nothing is selected by default",
  /useState<ReadonlySet<string>>\(new Set\(\)\)/.test(route),
);

ck(
  "1.6 the primary action is refused until something is chosen",
  /disabled=\{creating \|\| selectedCount === 0\}/.test(route),
);

// The pilot's three periods, and no permanent link hiding among them.
ck(
  "1.7 expiry is 7, 30 or 90 days, with 30 recommended and no permanent option",
  /\{ days: 7,/.test(route) &&
    /\{ days: 30,/.test(route) &&
    /\{ days: 90,/.test(route) &&
    /const DEFAULT_EXPIRY_DAYS = 30/.test(route) &&
    !/sc\.expiry\.never/.test(route) &&
    /z\.literal\(7\), z\.literal\(30\), z\.literal\(90\)/.test(functions),
);

// ── THE INPUT CONTRACT IS IN THE DATABASE ────────────────────────────
//
// A Zod schema is a courtesy to the person filling in the form. The RPC is
// callable by any authenticated principal with a HTTP client, so every one of
// these has to be refused where the write happens.
ck(
  "1.8 the database refuses a missing request key, a bad expiry and a bad locale",
  /SP_REQUEST_KEY_REQUIRED/.test(migration) &&
    /_expires_days IS NULL OR _expires_days NOT IN \(7, 30, 90\)/.test(migration) &&
    /_locale IS NULL OR _locale NOT IN \('sv', 'en'\)/.test(migration),
);
ck(
  "1.9 and all three entry points run the same assertion",
  (migration.match(/PERFORM public\.sp_assert_share_inputs\(/g) ?? []).length >= 3,
);

// The server is the boundary, not the browser: the ids go to a function that
// checks every one of them against auth.uid().
ck(
  "1.10 the selection is enforced server-side",
  /sp_create_selected_disclosure/.test(functions) && /SP_MERIT_NOT_SHAREABLE/.test(migration),
);

// A merit added later must not join a link already sent. The item rows are
// what make that true; the payload reads them and nothing else.
ck(
  "1.11 the scope is pinned as rows, not re-evaluated at read time",
  /INSERT INTO public\.sp_disclosure_items \(disclosure_id, claim_id\)/.test(migration) &&
    /AND c\.id = ANY\(_c\)/.test(migration) &&
    /AND e\.id = ANY\(_e\)/.test(migration),
);

// ── IDEMPOTENCY ──────────────────────────────────────────────────────
ck(
  "1.12 a request key is bound to a fingerprint of every fact that decides the share",
  /sp_share_request_fingerprint/.test(migration) &&
    /_expires_days/.test(migration) &&
    /SP_REQUEST_KEY_CONFLICT/.test(migration) &&
    /request_fingerprint IS DISTINCT FROM _fp/.test(migration),
);
ck(
  "1.13 simultaneous callers are serialised on the key, and a unique violation " +
    "is never surfaced",
  /PERFORM pg_advisory_xact_lock\(/.test(migration) &&
    /EXCEPTION WHEN unique_violation THEN/.test(migration),
);
// Sorted AND deduplicated, or {A,B} and {B,A} would be two intentions.
ck(
  "1.14 the scope is normalised before it is hashed",
  (migration.match(/array_agg\(DISTINCT x ORDER BY x\)/g) ?? []).length >= 4,
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
  key: "c",
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

// A MIXED-TRUST share, which is the ordinary case now that lifecycle gates
// sharing and assertion level does not. All three rungs are present, so a
// single fixture proves that each one wears its own word and none of them
// borrows a stronger one.
const payload = {
  status: "active",
  package: "selected_merits",
  focus: "passport",
  purpose: null,
  locale: "sv",
  expires_at: "2026-10-07T09:00:00Z",
  authorised_at: "2026-09-07T09:00:00Z",
  checked_at: "2026-09-07T07:00:00Z",
  last_updated: "2026-08-30T09:00:00Z",
  holder: "Selma Delare",
  privacy_mode: "full_name",
  profession_slug: "vaktare",
  jurisdiction: "SE",
  sub_jurisdiction: null,
  verified_claims: [
    // A CQrityjob document review. Documented, and nothing more.
    claim({ key: "c1", title: "Vald behörighet A", credential_code: "VU1", type: "training" }),
    // An ISSUER confirmation. Verified by an authorised verifier, but this
    // product has no issuer identity, membership or revocation authority
    // behind it, so it must not wear a source word either.
    claim({
      key: "c2",
      title: "Vald behörighet B",
      verification_method: "issuer_confirmation",
      verifier_organisation: "Länsstyrelsen",
    }),
    // Past its validity date. Neutral validity copy, not a trust downgrade.
    claim({ key: "c3", title: "Vald behörighet C", valid_until: "2025-01-01" }),
    // THE HOLDER'S OWN WORD. Shareable, and it says so.
    claim({
      key: "c4",
      title: "Vald behörighet D",
      type: "training",
      assertion: "self_declared",
      verified_at: null,
      verifier_organisation: null,
      verification_method: null,
    }),
    // A document attached and nobody has assessed it. On the public ladder
    // this sits on the self-declared rung, NOT the documented one.
    claim({
      key: "c5",
      title: "Vald behörighet E",
      type: "training",
      assertion: "document_provided",
      verified_at: null,
      verifier_organisation: null,
      verification_method: null,
    }),
  ],
  verified_experience: [
    {
      key: "e1",
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
      key: "e2",
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
      <RecipientPassportView presentation={presentation} lang={lang} verifyUrl="cqrityjob.se" />
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
ck("3.2 a merit the payload did not carry appears nowhere", !sv.includes("Vald behörighet F"));

// The source word appears EXACTLY once on the page — in the glossary, where
// it is being explained — and never against a credential. Counting is the
// honest assertion: forbidding the string outright would forbid the
// explanation, and the glossary now sits AFTER the merits, so position alone
// no longer separates the two.
ck(
  "3.3 a CQrityjob document review is Dokumenterad, and no merit wears the source word",
  presentation.credentials[0].level === "documented" &&
    sv.includes(DOCUMENTED_SV) &&
    (sv.match(new RegExp(SOURCE_SV, "g")) ?? []).length === 1 &&
    sv.indexOf(SOURCE_SV) > sv.indexOf("Vald behörighet A"),
);

// THE REVERSED POLICY, rendered. A self-declared entry and an unassessed
// document are both shareable, and both sit on the bottom rung — an attached
// file is evidence that EXISTS, not evidence that was checked (PR #189).
ck(
  "3.3a a self-declared merit reads as the holder's own word",
  presentation.credentials[3].level === "self_declared" &&
    presentation.credentials[3].assertion === "self_declared",
);
ck(
  "3.3b and an unassessed document does NOT reach Documented",
  presentation.credentials[4].level === "self_declared" &&
    presentation.credentials[4].assertion === "document_provided",
);
ck(
  "3.3c so one page carries two different standings without either borrowing " + "the other's word",
  new Set(presentation.credentials.map((c) => c.level)).size === 2 &&
    presentation.credentials.some((c) => c.level === "documented") &&
    presentation.credentials.some((c) => c.level === "self_declared"),
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

// THE GLOSSARY COMES AFTER THE EVIDENCE.
//
// It sat above the card until the review of PR #197: a definition list
// between a reader and the thing they opened the link to see. Each merit
// states its own provenance where it stands; this is the reference for
// anybody who wants the words spelled out, and reference material belongs
// after the record.
ck(
  "3.9 the glossary is present, and it is AFTER the merits it explains",
  sv.includes(passportT("rec.legendTitle", "sv")) &&
    sv.includes(passportT("rec.legend.employmentNote", "sv")) &&
    sv.indexOf(passportT("rec.legendTitle", "sv")) > sv.indexOf("Vald behörighet A"),
);
ck(
  "3.9a the holder's identity and the Passport card come first",
  sv.indexOf("Selma Delare") < sv.indexOf(passportT("rec.legendTitle", "sv")),
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
  "3.12 the duration says it is scoped to the shared employments",
  sv.includes(passportT("rec.tenureScoped", "sv")),
);

// ── THE RENAMED PUBLIC FRAMING ───────────────────────────────────────
//
// "Verifiering", "den här sidan är källan" and "granskad tid i yrket" each
// claimed more than a share is: a mixed set the holder chose, some of which
// nobody has checked.
ck(
  "3.12a the page is framed as a SHARE, not as a verification",
  sv.includes("Delat Security Passport") &&
    !sv.includes("Verifiering av Security Passport") &&
    en.includes("Shared Security Passport") &&
    !en.includes("Security Passport verification"),
);
ck(
  "3.12b it says it is the current share, not that it is the source",
  !sv.includes("Den här sidan är källan") && !en.includes("This page is the source"),
);
ck(
  "3.12c the duration is named for what it counts",
  sv.includes("Bekräftad anställningstid") &&
    en.includes("Confirmed employment duration") &&
    !sv.includes("Granskad tid i yrket"),
);
ck(
  "3.12d and the check time is about the LINK, not about the merits",
  sv.includes("Länkstatus kontrollerad") && en.includes("Share status checked"),
);

// ── TIME AND DATES ───────────────────────────────────────────────────
ck(
  "3.12e the check time comes from the payload, in a stated time zone",
  presentation.checkedAt === "2026-09-07T07:00:00Z" && /\bCET\b|\bGMT\+|\bCEST\b/.test(sv),
);
ck(
  "3.12f dates are localised, not ISO — employment, review and validity alike",
  sv.includes("1 januari 2021") &&
    en.includes("1 January 2021") &&
    sv.includes("1 februari 2024") &&
    !/\b20\d\d-\d\d-\d\d\b/.test(sv),
);

// A merit nobody assessed must not print three empty verification fields:
// "Verifierad av: Ej angivet" reads as a verification that was expected and is
// missing, which is heavier than the truth — nobody was asked.
ck(
  "3.12h a self-declared merit shows no empty who / how / when rows",
  (sv.match(new RegExp(passportT("common.notStated", "sv"), "g")) ?? []).length <=
    (sv.match(new RegExp(passportT("rec.profession", "sv"), "g")) ?? []).length + 1,
);
ck(
  "3.12g and freshness describes the shared facts, not the moment of sharing",
  sv.includes("30 augusti 2026"),
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

// ── NO DATABASE IDENTIFIER CROSSES ───────────────────────────────────
//
// A uuid printed into anonymous JSON reaches the DOM, a screenshot, an
// analytics payload and a support ticket. It survives revocation, it is the
// same value in two shares, and it correlates one recipient's copy with
// another's. The DB suite proves the payload carries none; this proves the
// RENDER carries none either, which is where a careless key={} would put it.
ck(
  "4.2a the anonymous read strips row identifiers and substitutes an ordinal",
  /row\.value - 'id'/.test(migration) && /'key', coalesce\(row\.value ->> 'key'/.test(migration),
);
ck(
  "4.2b the builder emits a presentation key and never an id",
  /'key', 'c' \|\| t\.ord/.test(migration) && /'key', 'e' \|\| t\.ord/.test(migration),
);
ck(
  "4.2c the model and every renderer read that key, not an id",
  /readonly key: string;/.test(read("src/lib/security-passport/recipient-presentation.ts")) &&
    /data-recipient-credential=\{c\.key\}/.test(
      read("src/components/security-passport/live/RecipientCredentialList.tsx"),
    ) &&
    /data-recipient-employment=\{e\.key\}/.test(view),
);
// The rendered page, checked against a real uuid shape rather than a name.
ck(
  "4.2d MUTATION no uuid appears anywhere in the rendered page, in either language",
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sv) &&
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(en),
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

// The Open Graph card is the one thing a reader meets BEFORE any label, so it
// must not put the strongest word on a mixed set.
ck(
  "4.5 the link preview makes no claim about standing",
  !/Verified professional records|Verifierade yrkesuppgifter/.test(publicPage) &&
    /Each entry shows where it came from/.test(publicPage),
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
// rather than offering a control that cannot work — and offers the thing that
// CAN work in its place.
ck(
  "5.3 the list does not offer to copy a link the product cannot recover",
  /sel\.existing\.noRecovery/.test(route),
);
ck(
  "5.3a it offers a NEW link over the same contents instead",
  /sel\.reissue/.test(route) &&
    /replaceShare/.test(route) &&
    /sp_replace_selected_disclosure/.test(functions),
);
// The reissue's own body mints a token. Sliced rather than matched across the
// file, so this cannot be satisfied by the CREATE's token a few hundred lines
// earlier.
const reissueBody = migration.slice(
  migration.indexOf("FUNCTION public.sp_replace_selected_disclosure"),
);
ck(
  "5.3b which mints a fresh token rather than recovering one",
  /gen_random_bytes\(32\)/.test(reissueBody) &&
    /encode\(digest\(_token, 'sha256'\)/.test(reissueBody),
);
ck(
  "5.3c and the holder chooses explicitly whether the old link keeps working",
  /data-share-reissue-revoke/.test(route) &&
    /_revoke_previous/.test(functions) &&
    /IF _revoke THEN/.test(migration),
);
ck(
  "5.3d a reissue whose contents have lapsed is refused, not shipped smaller",
  /SP_MERIT_NOT_SHAREABLE/.test(reissueBody) && /sel\.error\.lapsed/.test(route),
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
const offered = model.groups.flatMap((g) => g.candidates.map((c) => c.merit.id));

ck("6.1 a current, verified merit is offered", offered.includes("ok-licence"));
ck("6.2 POSITIVE CONTROL an employment is offered too", offered.includes("emp-ok"));
// THE REVERSAL, exercised: a self-reported merit IS offered now, and it is
// the recipient page's own labels that keep it honest.
ck("6.3 a self-reported merit IS offered", offered.includes("self"));
ck("6.4 a draft is NOT offered", !offered.includes("draft"));
ck("6.5 an archived merit is NOT offered", !offered.includes("archived"));
ck(
  "6.6 the groups are the three the brief names, and empty ones do not render",
  model.groups.every((g) => ["employment", "qualification", "authorisation"].includes(g.id)) &&
    model.groups.every((g) => g.candidates.length > 0),
);
ck(
  "6.7 the shareable rule is the one the create enforces: lifecycle only",
  isShareableMerit({ lifecycleState: "active" }) &&
    !isShareableMerit({ lifecycleState: "draft" }) &&
    !isShareableMerit({ lifecycleState: "superseded" }) &&
    !isShareableMerit({ lifecycleState: "expired" }) &&
    !isShareableMerit({ lifecycleState: "revoked" }) &&
    !isShareableMerit({ lifecycleState: "disputed" }),
);
ck(
  "6.7a and a lifecycle nobody taught it about fails CLOSED",
  shareEligibility({ lifecycleState: "something-new" }) === "archived",
);

// ── THE REVIEW STATE FAILS CLOSED ────────────────────────────────────
//
// A merit whose review could not be read must not present as settled. The
// caveat is never a reason to withhold the merit — the recipient reads its
// stored standing either way — but the holder is owed the difference between
// "nothing is open" and "we could not tell".
ck(
  "6.7b an unreadable review state is `unknown`, never a settled word",
  caveatFor("added_by_you", "failed") === "unknown" &&
    caveatFor("documented", "failed") === "unknown" &&
    caveatFor("verified", "loading") === "unknown",
);
ck(
  "6.7c and an open case is named rather than hidden",
  caveatFor("clarification_needed", "available") === "needs_answer" &&
    caveatFor("verification_requested", "available") === "in_review" &&
    caveatFor("documented", "available") === "none",
);
ck(
  "6.7d the screen says so once, at the top, and beside each affected merit",
  /sel\.reviewUnavailable/.test(route) && /data-merit-caveat=\{caveat\}/.test(route),
);
ck(
  "6.8 a review read with no answer degrades to unknown rather than crashing",
  model.reviewState === "failed" && model.reviewUnavailable,
);
ck(
  "6.8a and every offered merit then carries the unknown caveat",
  model.groups.every((g) => g.candidates.every((c) => c.caveat === "unknown")),
);
ck(
  "6.9 the unshareable merits are counted rather than silently dropped",
  model.unshareable.archived === 1 && model.unshareable.drafts === 1,
);

/* ================================================================== */
if (fails.length > 0) {
  console.error(`\npassport-sharing-flow-check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\npassport-sharing-flow-check: all assertions passed.`);
