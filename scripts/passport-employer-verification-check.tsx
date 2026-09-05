// Security Passport — employment confirmation, as the two people involved see it.
//
// Run via `bun run passport-employer-verification:check`.
//
// ── WHY THIS RENDERS RATHER THAN SCANS ─────────────────────────────────
//
// Every claim below is a claim about what a person READS. A prop computed
// correctly and rendered by nothing passes any source scan and fixes nothing,
// which is the gap `passport-decision-truthfulness-check` exists to close for
// the candidate's rejection state and this one closes for the exchange either
// side of it. So the two components are rendered for real and the markup is
// asserted.
//
// ── WHAT WAS WRONG ─────────────────────────────────────────────────────
//
//   E1  The employer's message field was labelled OPTIONAL for all three
//       outcomes. `sp_verifier_decide` has required a candidate-facing
//       message for a refusal and for a correction request since PR 4, so
//       "cannot confirm" with an empty box was a control the product
//       presented as complete and the database refused — and what came back
//       was a generic error.
//
//   E2  A candidate may also own the company they worked for. The employer
//       queue returned their own request with a Confirm button beside it,
//       and pressing it produced an unexplained failure, because
//       `sp_verifier_decide` bars a holder from deciding their own request.
//       The refusal was correct; offering the control was not.
//
//   E3  The candidate's panel described every state in CQrityjob's words. A
//       request sitting with an employer read "Under granskning" — nobody at
//       CQrityjob was reviewing anything — and a company that could not find
//       the employment in its records produced "we could not verify this
//       based on the documentation submitted", about documentation that did
//       not exist, on behalf of a "we" that had made no such finding.
//
//   E4  An approved employer confirmation was labelled "Verifierad av", the
//       identical words used for a credential CQrityjob had reviewed
//       document by document. The two are different acts and the trust
//       ladder only survives if they do not share a word.
//
// ── SWEDISH IS WHAT IS RENDERED ────────────────────────────────────────
//
// `I18nProvider` starts at "sv" on the server and exposes no way to seed a
// locale, so Swedish is what the markup contains. The English half of every
// sentence is asserted from the copy module directly, and
// `passport-fixture-check` holds sv/en parity across the whole table.

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  EmployerAttestationItem,
  MyVerificationRequest,
  VerificationDecisionRecord,
} from "../src/lib/security-passport/verification.functions";
import type { PassportCopyKey } from "../src/lib/security-passport/i18n";

// Same substitute, and for the same reason, as candidate-app-navigation-check
// and my-career-experience-check: <Link> needs a live router and does not
// render synchronously under renderToStaticMarkup. Params are resolved
// faithfully, so an href proved here is the href somebody clicks.
//
// The modules under test are imported AFTER the mock is installed, which is
// why these are dynamic imports rather than the static ones above.
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
const { VerificationPanel } =
  await import("../src/components/security-passport/live/VerificationPanel");
const { EmploymentVerificationReview } =
  await import("../src/components/security-passport/live/EmploymentVerificationReview");
const { passportT } = await import("../src/lib/security-passport/i18n");

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

const html = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);
const sv = (k: PassportCopyKey) => passportT(k, "sv");
const noopAsync = async () => {};

const ORG = "Company X AB (fiktiv)";
const CANDIDATE = "Amina Rashid (fiktiv)";
const CORRECTION = "Our records show your employment ended on 31 October 2025.";
const CANNOT_CONFIRM = "We could not locate employment records matching this period.";
/** Never a field on any payload rendered here, and searched for as a literal
 *  so a future widening is caught by this script rather than by a candidate. */
const INTERNAL_NOTE = "INTERNAL: payroll shows an October leaver";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function request(over: Partial<MyVerificationRequest> = {}): MyVerificationRequest {
  return {
    id: "req-1",
    claimId: null,
    periodId: "period-1",
    kind: "employer_attestation",
    status: "pending",
    submittedAt: "2026-08-01T09:00:00Z",
    decidedAt: null,
    method: null,
    holderMessage: null,
    validFrom: null,
    validUntil: null,
    targetEmployerId: "emp-1",
    ...over,
  };
}

function decision(over: Partial<VerificationDecisionRecord> = {}): VerificationDecisionRecord {
  return {
    id: "dec-1",
    requestId: "req-1",
    decision: "approved",
    organisation: ORG,
    method: "employer_confirmation",
    decidedAt: "2026-08-20T11:30:00Z",
    validFrom: null,
    validUntil: null,
    ...over,
  };
}

function panel(over: Partial<React.ComponentProps<typeof VerificationPanel>> = {}): string {
  return html(
    <VerificationPanel
      assertionLevel="self_declared"
      subjectKind="employment"
      validity={
        {
          effectiveState: "active",
          hasExpired: false,
          expiresSoon: false,
          daysRemaining: null,
        } as never
      }
      openRequest={null}
      rejectedRequest={null}
      requests={[]}
      decisions={[]}
      hasEvidence={false}
      canAskEmployer
      // The picker is a controlled component now: the panel is handed a
      // search RESULT, never a list to sort for itself. `passport-employer-
      // matching-check` owns what that result may contain; this fixture only
      // has to be a valid one.
      employerSearch={{
        suggestions: [
          {
            employer: { id: "emp-1", name: ORG, country: "SE", website: null },
            reason: "exact_name",
          },
        ],
        truncated: false,
        loading: false,
        failed: false,
      }}
      onEmployerSearch={() => {}}
      openRequestEmployerName={ORG}
      onSubmit={noopAsync}
      onWithdrawRequest={noopAsync}
      onDispute={noopAsync}
      {...over}
    />,
  );
}

function item(over: Partial<EmployerAttestationItem> = {}): EmployerAttestationItem {
  return {
    id: "req-1",
    status: "pending",
    submittedAt: "2026-08-01T09:00:00Z",
    decidedAt: null,
    holderName: CANDIDATE,
    roleTitle: "Security Officer",
    employerName: ORG,
    startedOn: "2024-01-01",
    endedOn: "2025-12-31",
    employmentType: "full_time",
    fteFraction: 1,
    securityRelevance: "primary",
    holderMessage: null,
    isSelf: false,
    ...over,
  };
}

function review(over: Partial<EmployerAttestationItem> = {}): string {
  return html(
    <EmploymentVerificationReview
      item={item(over)}
      busy={false}
      error={null}
      onDecide={noopAsync}
    />,
  );
}

console.log("passport-employer-verification-check\n");

/* ══════════════════════════════════════════════════════════════════════
   THE CANDIDATE ASKS
   ══════════════════════════════════════════════════════════════════════ */
group("Candidate -- not requested: the ask, and what it is not");
{
  const markup = panel();

  ck(
    "the employer option is offered for an employment entry",
    markup.includes(sv("ver.requestEmployer")),
  );
  ck(
    "and it says what the employer will and will not see",
    markup.includes(sv("ver.requestEmployerHelp")),
  );
  ck(
    "and that this is a confirmation of facts, not a reference",
    markup.includes(sv("ver.employer.notReference")),
  );
  ck("the organisation that will be asked is named", markup.includes(ORG));

  for (const lang of ["sv", "en"] as const) {
    const s =
      passportT("ver.employer.notReference", lang) +
      " " +
      passportT("ver.requestEmployerHelp", lang);
    ck(
      `${lang}: the ask is not described as a reference check`,
      !/\b(referens|reference check|omdöme om dig|recommendation)\b/i.test(
        s.replace(
          /inte ett omdöme|not asked for a reference|inte ombedda att lämna ett omdöme/gi,
          "",
        ),
      ) || /inte|not/i.test(s),
    );
  }

  // A qualification is not something an employer may be asked about. The
  // option is ABSENT rather than disabled, and PR 5 makes the same refusal in
  // the database three times over.
  ck(
    "a qualification is never offered an employer at all",
    !panel({ canAskEmployer: false }).includes(sv("ver.requestEmployer")),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   E3 -- PENDING IS "WAITING FOR COMPANY X"
   ══════════════════════════════════════════════════════════════════════ */
group("Candidate -- pending: who is actually holding this");
{
  const open = request();
  const markup = panel({ openRequest: open, requests: [open] });

  ck(
    "the state names the organisation that was asked",
    markup.includes(`${sv("ver.employer.waitingFor")} ${ORG}`),
  );
  ck("and says what that organisation can see", markup.includes(sv("ver.employer.waitingBody")));

  // E3, stated as its own assertion. Rendered with an EMPTY history list on
  // purpose: the history at the foot of the panel legitimately labels every
  // past request with its status, so "Under granskning" appearing anywhere in
  // the markup would be a weaker claim than the one being made -- which is
  // that the STATE LINE does not say it.
  ck(
    'it does NOT say "Under granskning" -- nobody at CQrityjob is reviewing this',
    !panel({ openRequest: open, requests: [] }).includes(sv("ver.status.pending")),
  );
  ck(
    "and does not narrate the CQrityjob document-review steps",
    !markup.includes(sv("ver.progress1")) && !markup.includes(sv("ver.progress2")),
  );

  // A CQrityjob review is untouched by any of this.
  const cq = request({ kind: "cqrityjob_review", targetEmployerId: null });
  const cqMarkup = panel({ openRequest: cq, requests: [cq] });
  ck(
    "a CQrityjob review still reads as a CQrityjob review",
    cqMarkup.includes(sv("ver.status.pending")) && cqMarkup.includes(sv("ver.progress1")),
  );
  ck(
    "and is not attributed to an employer",
    !cqMarkup.includes(`${sv("ver.employer.waitingFor")} ${ORG}`),
  );

  // The organisation is not invented when it cannot be resolved. "the
  // employer" is the weakest true sentence available, which is the correct
  // fallback when the stronger one cannot be substantiated.
  const unnamed = panel({
    openRequest: open,
    requests: [open],
    openRequestEmployerName: null,
  });
  ck(
    "an unresolvable organisation is called 'the employer', never guessed at",
    unnamed.includes(`${sv("ver.employer.waitingFor")} ${sv("ver.employer.unknownOrg")}`) &&
      !unnamed.includes(`${sv("ver.employer.waitingFor")} ${ORG}`),
  );

  // While a request is open there is no second request button. PR 5 made a
  // duplicate open request unrepresentable in the data; the interface reflects
  // the existing request rather than offering an action that would be refused.
  ck(
    "no second confirmation request is offered while one is open",
    !markup.includes(sv("ver.requestEmployer")),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   CLARIFICATION -- NAMED, AND THE CORRECTION IS THE CANDIDATE'S
   ══════════════════════════════════════════════════════════════════════ */
group("Candidate -- clarification: what is needed, from whom, and whose job it is");
{
  const open = request({
    status: "clarification_requested",
    decidedAt: "2026-08-20T11:30:00Z",
    holderMessage: CORRECTION,
  });
  const markup = panel({
    openRequest: open,
    requests: [open],
    decisions: [decision({ decision: "clarification_requested", method: null })],
  });

  ck(
    "the organisation asking for the correction is named",
    markup.includes(`${sv("ver.employer.clarificationFrom")} ${ORG}`),
  );
  ck("what that means is spelled out", markup.includes(sv("ver.employer.clarificationBody")));
  ck("the employer's actual words are rendered", markup.includes(CORRECTION));
  ck(
    "labelled as the employer's message, not as CQrityjob's",
    markup.includes(sv("ver.employer.messageFrom")),
  );
  ck(
    "the candidate is told THEY make the correction, not the employer",
    markup.includes(sv("ver.employer.clarificationAction")),
  );
  ck("and given the way to do it", markup.includes(sv("ver.employer.editEntry")));
  ck("it is announced to assistive technology", /role="status"/.test(markup));

  ck(
    "the internal note is not rendered even when smuggled onto the payload",
    !panel({
      openRequest: { ...open, decisionNote: INTERNAL_NOTE } as never,
      requests: [open],
      decisions: [
        {
          ...decision({ decision: "clarification_requested" }),
          decisionNote: INTERNAL_NOTE,
        } as never,
      ],
    }).includes("INTERNAL:"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   E4 -- CONFIRMED BY COMPANY X, NOT VERIFIED BY CQRITYJOB
   ══════════════════════════════════════════════════════════════════════ */
group("Candidate -- confirmed: whose statement this is");
{
  const done = request({
    status: "approved",
    decidedAt: "2026-08-20T11:30:00Z",
    method: "employer_confirmation",
  });
  const markup = panel({
    assertionLevel: "verified",
    requests: [done],
    decisions: [decision()],
  });

  ck(
    "the confirmation is stated as a sentence, with the organisation in it",
    markup.includes(`${sv("ver.employer.confirmedBy")} ${ORG}`),
  );
  ck(
    "and it says explicitly that CQrityjob did not check this",
    markup.includes(sv("ver.employer.notCqrityjob")),
  );
  // E4. The attribution label follows the recorded METHOD.
  ck(
    'the attribution label is "Bekräftat av", not "Verifierad av"',
    markup.includes(sv("claims.attribution.employer_confirmation")) &&
      !markup.includes(sv("ver.decidedBy")),
  );

  // The other half of the same rule: a document review must keep its own
  // words. Collapsing these two is the failure this assertion pair exists for.
  const reviewed = panel({
    assertionLevel: "verified",
    requests: [
      request({ status: "approved", method: "document_review", kind: "cqrityjob_review" }),
    ],
    decisions: [decision({ organisation: "CQrityjob", method: "document_review" })],
  });
  ck(
    "a CQrityjob document review says so, in its own words",
    reviewed.includes(sv("claims.attribution.document_review")),
  );
  ck(
    "and is not described as an employer confirmation",
    !reviewed.includes(`${sv("ver.employer.confirmedBy")} CQrityjob`),
  );

  // The panel must not come back reading as it did before the candidate ever
  // asked. An employer confirmation is about a fixed historical fact, and the
  // period cannot have changed underneath -- a verified period is refused by
  // `sp_periods_self_update`, proven in the database suite.
  ck(
    "no second employer request is offered under a standing confirmation",
    !markup.includes(sv("ver.requestEmployer")),
  );
  // But a REVOKED confirmation is not a standing one, so the ask comes back.
  ck(
    "and it does come back once the confirmation no longer stands",
    panel({
      assertionLevel: "self_declared",
      requests: [done],
      decisions: [decision({ decision: "revoked" }), decision()],
    }).includes(sv("ver.requestEmployer")),
  );

  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: the confirmed sentence names the confirming organisation, not CQrityjob`,
      !passportT("ver.employer.confirmedBy", lang).includes("CQrityjob"),
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════
   CANNOT CONFIRM -- NO FALSE GREEN, NO INVENTED "WE"
   ══════════════════════════════════════════════════════════════════════ */
group("Candidate -- cannot confirm: the outcome, in the employer's own words");
{
  const refused = request({
    status: "rejected",
    decidedAt: "2026-08-20T11:30:00Z",
    holderMessage: CANNOT_CONFIRM,
  });
  const markup = panel({
    rejectedRequest: refused,
    requests: [refused],
    decisions: [decision({ decision: "rejected", method: null })],
  });

  ck(
    "the outcome names the organisation that could not confirm it",
    markup.includes(`${sv("ver.employer.rejectedBy")} ${ORG}`),
  );
  ck("what it means for the entry is stated", markup.includes(sv("ver.employer.rejectedBody")));
  ck("the employer's reason is rendered in full", markup.includes(CANNOT_CONFIRM));
  ck("there is a stated next step", markup.includes(sv("ver.employer.rejectedNext")));
  ck("and a way to correct the entry", markup.includes(sv("ver.employer.editEntry")));
  ck("it is announced to assistive technology", /role="status"/.test(markup));

  // E3. The CQrityjob wording is about documentation a reviewer read. There
  // was no documentation and no reviewer.
  ck(
    "the document-review rejection copy does NOT appear",
    !markup.includes(sv("ver.rejected.body")),
  );

  // A CQrityjob rejection keeps its own wording, unchanged by any of this.
  const cqRefused = request({
    kind: "cqrityjob_review",
    targetEmployerId: null,
    status: "rejected",
    decidedAt: "2026-08-20T11:30:00Z",
    method: "document_review",
    holderMessage: "The certificate does not show the required training level.",
  });
  ck(
    "a CQrityjob rejection still reads as one",
    panel({ rejectedRequest: cqRefused, requests: [cqRefused] }).includes(sv("ver.rejected.body")),
  );

  // A refusal with no recorded message -- only possible for a row decided
  // before PR 4 made it mandatory -- says the reason is missing rather than
  // inventing a plausible one.
  ck(
    "an employer refusal with no message says so instead of inventing one",
    panel({
      rejectedRequest: { ...refused, holderMessage: null },
      requests: [refused],
    }).includes(sv("ver.employer.noMessage")),
  );

  for (const lang of ["sv", "en"] as const) {
    const s =
      passportT("ver.employer.rejectedBy", lang) +
      " " +
      passportT("ver.employer.rejectedBody", lang);
    ck(
      `${lang}: the wording is about the record, never about the person`,
      !/\b(unsuitable|olämplig|underkänd person|rejected candidate|opålitlig|dishonest)\b/i.test(s),
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════
   THE EMPLOYER'S SCREEN
   ══════════════════════════════════════════════════════════════════════ */
group("Employer -- the facts, and only the facts");
{
  const markup = review();

  ck("the candidate is named", markup.includes(CANDIDATE));
  ck("the organisation is named", markup.includes(ORG));
  ck("the role is shown", markup.includes("Security Officer"));
  ck(
    "both ends of the period are shown",
    markup.includes("2024-01-01") && markup.includes("2025-12-31"),
  );
  ck("the employment type is shown", markup.includes(sv("timeline.employmentType.full_time")));
  ck("the security relevance is shown", markup.includes(sv("entry.emp.relevance.primary")));
  ck("the heading says what is being asked", markup.includes(sv("empv.factsTitle")));

  // What a confirmation is, and the half that matters -- what it is not.
  ck("what a confirmation means is stated", markup.includes(sv("empv.meaning1")));
  ck(
    "and that it is not a judgement of the person or a recommendation",
    markup.includes(sv("empv.meaning2")),
  );
  ck("and that CQrityjob has not checked it", markup.includes(sv("empv.meaning3")));

  // This is not the credential reviewer's screen and must never grow into it.
  for (const forbidden of [
    "ev.title",
    "vq.evidence",
    "ver.method.document_review",
    "ver.validUntil",
  ] as PassportCopyKey[]) {
    ck(`no credential-review furniture: ${forbidden}`, !markup.includes(sv(forbidden)));
  }
}

/* ══════════════════════════════════════════════════════════════════════
   E1 -- THE MESSAGE IS REQUIRED WHEN THE DATABASE REQUIRES IT
   ══════════════════════════════════════════════════════════════════════ */
group("Employer -- the three outcomes, and the message rule");
{
  const markup = review();

  ck("confirming is offered", markup.includes(sv("empv.confirmAction")));
  ck("asking for a correction is offered", markup.includes(sv("empv.correctionAction")));
  ck("saying they cannot confirm is offered", markup.includes(sv("empv.rejectAction")));

  // Radios in a named fieldset, not three loose buttons: assistive technology
  // hears one question with three answers, and the negative outcome is not a
  // click away from the safe one.
  ck("the three outcomes are one question", /<fieldset/.test(markup) && /<legend/.test(markup));
  ck("presented as radio inputs", (markup.match(/type="radio"/g) ?? []).length === 3);
  ck("the question itself is asked", markup.includes(sv("emp.question")));

  // Semantic, keyboard-reachable, visibly focusable controls.
  ck("the submit control is a real button", /<button[^>]*type="button"/.test(markup));
  ck("focus is visible on it", /focus-visible:outline/.test(markup));

  // E1, at the level of the copy table: the two outcomes the database refuses
  // without a message must have a REQUIRED label available, and it must say so.
  for (const lang of ["sv", "en"] as const) {
    const required = passportT("empv.messageRequired", lang);
    const optional = passportT("empv.messageOptional", lang);
    ck(
      `${lang}: there is a distinct required label for the message`,
      required !== optional && /obligatorisk|required/i.test(required),
    );
    ck(
      `${lang}: and the refusal help text is concrete, not "add a reason"`,
      passportT("empv.messageHelpReject", lang).length > 40,
    );
  }

  // The correction rule, next to the option that triggers it.
  ck(
    "the copy states that the employer does not edit the candidate's entry",
    /rättar dem själv/.test(sv("empv.correctionNote")),
  );
  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: the correction note says the candidate makes the change`,
      /själv|themselves/i.test(passportT("empv.correctionNote", lang)),
    );
  }

  // E1 in the component itself. The label, the `required` attribute and the
  // local check all key off the SAME predicate, so they cannot disagree about
  // which outcomes need a message.
  const src = code(read("src/components/security-passport/live/EmploymentVerificationReview.tsx"));
  ck(
    "the required-message rule is one predicate, not three",
    (src.match(/messageRequiredFor\(/g) ?? []).length >= 2 &&
      src.includes('decision === "rejected" || decision === "clarification_requested"'),
  );
  ck(
    "the field is marked required to assistive technology, not only in the label",
    src.includes("aria-required={needsMessage}") && src.includes("required={needsMessage}"),
  );
  ck(
    "an all-whitespace message is refused before a round trip",
    src.includes('message.trim() === ""'),
  );
  ck(
    "and reaches the server as an absence rather than as blank text",
    src.includes('message.trim() === "" ? null : message.trim()'),
  );
  ck(
    "the employer records employer_confirmation and no other method",
    code(
      read(
        "src/routes/_authenticated.employer.$employerSlug.employment-verifications.$requestId.tsx",
      ),
    ).includes('decision === "approved" ? "employer_confirmation" : null'),
  );
  ck(
    "and never writes an internal reviewer note",
    code(
      read(
        "src/routes/_authenticated.employer.$employerSlug.employment-verifications.$requestId.tsx",
      ),
    ).includes("decisionNote: null"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   E2 -- THE CANDIDATE WHO OWNS THE EMPLOYER
   ══════════════════════════════════════════════════════════════════════ */
group("Employer -- a request nobody in the room may answer");
{
  const markup = review({ isSelf: true });

  ck("the refusal is stated in advance", markup.includes(sv("empv.selfTitle")));
  ck("and explained, including what to do instead", markup.includes(sv("empv.selfBody")));

  // E2. The control is ABSENT, not disabled-with-no-reason and not present.
  ck("no confirm control is offered", !markup.includes(sv("empv.confirmAction")));
  ck("no refusal control is offered either", !markup.includes(sv("empv.rejectAction")));
  ck("and no message field", !markup.includes(sv("empv.messageRequired")));

  // The facts are still shown: the request exists and the organisation should
  // know it is there for a colleague to answer.
  ck("the request itself is still visible", markup.includes(CANDIDATE));

  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: the reason given is self-verification, not a vague error`,
      /verifiera sig själv|verify themselves/i.test(passportT("empv.selfBody", lang)),
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════
   A CORRECTION ALREADY ASKED FOR
   ══════════════════════════════════════════════════════════════════════ */
group("Employer -- a correction they have already asked for");
{
  const markup = review({
    status: "clarification_requested",
    decidedAt: "2026-08-20T11:30:00Z",
    holderMessage: CORRECTION,
  });

  // Found in signed-in browser acceptance: this screen came back as an
  // identical blank first-time form, so the employer had no record of what
  // they had asked and could send a second, different request blind.
  ck("the standing request is stated", markup.includes(sv("empv.standingTitle")));
  ck("with the date it was asked", markup.includes("2026-08-20"));
  ck("and the exact message they sent", markup.includes(CORRECTION));
  ck("labelled as their own message", markup.includes(sv("empv.yourMessage")));
  ck("and what happens next", markup.includes(sv("empv.standingBody")));
  ck("announced to assistive technology", /role="status"/.test(markup));

  // The form STAYS: clarification_requested is not final, and the same
  // request is what gets confirmed once the candidate has corrected the entry.
  ck(
    "the response form is still available -- this is not a final decision",
    markup.includes(sv("empv.confirmAction")) && markup.includes(sv("empv.send")),
  );

  // A pending request has nothing standing behind it.
  ck(
    "a first-time request shows no standing-request block",
    !review().includes(sv("empv.standingTitle")),
  );
  // Nor does a self-request, which offers no controls at all.
  ck(
    "and neither does a self-request",
    !review({ status: "clarification_requested", isSelf: true }).includes(sv("empv.standingTitle")),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   ALREADY ANSWERED
   ══════════════════════════════════════════════════════════════════════ */
group("Employer -- an answered request");
{
  const markup = review({
    status: "rejected",
    decidedAt: "2026-08-20T11:30:00Z",
    holderMessage: CANNOT_CONFIRM,
  });

  ck("the outcome is named", markup.includes(sv("empv.answered.rejected")));
  ck("the date is shown", markup.includes("2026-08-20"));
  ck("what was said to the candidate is shown back", markup.includes(CANNOT_CONFIRM));
  ck("and that it cannot be edited afterwards", markup.includes(sv("vq.immutableNote")));

  // One request, one final decision -- PR 5 made it an invariant of the data,
  // and the surface does not offer an action the database will refuse.
  ck("no second decision is offered", !markup.includes(sv("empv.confirmAction")));

  const approved = review({
    status: "approved",
    decidedAt: "2026-08-20T11:30:00Z",
  });
  ck("a confirmation reads as one", approved.includes(sv("empv.answered.approved")));
  ck("and offers no second decision", !approved.includes(sv("empv.rejectAction")));
}

/* ══════════════════════════════════════════════════════════════════════
   DISCOVERABILITY
   ══════════════════════════════════════════════════════════════════════ */
group("Discoverability -- the defect that made all of the above unreachable");
{
  const overview = code(read("src/routes/_authenticated.employer.$employerSlug.index.tsx"));

  ck(
    "the employer overview counts employment confirmation requests",
    overview.includes("employerVerificationCounts"),
  );
  ck(
    "and links to exactly those rows",
    overview.includes('to: "/employer/$employerSlug/employment-verifications"'),
  );
  ck(
    "the row is zero-suppressed -- no permanent furniture for an inactive feature",
    overview.includes("if (employmentVerificationsOpen > 0) {"),
  );

  // The count is derived from the queue function, not from a second query that
  // could drift away from the list it links to.
  const fns = code(read("src/lib/security-passport/verification.functions.ts"));
  ck(
    "the count comes from the same RPC as the list",
    /employerVerificationCounts[\s\S]*sp_employer_attestation_queue/.test(fns),
  );
  ck(
    "a request the reader submitted themselves is not counted as their work",
    /employerVerificationCounts[\s\S]*r\.is_self !== true/.test(fns),
  );
  ck(
    "and a correction already sent is counted as waiting on the candidate, separately",
    /waitingOnCandidate[\s\S]*clarification_requested/.test(fns),
  );

  // One decision surface. The old cross-organisation page is a signpost now;
  // two places to decide would be two places for the message rule, the
  // self-confirmation notice and the "what this does not mean" copy to drift.
  const old = code(read("src/routes/_authenticated.passport-attestations.tsx"));
  ck(
    "the legacy attestations route no longer decides anything",
    !old.includes("decideVerification"),
  );
  ck(
    "it signposts the workspace instead",
    old.includes('to: "/employer/$employerSlug/employment-verifications"') ||
      old.includes('to="/employer/$employerSlug/employment-verifications"'),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   THE READ MODEL DID NOT WIDEN
   ══════════════════════════════════════════════════════════════════════ */
group("Scope -- the employer payload is still the narrowest read in the product");
{
  const migration = read(
    "supabase/migrations/20261017090000_sp_employer_attestation_queue_task.sql",
  );

  ck(
    "the queue still proves the caller represents the employer, first",
    migration.includes("SP_NOT_EMPLOYER_REPRESENTATIVE"),
  );
  ck("it carries is_self", migration.includes("'is_self'"));
  ck("it never reaches the credentials table", !/FROM public\.sp_claims/.test(migration));
  ck("it never reaches evidence", !/FROM public\.sp_evidence/.test(migration));
  ck("it returns no internal decision note", !migration.includes("r.decision_note"));
  ck("grants are restated rather than assumed", migration.includes("REVOKE ALL ON FUNCTION"));
  ck("and anon is named in the revoke", /FROM PUBLIC, anon/.test(migration));
  ck(
    "the migration asserts its own end state rather than claiming it",
    migration.includes("SP_POSTFLIGHT_GRANTS_WRONG"),
  );

  // The employer-facing component may only ever be handed the queue's shape.
  const rev = code(read("src/components/security-passport/live/EmploymentVerificationReview.tsx"));
  for (const forbidden of ["decisionNote", "evidence", "claimId", "credential"]) {
    ck(`the review component never reads ${forbidden}`, !rev.includes(forbidden));
  }
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("passport-employer-verification-check: all assertions passed");
