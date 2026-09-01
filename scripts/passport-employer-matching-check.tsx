// Security Passport — finding the right employer, and never guessing at one.
//
// Run via `bun run passport-employer-matching:check`.
//
// ── WHAT WAS WRONG ─────────────────────────────────────────────────────
//
// An independent pilot found employment confirmation itself working and the
// way INTO it broken. One query was behind all of it:
//
//     .from("employers").select("id, name").order("name").limit(200)
//
// and one line of component state:
//
//     useState<string>(employers[0]?.id ?? "")
//
//   M1  ORGANISATIONS WITH NO CONNECTION TO THE EMPLOYMENT filled the
//       picker, in alphabetical order, and the first of them was already
//       selected. A candidate who worked at "Nordvakt AB" opened the control
//       on whichever company sorts first.
//
//   M2  THERE WAS NO WAY TO SEARCH, and no country beside a name, so two
//       organisations called the same thing in two countries were one label
//       twice.
//
//   M3  AN INELIGIBLE ORGANISATION COULD BE ASKED. `employers_member_select`
//       lets a member read their own organisation at any status, so a
//       candidate holding a `pending` company they had registered themselves
//       could address employment confirmation to it.
//
//   M4  A FAILED SEARCH READ AS AN EMPTY WORLD. `if (error) return []` turned
//       a refused query into "No connected employer was found".
//
//   M5  THERE WAS NO ROUTE FOR "my employer is not on CQrityjob" at all.
//
// ── WHAT THIS SCRIPT WILL NOT ACCEPT ───────────────────────────────────
//
// The rule underneath every assertion below: CQrityjob may ORDER
// organisations and may never IDENTIFY one. "Nordvakt AB", "Nord Vakt AB" and
// "Nordvakt Sverige AB" stay three rows however similar they look, no
// suggestion is ever a selection, and no selection is ever a request.
//
// ── WHY IT RENDERS ─────────────────────────────────────────────────────
//
// Half of these are claims about what a person SEES: that nothing is
// preselected, that a failed search and an empty search say different things,
// that the not-on-platform route promises no invitation. A prop computed
// correctly and rendered by nothing passes a source scan and fixes nothing.
// The other half — eligibility, duplicate requests, self-verification, tenant
// isolation — are properties of the DATABASE, and are asserted against the
// migration text, because a component cannot enforce them and must not be
// trusted to.

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PassportCopyKey } from "../src/lib/security-passport/i18n";
import type { EmployerCandidate } from "../src/lib/security-passport/employer-matching";

// Same substitute, and for the same reason, as the other render-based Passport
// guards: <Link> needs a live router and does not render synchronously under
// renderToStaticMarkup. The modules under test are imported AFTER the mock is
// installed, which is why these are dynamic imports.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
}));

const { I18nProvider } = await import("../src/i18n/context");
const { EmployerConfirmationPicker, EmployerConfirmationStep } =
  await import("../src/components/security-passport/live/EmployerConfirmationPicker");
const { passportT } = await import("../src/lib/security-passport/i18n");
const {
  rankEmployerMatches,
  normaliseName,
  distinctiveWords,
  employerSearchTerms,
  MAX_SUGGESTIONS,
} = await import("../src/lib/security-passport/employer-matching");

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** These files EXPLAIN at length the anti-patterns they no longer commit. A
 *  naive scan reads the explanation as the offence. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** SQL comments explain at length what a migration does NOT do. A scan that
 *  reads the explanation as the deed is a scan that can never pass. */
const sql = (src: string) => src.replace(/^\s*--.*$/gm, "");

const html = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);
const sv = (k: PassportCopyKey) => passportT(k, "sv");
const en = (k: PassportCopyKey) => passportT(k, "en");

/* ------------------------------------------------------------------ */
/* The pilot's own organisations                                       */
/* ------------------------------------------------------------------ */

const org = (
  id: string,
  name: string,
  country: string | null,
  website: string | null = null,
): EmployerCandidate => ({ id, name, country, website });

/** Scenario A and C from the pilot script, as one set. Nordvakt AB is the
 *  employer on the employment; the other three exist to be got wrong. */
const NORDVAKT = org("e-nordvakt", "Nordvakt AB", "SE", "nordvakt.example");
const SECURECO = org("e-secureco", "SecureCo AB", "SE");
const NORDVAKT_DUBAI = org("e-dubai", "Nordvakt Dubai LLC", "AE");
const NORD_VAKT = org("e-nordvakt2", "Nord Vakt AB", "SE");
const NORDVAKT_SVERIGE = org("e-nordvakt3", "Nordvakt Sverige AB", "SE");

const EMPLOYMENT = { employmentEmployerName: "Nordvakt AB", employmentCountry: "SE" as const };

const rank = (
  candidates: readonly EmployerCandidate[],
  query = "",
  linkedEmployerId: string | null = null,
) =>
  rankEmployerMatches({
    ...EMPLOYMENT,
    query,
    candidates,
    linkedEmployerId,
  });

/* ================================================================== */
/* A + C. Relevance, and what must NOT be in the list                  */
/* ================================================================== */

group("A/C. Ranking (the matcher, with no database anywhere near it)");
{
  const all = [SECURECO, NORDVAKT_DUBAI, NORDVAKT, NORD_VAKT];
  const r = rank(all);

  ck("A. the exact-name organisation is first", r.suggestions[0]?.employer.id === NORDVAKT.id);
  ck(
    "A. and is labelled as an exact match, not as a search result",
    r.suggestions[0]?.reason === "exact_name",
  );

  const ids = r.suggestions.map((s) => s.employer.id);
  ck(
    "C. an unrelated same-country organisation is not in the default list at all",
    !ids.includes(SECURECO.id),
  );
  ck(
    "C. a similarly-named organisation in ANOTHER country is not suggested by default",
    !ids.includes(NORDVAKT_DUBAI.id),
  );

  // Same-country relevance, proved with an organisation that shares a
  // distinctive word rather than the whole name.
  const NORDVAKT_VAST = org("e-vast", "Nordvakt Vast AB", "SE");
  const withSibling = rank([SECURECO, NORDVAKT_VAST, NORDVAKT]);
  ck(
    "B. a same-country organisation sharing a distinctive word IS suggested",
    withSibling.suggestions.some((s) => s.employer.id === NORDVAKT_VAST.id),
  );
  ck(
    "B. and ranks below the exact-name match, never above it",
    withSibling.suggestions.findIndex((s) => s.employer.id === NORDVAKT.id) <
      withSibling.suggestions.findIndex((s) => s.employer.id === NORDVAKT_VAST.id),
  );
  ck(
    "B. labelled 'same country' rather than 'exact match'",
    withSibling.suggestions.find((s) => s.employer.id === NORDVAKT_VAST.id)?.reason ===
      "same_country",
  );

  // An organisation that has stated no country is not promoted into the
  // same-country bucket by having said nothing.
  const NO_COUNTRY = org("e-unknown", "Nordvakt Norr AB", null);
  ck(
    "B. an organisation with no stated country is not treated as same-country",
    !rank([NO_COUNTRY]).suggestions.some((s) => s.reason === "same_country"),
  );
}

/* ================================================================== */
/* D. Explicit search                                                  */
/* ================================================================== */

group("D. Search finds what the candidate types, and only then");
{
  ck(
    "an unrelated organisation is reachable BY SEARCHING for it",
    rank([SECURECO, NORDVAKT], "secure").suggestions.some((s) => s.employer.id === SECURECO.id),
  );
  ck(
    "and arrives labelled as a search result",
    rank([SECURECO, NORDVAKT], "secure").suggestions.find((s) => s.employer.id === SECURECO.id)
      ?.reason === "search",
  );
  ck(
    "the foreign namesake is findable by typing it, having not been suggested",
    rank([NORDVAKT_DUBAI, NORDVAKT], "dubai").suggestions.some(
      (s) => s.employer.id === NORDVAKT_DUBAI.id,
    ),
  );
  ck(
    "an empty query produces no search results (no query is not 'everything')",
    !rank([SECURECO]).suggestions.some((s) => s.reason === "search"),
  );
  ck(
    "search is case- and accent-insensitive",
    rank([org("e-a", "Väktarna Öst AB", "SE")], "vaktarna ost").suggestions.length === 1,
  );
  ck(
    "a search matching nothing returns nothing rather than a fallback list",
    rank([SECURECO, NORDVAKT_DUBAI], "small security partner").suggestions.length === 0,
  );

  // A previously-asked organisation outranks even the exact-name match: the
  // candidate already made that choice for this employment.
  const linked = rank([NORDVAKT, NORDVAKT_SVERIGE], "", NORDVAKT_SVERIGE.id);
  ck(
    "an organisation this employment was already addressed to ranks first",
    linked.suggestions[0]?.employer.id === NORDVAKT_SVERIGE.id &&
      linked.suggestions[0]?.reason === "linked",
  );

  const terms = employerSearchTerms("Nordvakt Sverige AB", "sec");
  ck("the search terms include what the candidate typed", terms.includes("sec"));
  ck("and the distinctive words of the employment's employer", terms.includes("nordvakt"));
  ck("but never the legal form on its own", !terms.includes("ab"));
}

/* ================================================================== */
/* NO AUTO-MERGE. Three companies stay three companies                 */
/* ================================================================== */

group("No auto-merge: similar names are not the same legal person");
{
  ck(
    "'Nordvakt AB' and 'Nord Vakt AB' do not normalise to one name",
    normaliseName("Nordvakt AB") !== normaliseName("Nord Vakt AB"),
  );
  ck(
    "'Nordvakt AB' and 'Nordvakt Sverige AB' do not normalise to one name",
    normaliseName("Nordvakt AB") !== normaliseName("Nordvakt Sverige AB"),
  );
  ck(
    "the legal form is NOT stripped when deciding an exact match",
    normaliseName("Nordvakt AB") !== normaliseName("Nordvakt Ltd"),
  );
  ck(
    "it IS stripped when deciding what is distinctive, so 'AB' matches nothing",
    !distinctiveWords("Nordvakt AB").includes("ab"),
  );

  const three = rank([NORDVAKT, NORD_VAKT, NORDVAKT_SVERIGE], "nord");
  ck(
    "all three remain separate rows in the result",
    new Set(three.suggestions.map((s) => s.employer.id)).size === 3,
  );
  ck(
    "exactly one of them is called an exact match",
    three.suggestions.filter((s) => s.reason === "exact_name").length === 1,
  );

  // Determinism: the same inputs, in a different order, give the same answer.
  const a = rank([NORDVAKT, NORD_VAKT, NORDVAKT_SVERIGE], "nord").suggestions.map(
    (s) => s.employer.id,
  );
  const b = rank([NORDVAKT_SVERIGE, NORDVAKT, NORD_VAKT], "nord").suggestions.map(
    (s) => s.employer.id,
  );
  ck("ranking is independent of input order", JSON.stringify(a) === JSON.stringify(b));
}

/* ================================================================== */
/* No score, ever                                                      */
/* ================================================================== */

group("No confidence, no score, no 'AI match'");
{
  const one = rank([NORDVAKT]).suggestions[0];
  ck(
    "a suggestion carries an employer and a reason, and nothing else",
    one !== undefined && JSON.stringify(Object.keys(one).sort()) === '["employer","reason"]',
  );

  const matcher = code(read("src/lib/security-passport/employer-matching.ts"));
  for (const forbidden of ["score", "confidence", "similarity", "probability"]) {
    ck(`the matcher returns no ${forbidden}`, !new RegExp(`${forbidden}\\s*:`, "i").test(matcher));
  }

  const picker = code(read("src/components/security-passport/live/EmployerConfirmationPicker.tsx"));
  ck("the picker renders no percentage", !/%\{|\{[^}]*Percent/i.test(picker));
  for (const lang of ["sv", "en"] as const) {
    for (const reason of [
      "ver.employer.reason.linked",
      "ver.employer.reason.exact_name",
      "ver.employer.reason.same_country",
      "ver.employer.reason.search",
    ] as PassportCopyKey[]) {
      const label = passportT(reason, lang);
      ck(`${lang} ${reason} is a word, not a number`, !/\d/.test(label) && label.length > 0);
    }
  }
}

/* ================================================================== */
/* Privacy: what a candidate may learn about an organisation           */
/* ================================================================== */

group("Employer privacy: four public fields, and no fifth");
{
  const matcher = read("src/lib/security-passport/employer-matching.ts");
  const iface = matcher.slice(
    matcher.indexOf("export interface EmployerCandidate"),
    matcher.indexOf("export type MatchReason"),
  );
  for (const forbidden of [
    "member",
    "admin",
    "email",
    "note",
    "moderation",
    "application",
    "workforce",
    "queue",
    "status",
  ]) {
    ck(
      `EmployerCandidate carries no ${forbidden} field`,
      !new RegExp(`readonly\\s+\\w*${forbidden}`, "i").test(iface),
    );
  }

  const fns = read("src/lib/security-passport/verification.functions.ts");
  const search = fns.slice(
    fns.indexOf("export const searchAttestableEmployers"),
    fns.indexOf("export const listEmployerAttestations"),
  );
  ck(
    "the employer search names its columns rather than selecting *",
    search.includes('"id, name, country, website"') && !search.includes('select("*")'),
  );
  ck(
    "employers.status is used as a FILTER and never returned",
    search.includes('.eq("status", "active")') && !/status:\s*/.test(search),
  );
  ck("it reads only the employers table", !/from\("(?!employers")/.test(search));
  ck(
    "it uses the caller's own client, so RLS still decides visibility",
    search.includes("context.supabase") && !search.includes("service_role"),
  );
}

/* ================================================================== */
/* F + G. Nothing is selected, and selecting is not sending            */
/* ================================================================== */

const SEARCH_RESULT = {
  suggestions: [
    { employer: NORDVAKT, reason: "exact_name" as const },
    { employer: NORDVAKT_SVERIGE, reason: "same_country" as const },
  ],
  truncated: false,
  loading: false,
  failed: false,
};

const picker = (over: Partial<React.ComponentProps<typeof EmployerConfirmationPicker>> = {}) =>
  html(
    <EmployerConfirmationPicker
      state={SEARCH_RESULT}
      onSearch={() => {}}
      onConfirm={async () => {}}
      busy={false}
      {...over}
    />,
  );

group("F/G. No auto-selection, and an explicit confirmation before anything is sent");
{
  const m = picker();

  ck("the list is rendered", m.includes(NORDVAKT.name) && m.includes(NORDVAKT_SVERIGE.name));
  ck("nothing is marked as selected", !/aria-(checked|selected)="true"/.test(m));
  ck("there is no <select> with a defaulted option", !m.includes("<select"));
  ck(
    "the confirmation step is NOT on screen before a choice is made",
    !m.includes(sv("ver.employer.confirmTitle")) && !m.includes(sv("ver.employer.confirmAction")),
  );

  const src = code(read("src/components/security-passport/live/EmployerConfirmationPicker.tsx"));
  ck(
    "the chosen organisation starts as null rather than as the first row",
    src.includes("useState<EmployerCandidate | null>(null)") &&
      !/useState[^\n]*suggestions\[0\]/.test(src),
  );
  ck(
    "onConfirm is called from exactly one place in the component",
    (src.match(/onConfirm\(/g) ?? []).length === 1,
  );
  ck(
    "and that place is guarded by a chosen organisation",
    src.indexOf("onConfirm(chosen.id)") > src.indexOf("if (chosen)"),
  );
  ck(
    "choosing a row only sets state -- it never submits",
    src.includes("onClick={() => setChosen(s.employer)}"),
  );

  ck(
    "the picker reaches the confirmation step with the organisation that was clicked",
    src.includes("<EmployerConfirmationStep") && src.includes("employer={chosen}"),
  );
}

group("G. The confirmation step itself, rendered");
{
  // Rendered for real, not scanned. This is the last thing a candidate reads
  // before a live organisation is asked about their employment, which is why
  // it is its own component: a surface that important has to be assertable on
  // its own terms.
  let confirmed = 0;
  const step = html(
    <EmployerConfirmationStep
      employer={NORDVAKT}
      busy={false}
      onConfirm={() => {
        confirmed += 1;
      }}
      onChange={() => {}}
    />,
  );

  ck("it names the organisation", step.includes(NORDVAKT.name));
  ck("in Swedish, it names the country in words rather than as a code", step.includes("Sverige"));
  ck("and never as the bare ISO code", !/>\s*SE\s*</.test(step));
  ck(
    "it shows the website, so two same-named companies are distinguishable",
    step.includes("nordvakt.example"),
  );
  ck("it says what the organisation will see", step.includes(sv("ver.employer.confirmBody")));
  ck(
    "it offers a control that says it is SENDING",
    step.includes(sv("ver.employer.confirmAction")),
  );
  ck("and a way back to the list without sending", step.includes(sv("ver.employer.confirmChange")));
  ck("rendering it sends nothing by itself", confirmed === 0);

  // Two same-named organisations in two countries, side by side. If the step
  // rendered identically for both, the confirmation would not be one.
  const seStep = html(
    <EmployerConfirmationStep
      employer={NORDVAKT}
      busy={false}
      onConfirm={() => {}}
      onChange={() => {}}
    />,
  );
  const aeStep = html(
    <EmployerConfirmationStep
      employer={org("e-ae", "Nordvakt AB (fiktiv)", "AE")}
      busy={false}
      onConfirm={() => {}}
      onChange={() => {}}
    />,
  );
  ck(
    "two organisations with the same name in different countries confirm differently",
    seStep !== aeStep,
  );

  // An organisation that stated no country says so, rather than borrowing the
  // employment's -- which would be the platform asserting a fact about a
  // company it does not hold.
  const unknown = html(
    <EmployerConfirmationStep
      employer={org("e-nc", "Namnlos Bevakning AB (fiktiv)", null)}
      busy={false}
      onConfirm={() => {}}
      onChange={() => {}}
    />,
  );
  ck(
    "an unstated country is said to be unstated",
    unknown.includes(sv("ver.employer.countryUnknown")),
  );
  ck("and is not filled in from the employment", !unknown.includes("Sverige"));

  const busyStep = html(
    <EmployerConfirmationStep employer={NORDVAKT} busy onConfirm={() => {}} onChange={() => {}} />,
  );
  ck("while a request is in flight the controls are disabled", busyStep.includes("disabled"));
  ck("and the control says so", busyStep.includes(sv("ver.submitting")));
}

/* ================================================================== */
/* Duplicate submission, from the interface's side                     */
/* ================================================================== */

group("I. A second press cannot open a second request");
{
  const m = picker({ busy: true });
  ck(
    "every control is disabled while a submission is in flight",
    !m.includes("<button") || m.includes("disabled"),
  );

  const src = code(read("src/components/security-passport/live/EmployerConfirmationPicker.tsx"));
  ck("the confirm control is disabled on busy", /disabled=\{busy\}/.test(src));
  ck("and the rows are too", (src.match(/disabled=\{busy\}/g) ?? []).length >= 3);
}

/* ================================================================== */
/* M. A failed search is not an empty search                           */
/* ================================================================== */

group("M. Search failure and no-results are different sentences");
{
  const failed = picker({
    state: { suggestions: [], truncated: false, loading: false, failed: true },
  });
  const empty = picker({
    state: { suggestions: [], truncated: false, loading: false, failed: false },
  });

  ck(
    "a refused search says the search is unavailable",
    failed.includes(sv("ver.employer.searchUnavailable")),
  );
  ck("and does NOT say no employer was found", !failed.includes(sv("ver.employer.noMatch")));
  ck("and offers a retry", failed.includes(sv("ver.employer.searchRetry")));
  ck(
    "an empty result says no matching employer was found",
    empty.includes(sv("ver.employer.noMatch")),
  );
  ck(
    "and does NOT claim the search was unavailable",
    !empty.includes(sv("ver.employer.searchUnavailable")),
  );
  ck(
    "the two sentences are actually different strings",
    sv("ver.employer.searchUnavailable") !== sv("ver.employer.noMatch") &&
      en("ver.employer.searchUnavailable") !== en("ver.employer.noMatch"),
  );

  const loading = picker({
    state: { suggestions: [], truncated: false, loading: true, failed: false },
  });
  ck(
    "a search still running says neither of them",
    loading.includes(sv("ver.employer.searching")) &&
      !loading.includes(sv("ver.employer.noMatch")) &&
      !loading.includes(sv("ver.employer.searchUnavailable")),
  );

  // The server function must not be able to reintroduce the swallow.
  const fns = read("src/lib/security-passport/verification.functions.ts");
  const search = fns.slice(
    fns.indexOf("export const searchAttestableEmployers"),
    fns.indexOf("export const listEmployerAttestations"),
  );
  ck(
    "the server function throws on a refused read rather than returning []",
    search.includes("SP_EMPLOYER_SEARCH_FAILED") && !/if \(error\) return \[\]/.test(search),
  );
  ck(
    "the old always-empty employer list is gone from the repository",
    !code(fns).includes("listAttestableEmployers"),
  );

  const trimmed = picker({ state: { ...SEARCH_RESULT, truncated: true } });
  ck(
    "a trimmed list says it was trimmed rather than posing as the whole answer",
    trimmed.includes(sv("ver.employer.moreMatches")),
  );
  ck("and an untrimmed one does not", !picker().includes(sv("ver.employer.moreMatches")));
  ck("the cap is a stated number, not a magic literal", MAX_SUGGESTIONS > 0);
}

/* ================================================================== */
/* E. "My employer is not on CQrityjob"                                */
/* ================================================================== */

group("E. The not-on-platform route, and the invitation it does not send");
{
  const m = picker();
  ck("the route is offered", m.includes(sv("ver.employer.notOnPlatform")));
  ck(
    "it is offered even when the search DID return organisations",
    SEARCH_RESULT.suggestions.length > 0 && m.includes(sv("ver.employer.notOnPlatform")),
  );

  const src = code(read("src/components/security-passport/live/EmployerConfirmationPicker.tsx"));
  ck(
    "opening it explains that confirmation needs the employer to have an account",
    src.includes('pt("ver.employer.notOnPlatformBody")'),
  );
  ck(
    "and states in as many words that CQrityjob does not invite or contact them",
    src.includes('pt("ver.employer.notOnPlatformNoInvite")'),
  );
  ck(
    "and points at the alternative that actually exists (document review)",
    src.includes('pt("ver.employer.notOnPlatformAlt")'),
  );

  // No fake invitation, in either language, and no machinery for one.
  for (const lang of ["sv", "en"] as const) {
    const body = [
      "ver.employer.notOnPlatformBody",
      "ver.employer.notOnPlatformNoInvite",
      "ver.employer.notOnPlatformAlt",
    ]
      .map((k) => passportT(k as PassportCopyKey, lang))
      .join(" ");
    ck(
      `${lang}: nothing claims an invitation was sent`,
      !/inbjudan (är )?skickad|invitation sent|we have (invited|contacted)|vi har (bjudit|kontaktat)/i.test(
        body,
      ),
    );
  }
  // The copy key that SAYS no invitation is sent naturally contains the word,
  // so it is removed before looking for machinery that would send one.
  const withoutCopyKeys = src.replace(/"ver\.employer\.[A-Za-z.]+"/g, '""');
  ck(
    "the picker contains no invitation or email machinery at all",
    !/invite|invitation|mailto:|sendEmail|inbjud|@\w+\.\w/i.test(withoutCopyKeys),
  );
  ck(
    "and the document-review path it points at is the one already on the panel",
    code(read("src/components/security-passport/live/VerificationPanel.tsx")).includes(
      'onSubmit("cqrityjob_review", null)',
    ),
  );
}

/* ================================================================== */
/* H + I + J + K + L. The database, where the boundaries actually are  */
/* ================================================================== */

group("H/I/J/K/L. The refusals, asserted against the migration and not the page");
{
  const mig = read("supabase/migrations/20261019090000_sp_employer_attestation_eligible_org.sql");

  ck(
    "H. an employer attestation to a non-active organisation is refused",
    mig.includes("SP_EMPLOYER_NOT_ELIGIBLE") && mig.includes("_employer_status <> 'active'"),
  );
  ck(
    "H. and a null employer id on an employer attestation is refused by name",
    mig.includes("SP_EMPLOYER_REQUIRED"),
  );
  ck(
    "H. and an id that is no organisation at all is refused by name",
    mig.includes("SP_EMPLOYER_NOT_FOUND"),
  );
  ck(
    "H. the eligibility test reads employers.status and nothing else about them",
    /SELECT status INTO _employer_status FROM public\.employers WHERE id = _employer_id/.test(mig),
  );
  ck(
    "H. the CQrityjob review path is untouched by the new check",
    mig.includes("IF _kind = 'employer_attestation' THEN"),
  );

  ck(
    "I. the one-open-request-per-entry refusal survived the rewrite",
    mig.includes("SP_REQUEST_ALREADY_OPEN"),
  );
  ck(
    "I. including the unique-violation translation that makes it atomic",
    mig.includes("EXCEPTION WHEN unique_violation THEN"),
  );
  ck(
    "K. a submission for somebody else's entry is still refused",
    mig.includes("SP_NOT_HOLDER") && mig.includes("_holder <> auth.uid()"),
  );
  ck(
    "the employment-only rule for employer attestation survived",
    mig.includes("SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY"),
  );
  ck(
    "the function is still SECURITY DEFINER with a pinned search_path",
    /SECURITY DEFINER SET search_path = public/.test(mig),
  );
  ck("anon is still revoked by name", /FROM PUBLIC, anon/.test(mig));
  ck(
    "the migration asserts its own end state rather than claiming it",
    mig.includes("SP_POSTFLIGHT_ELIGIBILITY_MISSING") && mig.includes("SP_POSTFLIGHT_GUARD_LOST"),
  );

  // J and L are properties this PR must not have touched. Asserted against the
  // migrations that own them, so a future edit that weakens either fails here.
  const hardening = read("supabase/migrations/20261013090000_sp_trust_boundary_hardening.sql");
  ck(
    "J. self-verification is still refused at the only path to VERIFIED",
    hardening.includes("SP_SELF_VERIFICATION_FORBIDDEN"),
  );
  ck(
    "J. and this PR's migration does not touch sp_verifier_decide at all",
    !sql(mig).includes("sp_verifier_decide"),
  );
  ck("J. nor the row-level self-decision constraint", !sql(mig).includes("sp_vr_no_self_decision"));

  const queue = read("supabase/migrations/20261017090000_sp_employer_attestation_queue_task.sql");
  ck(
    "L. the employer queue still proves the caller represents that employer",
    queue.includes("SP_NOT_EMPLOYER_REPRESENTATIVE"),
  );
  ck(
    "L. and this PR's migration does not touch the queue",
    !sql(mig).includes("sp_employer_attestation_queue"),
  );

  ck(
    "the migration replaces exactly one function and creates nothing else",
    (sql(mig).match(/CREATE OR REPLACE FUNCTION/g) ?? []).length === 1 &&
      !/\bCREATE (TABLE|VIEW|POLICY|INDEX)\b/.test(sql(mig)) &&
      !/\bALTER TABLE\b/.test(sql(mig)) &&
      !/\bDROP\b/.test(sql(mig)),
  );

  // The picker cannot be the place eligibility is enforced.
  const fns = read("src/lib/security-passport/verification.functions.ts");
  ck(
    "the query filters on active as well, so an ineligible org is never offered",
    fns.includes('.eq("status", "active")'),
  );
  ck(
    "H. and the submit boundary refuses an employer attestation with no employer",
    code(fns).includes('message: "SP_EMPLOYER_REQUIRED"'),
  );
  ck(
    "H. but does NOT try to decide eligibility in TypeScript, where it would race",
    !/status.*===.*"active"/.test(
      code(fns).slice(
        code(fns).indexOf("const submitInput"),
        code(fns).indexOf("export const withdrawVerificationRequest"),
      ),
    ),
  );
}

/* ================================================================== */
/* N. Swedish and English                                              */
/* ================================================================== */

group("N. SV / EN");
{
  const keys: PassportCopyKey[] = [
    "ver.employer.searchLabel",
    "ver.employer.searchPlaceholder",
    "ver.employer.searchHelp",
    "ver.employer.searching",
    "ver.employer.searchUnavailable",
    "ver.employer.searchRetry",
    "ver.employer.noMatch",
    "ver.employer.noMatchHelp",
    "ver.employer.reason.linked",
    "ver.employer.reason.exact_name",
    "ver.employer.reason.same_country",
    "ver.employer.reason.search",
    "ver.employer.moreMatches",
    "ver.employer.countryUnknown",
    "ver.employer.confirmTitle",
    "ver.employer.confirmBody",
    "ver.employer.confirmAction",
    "ver.employer.confirmChange",
    "ver.employer.notOnPlatform",
    "ver.employer.notOnPlatformTitle",
    "ver.employer.notOnPlatformBody",
    "ver.employer.notOnPlatformNoInvite",
    "ver.employer.notOnPlatformAlt",
    "ver.employer.notOnPlatformClose",
  ];
  for (const k of keys) {
    ck(
      `${k} is present and different in both languages`,
      sv(k).length > 0 && en(k).length > 0 && sv(k) !== en(k),
    );
  }

  // No user-facing Passport text outside the copy module.
  // Scanned from the component body onwards: the props interface above it
  // contains TypeScript (`=> Promise<void>`) that any "text between angle
  // brackets" rule reads as a sentence.
  const src = read("src/components/security-passport/live/EmployerConfirmationPicker.tsx");
  const body = code(src).slice(code(src).indexOf("export function EmployerConfirmationPicker"));
  const jsxText = body.match(/>\s*[A-Za-zÅÄÖåäö][^<>{}]{3,}</g) ?? [];
  ck(`the picker hard-codes no sentence of its own (${jsxText.join(" | ")})`, jsxText.length === 0);
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("passport-employer-matching-check: all assertions passed");
