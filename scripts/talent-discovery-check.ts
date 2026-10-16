// Slutuppdrag 2026-10-15: the Passport's next step and clarification reply,
// product notices, voluntary discoverability and talent search -- the rules
// the interface applies on top of the database contract
// (docs/passport/talent-discovery/talent-search-contract.md).
//
// Behaviour is exercised directly on the pure modules; page contracts are
// asserted from source, the way passport-launch-completion-check does. The
// database half is supabase/tests/{sp_review_reply_history_and_notices,
// sp_talent_discovery,rec_talent_search_and_contact}_test.sql.
//
// Run: bun run talent-discovery:check

import { noticeLabelKey } from "../src/lib/notices/notice-label";
import { approvalPresentation } from "../src/lib/security-passport/approval-presentation";
import { effectiveTrust } from "../src/lib/security-passport/provenance";
import { passportT, type PassportCopyKey } from "../src/lib/security-passport/i18n";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONSENT_TEXT_VERSION,
  ORDERING,
  anonymousReference,
  criteriaPayload,
  criterionDraftProblem,
  criterionProblem,
  discoverabilityPayload,
  draftProblem,
  entryTalentLevel,
  levelKey,
  talentValidity,
  meritDisplayName,
  reasonKeys,
  requirementStateKey,
  type CatalogueOption,
  type DiscoverabilityDraft,
} from "../src/lib/talent/model";
import { talentCopy } from "../src/lib/talent/talent-copy";
import {
  deriveVerificationAttention,
  revokedRequestIdsOf,
} from "../src/lib/professional-identity/verification-attention";
import {
  entryNextStep,
  NEXT_STEP_COPY,
  OVERVIEW_STEP_PRIORITY,
  overviewNextStep,
  overviewReviewState,
  reviewStateFromRequests,
} from "../src/lib/security-passport/entry-next-step";
import {
  PRODUCT_NOTICE_KINDS,
  productNoticeLink,
  recipientAllowed,
  renderProductNotice,
} from "../src/lib/email/send-product-notice-email.server";
import { passportCopy } from "../src/lib/security-passport/i18n";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const code = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/[^\n]*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

const failures: string[] = [];
let assertions = 0;
function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

// ── 1 · the next step ────────────────────────────────────────────────────
console.log("1 · the entry's next step");
const base = {
  kind: "claim" as const,
  assertionLevel: "self_declared",
  hasActiveEvidence: false,
  reviewState: "none" as const,
  hasExpired: false,
  expiresSoon: false,
};
check(
  entryNextStep(base) === "add_evidence",
  "N1 registered, nothing uploaded -> upload documentation",
);
check(
  entryNextStep({ ...base, assertionLevel: "document_provided", hasActiveEvidence: true }) ===
    "request_review",
  "N2 after an upload the next step is the review, not sharing",
);
check(
  entryNextStep({ ...base, hasActiveEvidence: true, reviewState: "pending" }) === "waiting",
  "N3 review in progress -> wait",
);
check(
  entryNextStep({ ...base, hasActiveEvidence: true, reviewState: "clarification_requested" }) ===
    "clarification",
  "N4 more information requested -> read and reply",
);
check(
  entryNextStep({ ...base, hasActiveEvidence: true, reviewState: "rejected" }) === "rejected",
  "N5 rejected -> read the decision",
);
check(
  entryNextStep({
    ...base,
    assertionLevel: "verified",
    hasActiveEvidence: true,
    reviewState: "revoked",
  }) === "revoked",
  "N6 revoked wins over a verified level",
);
check(
  entryNextStep({
    ...base,
    assertionLevel: "verified",
    hasActiveEvidence: true,
    reviewState: "approved",
    hasExpired: true,
  }) === "renew",
  "N7 an expired reviewed merit -> renew",
);
check(
  entryNextStep({
    ...base,
    assertionLevel: "verified",
    hasActiveEvidence: true,
    reviewState: "approved",
  }) === "done",
  "N8 reviewed and current -> done (share or visibility)",
);
check(
  entryNextStep({ ...base, kind: "experience" }) === "employer_or_review",
  "N9 an employment with no document -> employer confirmation or review",
);
check(
  reviewStateFromRequests(
    [{ status: "approved", submittedAt: "2026-01-01", decidedAt: "2026-01-02" }],
    [
      { decision: "approved", decidedAt: "2026-03-01T10:00:00Z" },
      { decision: "revoked", decidedAt: "2026-02-01T10:00:00Z" },
      { decision: "approved", decidedAt: "2026-01-02T10:00:00Z" },
    ],
  ) === "approved",
  "N10 approval after revocation: the newest decision is the current state",
);
const nextStep = code(read("src/components/security-passport/live/EntryNextStep.tsx"));
check(
  /step === "done" && isPassportCredential/.test(nextStep) &&
    nextStep.includes("/passport/discoverability"),
  "N11 sharing is offered only once reviewed, next to visibility",
);
// Workshop 2026-10-15, package A: the overview offers the step the
// credential's own page shows, the most pressing first, in the page's words.
check(
  overviewReviewState("clarification_requested", "approved") === "clarification_requested" &&
    overviewReviewState(undefined, "rejected") === "rejected" &&
    overviewReviewState(undefined, "approved") === "approved" &&
    overviewReviewState(undefined, undefined) === "none",
  "N12 the overview's review state: an open request first, else the latest decision",
);
check(
  [...OVERVIEW_STEP_PRIORITY].sort().join() === Object.keys(NEXT_STEP_COPY).sort().join() &&
    new Set(OVERVIEW_STEP_PRIORITY).size === OVERVIEW_STEP_PRIORITY.length,
  "N13 the overview's order ranks every step exactly once",
);
{
  const pick = overviewNextStep([
    { id: "a", step: "add_evidence" as const },
    { id: "b", step: "done" as const },
    { id: "c", step: "clarification" as const },
    { id: "d", step: "add_evidence" as const },
  ]);
  const uploads = overviewNextStep([
    { id: "a", step: "add_evidence" as const },
    { id: "d", step: "add_evidence" as const },
  ]);
  const waiting = overviewNextStep([
    { id: "a", step: "waiting" as const },
    { id: "b", step: "done" as const },
  ]);
  check(
    pick.step === "clarification" &&
      pick.entry?.id === "c" &&
      uploads.step === "add_evidence" &&
      uploads.entry?.id === "a" &&
      uploads.count === 2 &&
      waiting.step === "waiting" &&
      overviewNextStep([]).step === "first",
    "N14 a reviewer waiting on the holder comes first; the first credential of a step is named with the count",
  );
}
{
  const side = code(read("src/components/security-passport/PassportSideColumn.tsx"));
  check(
    /NEXT_STEP_COPY\[step\]/.test(nextStep) &&
      !/const COPY\b/.test(nextStep) &&
      side.includes("NEXT_STEP_COPY[next.kind]") &&
      side.includes("entryNextStep({"),
    "N15 the overview and the credential's page name a step with the same words",
  );
}

{
  // A revocation is a decision on the request it revokes; that request keeps
  // "approved". The overview must not announce it as recently verified.
  const approved = {
    id: "req-1",
    claimId: "c-1",
    periodId: null,
    kind: "cqrityjob_review",
    status: "approved",
    holderMessage: null,
    submittedAt: "2026-10-10T08:00:00Z",
    decidedAt: "2026-10-12T08:00:00Z",
  } as unknown as Parameters<typeof deriveVerificationAttention>[0][number];
  const now = new Date("2026-10-15T12:00:00Z");
  const kept = deriveVerificationAttention([approved], now);
  const revoked = deriveVerificationAttention(
    [approved],
    now,
    revokedRequestIdsOf([{ requestId: "req-1", decision: "revoked" }]),
  );
  const index = code(read("src/routes/_authenticated.passport.index.tsx"));
  check(
    kept.information.length === 1 &&
      revoked.information.length === 0 &&
      revokedRequestIdsOf(undefined).size === 0 &&
      index.includes("revokedRequestIdsOf(r.decisions)"),
    "N16 an approval that was revoked is not announced as recently verified on the overview",
  );
}

// ── 2 · the reply and the thread ─────────────────────────────────────────
console.log("2 · clarification reply and the case thread");
const thread = code(read("src/components/security-passport/live/ReviewThread.tsx"));
check(
  /audience === "reviewer" && e\.internalNote/.test(thread),
  "R1 the internal note renders only for a reviewer",
);
check(
  /status === "error"/.test(thread) && thread.includes("ver.thread.loadError"),
  "R2 a failed history read is said as a failure",
);
check(
  /setBody\(""\)/.test(thread) && /catch \(cause\)/.test(thread),
  "R3 the reply text is cleared only after it was recorded",
);
const panel = code(read("src/components/security-passport/live/VerificationPanel.tsx"));
check(
  panel.includes('currentState.state === "revoked"') &&
    panel.includes('newestDecision?.decision === "revoked"'),
  "R4 a revocation is shown only while it is the current state",
);
const replyFn = code(read("src/lib/security-passport/review-thread.functions.ts"));
check(
  replyFn.includes("_reviewed_submitted_at"),
  "R5 the reply is bound to the version the clarification was asked on",
);
const review = code(read("src/routes/_authenticated.passport-review.tsx"));
check(
  review.includes('audience="reviewer"') && review.includes("getReviewThread"),
  "R6 the reviewer reads the holder's reply in the case",
);

// ── 3 · notices ──────────────────────────────────────────────────────────
console.log("3 · product notices");
const hostile = {
  siteOrigin: "https://app.example.test",
  subjectType: "contact" as const,
  subjectId: "11111111-1111-4111-8111-111111111111",
  employerName: "Evil <script>alert(1)</script>\nBcc: x@y.z",
  jobTitle: "Väktare\r\nX-Header: yes",
  jobId: "22222222-2222-4222-8222-222222222222",
  employerSlug: "evil/../../admin",
};
for (const kind of PRODUCT_NOTICE_KINDS) {
  for (const language of ["sv", "en"] as const) {
    const r = renderProductNotice({ ...hostile, kind, language });
    check(
      !/[\r\n]/.test(r.subject) &&
        !r.html.includes("<script>") &&
        r.link.startsWith("https://app.example.test/"),
      `E1 ${kind}/${language}: single-line subject, escaped HTML, link on the site's own origin`,
    );
  }
}
check(
  productNoticeLink({ ...hostile, kind: "talent_contact_accepted", language: "sv" }) ===
    "https://app.example.test/employer",
  "E2 a slug of an unexpected shape falls back to the front door",
);
check(
  renderProductNotice({
    ...hostile,
    kind: "passport_decision_approved",
    language: "sv",
    subjectType: "claim",
    verificationMethod: "document_review",
  }).text.includes("inte en bekräftelse från utfärdaren"),
  "E3 an approval mail says the review is not an issuer confirmation",
);
check(
  noticeLabelKey({
    kind: "passport_decision_approved",
    verificationMethod: "employer_confirmation",
    subjectType: "experience",
  }) === "notices.kind.passport_decision_employer_confirmed" &&
    // An employer confirms an employment, never a credential.
    noticeLabelKey({
      kind: "passport_decision_approved",
      verificationMethod: "employer_confirmation",
      subjectType: "claim",
    }) === "notices.kind.passport_decision_approved_other" &&
    noticeLabelKey({ kind: "passport_decision_approved", verificationMethod: null }) ===
      "notices.kind.passport_decision_approved_other" &&
    noticeLabelKey({
      kind: "passport_decision_approved",
      verificationMethod: "document_review",
    }) === "notices.kind.passport_decision_approved",
  "E3d RF8 the inbox names an employer confirmation as one, never as a document review",
);
// Astra's recheck (2026-10-15): every surface says what a decision SUPPORTS,
// by the existing provenance model, and the decision word "Approved" is kept
// apart from it. The cases are the database's (supabase/tests/
// provenance_cases.json, also read by talent_provenance_test.sql and compared
// with effectiveTrust by scripts/provenance-parity-check.ts).
{
  type Case = {
    id: string;
    subject: "claim" | "period";
    method: string;
    organisation: string;
    expected: string;
    why: string;
  };
  const cases = JSON.parse(
    readFileSync(join(ROOT, "supabase/tests/provenance_cases.json"), "utf8"),
  ) as Case[];
  const employerWords = /arbetsgivare|employer/i;
  const issuerWords = /bekräftad av utfärdaren|confirmed by the issuer|bekräftat av utfärdaren/i;
  for (const c of cases) {
    const subjectKind = c.subject === "period" ? ("employment" as const) : ("credential" as const);
    const subjectType = c.subject === "period" ? ("experience" as const) : ("claim" as const);
    const wantEmployer = c.expected === "employer_confirmed";
    const trust = effectiveTrust({
      assertionLevel: "verified",
      verificationMethod: c.method,
      verifierName: c.organisation,
      subjectKind,
    });
    const a = approvalPresentation({ method: c.method, organisation: c.organisation, subjectKind });
    // The method the database writes on the notice (sp_decision_trust).
    const noticeMethod = wantEmployer ? "employer_confirmation" : "document_review";
    for (const lang of ["sv", "en"] as const) {
      const basis = a.basis ? passportT(a.basis, lang) : "";
      const note = a.note ? passportT(a.note, lang) : "";
      const inbox = passportT(
        noticeLabelKey({
          kind: "passport_decision_approved",
          verificationMethod: noticeMethod,
          subjectType,
        }) as PassportCopyKey,
        lang,
      );
      // The raw method too: the application refuses the stronger words on its own.
      const inboxRaw = passportT(
        noticeLabelKey({
          kind: "passport_decision_approved",
          verificationMethod: c.method,
          subjectType,
        }) as PassportCopyKey,
        lang,
      );
      const mail = renderProductNotice({
        ...hostile,
        kind: "passport_decision_approved",
        language: lang,
        subjectType,
        verificationMethod: noticeMethod,
      });
      const mailRaw = renderProductNotice({
        ...hostile,
        kind: "passport_decision_approved",
        language: lang,
        subjectType,
        verificationMethod: c.method,
      });
      check(
        a.decision === "ver.status.approved" &&
          (trust === "source_confirmed") === wantEmployer &&
          employerWords.test(basis) === wantEmployer &&
          !issuerWords.test(basis) &&
          !issuerWords.test(note) &&
          employerWords.test(inbox) === wantEmployer &&
          employerWords.test(mail.subject) === wantEmployer &&
          (wantEmployer || !employerWords.test(inboxRaw) || subjectType === "experience") &&
          !issuerWords.test(inboxRaw) &&
          !issuerWords.test(mailRaw.subject) &&
          (subjectType === "experience" || !employerWords.test(mailRaw.subject)),
        `PA ${c.id} (${lang}) ${c.why}: "${passportT("ver.status.approved", lang)}" and ${wantEmployer ? "employer-confirmed" : "documented"}, everywhere`,
      );
    }
  }
  const thread = readFileSync(
    join(ROOT, "src/components/security-passport/live/ReviewThread.tsx"),
    "utf8",
  );
  check(
    (thread.match(/<ApprovalBasis/g) ?? []).length === 2 &&
      !/approvalLabelKey|ver\.approved\./.test(thread) &&
      (thread.match(/subjectKind=\{subjectKind\}/g) ?? []).length >= 2,
    "PA the current state and the history both name the decision and its basis apart, for the entry's subject",
  );
}
// RF8 (review 2026-10-15): the mail follows the verification method.
for (const language of ["sv", "en"] as const) {
  const employer = renderProductNotice({
    ...hostile,
    kind: "passport_decision_approved",
    language,
    subjectType: "experience",
    verificationMethod: "employer_confirmation",
  });
  check(
    !/CQrityjob (har granskat|has reviewed|reviewed)/.test(employer.text + employer.subject) &&
      !/dokumentgranskad|document-reviewed|document reviewed/i.test(employer.subject) &&
      /arbetsgivar|employer/i.test(employer.text),
    `E3b RF8 an employer confirmation is never called a CQrityjob document review (${language})`,
  );
  // A legacy payload without provenance fields (no method), for a credential
  // and for an employment: the mail claims neither a CQrityjob review nor an
  // employer's confirmation, and says the decision without a basis.
  for (const subjectType of ["claim", "experience"] as const) {
    const unknown = renderProductNotice({
      ...hostile,
      kind: "passport_decision_approved",
      language,
      subjectType,
      verificationMethod: null,
    });
    const words = `${unknown.subject}\n${unknown.text}`;
    check(
      !/CQrityjob (har granskat|has reviewed|reviewed)/.test(words) &&
        !/arbetsgivar|employer/i.test(words) &&
        /godkänd|approved/i.test(unknown.subject),
      `E3c RF8 without a known method the mail claims no CQrityjob review and no employer confirmation (${language}, ${subjectType})`,
    );
  }
}

// The same legacy decision in the current status and the history: "Approved",
// and no basis or note is invented for it.
{
  const missing = [
    approvalPresentation({ method: null, organisation: null, subjectKind: "credential" }),
    approvalPresentation({ method: undefined, organisation: undefined, subjectKind: "employment" }),
    approvalPresentation({
      method: "",
      organisation: "TS Bevakning AB",
      subjectKind: "employment",
    }),
  ];
  check(
    missing.every(
      (p) => p.decision === "ver.status.approved" && p.basis === null && p.note === null,
    ),
    "PA0 a decision without a recorded method reads Approved, with no basis and no note",
  );
}
// RF9 (review 2026-10-15): a missing or empty list is a closed door outside
// an explicitly declared production environment.
check(
  // Explicit arguments: a default would read this machine's own environment.
  !recipientAllowed("external@example.org", "", "") &&
    !recipientAllowed("external@example.org", "", "test") &&
    !recipientAllowed("external@example.org", "  ", "preview"),
  "E4 RF9 no allowlist and no production declaration: nobody is mailed",
);
check(
  recipientAllowed("external@example.org", "", "production") &&
    !recipientAllowed("external@example.org", "@cqrityjob.test", "production"),
  "E4b RF9 production is explicit; a list, when set, still applies",
);
check(
  recipientAllowed("qa@cqrityjob.test", "@cqrityjob.test, owner@example.com") &&
    !recipientAllowed("someone@gmail.com", "@cqrityjob.test, owner@example.com"),
  "E5 a test allowlist blocks addresses outside it",
);
const edge = read("supabase/functions/transactional-email/index.ts");
check(
  /product_notice:\s*\{\s*to:\s*"caller",\s*replyTo:\s*"none"\s*\}/.test(edge),
  "E6 the transport knows product_notice: one caller, no Reply-To",
);
check(
  !/ORGANISATION_SENDER_KINDS = new Set\(\[[^\]]*product_notice/.test(edge),
  "E7 a product notice never carries an organisation sender name",
);

// ── 4 · discoverability ──────────────────────────────────────────────────
console.log("4 · discoverability");
const draft: DiscoverabilityDraft = {
  visibility: "open",
  claimIds: ["a", "a"],
  experienceIds: [],
  areas: ["corporate_security"],
  countries: [" se "],
  cities: ["Stockholm", " ", "Göteborg", "A", "B", "C", "D"],
  employmentTypes: ["full_time"],
  workplaceTypes: [],
  availableFrom: "",
  consent: false,
};
check(draftProblem(draft) === "consent_required", "D1 becoming discoverable needs the consent box");
check(
  draftProblem({ ...draft, claimIds: [], consent: true }) === "nothing_selected",
  "D2 and at least one item",
);
check(draftProblem({ ...draft, visibility: "private" }) === null, "D3 private needs neither");
const payload = discoverabilityPayload({ ...draft, consent: true });
check(
  payload.consentTextVersion === CONSENT_TEXT_VERSION && payload.claimIds.length === 1,
  "D4 consent version sent; duplicates removed",
);
check(
  JSON.stringify(payload.preferences.countries) === '["SE"]' &&
    (payload.preferences.cities as string[]).length === 5,
  "D5 countries normalised, at most five places",
);
check(
  discoverabilityPayload({ ...draft, visibility: "private" }).consentTextVersion === null,
  "D6 private sends no consent",
);
const page = code(read("src/routes/_authenticated.passport.discoverability.tsx"));
check(
  page.includes("useUnsavedChanges") && page.includes("data-pause-discoverability"),
  "D7 the page guards unsaved input and offers pause",
);
check(
  !page.includes("sp_disclosures") && !page.includes("application"),
  "D8 the setting never reads an application share as consent",
);
// Workshop 2026-10-15, package B: support and validity at the choice, the
// draft apart from what is saved, and an explicit activation.
check(
  entryTalentLevel({ assertionLevel: "self_declared" }) === "self_declared" &&
    entryTalentLevel({ assertionLevel: "document_provided" }) === "document_provided" &&
    entryTalentLevel({
      assertionLevel: "verified",
      verificationMethod: "document_review",
      verifierName: "CQrityjob",
      subjectKind: "credential",
    }) === "document_reviewed" &&
    entryTalentLevel({ assertionLevel: "verified", subjectKind: "credential" }) ===
      "document_reviewed",
  "D10 the picker reads an entry's support as the employer card does; no method is documented, never more",
);
{
  type Case = {
    id: string;
    subject: "claim" | "period";
    method: string;
    organisation: string;
    expected: string;
  };
  const cases = JSON.parse(
    readFileSync(join(ROOT, "supabase/tests/provenance_cases.json"), "utf8"),
  ) as Case[];
  const differ = cases.filter(
    (c) =>
      entryTalentLevel({
        assertionLevel: "verified",
        verificationMethod: c.method,
        verifierName: c.organisation,
        subjectKind: c.subject === "period" ? "employment" : "credential",
      }) !== c.expected,
  );
  check(
    cases.length >= 21 && differ.length === 0,
    `D11 the picker's support equals sp_talent_entry_level on all ${cases.length} shared provenance cases${differ.length ? ` (differs: ${differ.map((c) => c.id).join(", ")})` : ""}`,
  );
}
check(
  talentValidity("2026-11-01", "2030-01-01", false, "2026-10-15") === "not_yet_valid" &&
    talentValidity(null, null, true, "2026-10-15") === "no_expiry" &&
    talentValidity(null, null, false, "2026-10-15") === "not_stated" &&
    talentValidity(null, "2026-10-14", false, "2026-10-15") === "expired" &&
    talentValidity(null, "2026-12-14", false, "2026-10-15") === "expiring_soon" &&
    talentValidity(null, "2026-12-15", false, "2026-10-15") === "valid" &&
    talentValidity(null, "2026-10-15", false, "2026-10-15") === "expiring_soon",
  "D12 the picker's validity is sp_talent_validity: not yet valid, no expiry, not stated, expired, within 60 days, valid",
);
{
  const order = [
    'aria-labelledby="disc-saved-state"',
    'aria-labelledby="disc-state"',
    'aria-labelledby="disc-items"',
    'aria-labelledby="disc-prefs"',
    'aria-labelledby="disc-summary"',
    'aria-labelledby="disc-preview"',
    'aria-labelledby="disc-consent"',
    'aria-labelledby="disc-contacts"',
  ].map((m) => page.indexOf(m));
  check(
    order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])),
    "D13 one column on a phone in the workshop's order: saved status, choice, items, preferences, draft summary, saved preview, consent, contacts",
  );
}
check(
  page.includes("entryTalentLevel(") &&
    page.includes("talentValidity(") &&
    page.includes("data-item-support") &&
    /firstActivation\s*\?\s*pt\("disc\.activate"\)\s*:\s*pt\("disc\.saveChanges"\)/.test(page) &&
    /settings\.visibility === "private" &&\s*draft\.visibility !== "private"/.test(page) &&
    /\{dirty \? \(\s*<div[\s\S]{0,200}data-unsaved-notice/.test(page),
  "D14 support and validity at each choice; 'Make me discoverable' only for the first activation; unsaved changes said beside the saved preview",
);
check(
  passportCopy.sv["disc.preview.title"] === "Så visas dina sparade uppgifter" &&
    passportCopy.sv["disc.unsaved.title"] === "Osparade ändringar" &&
    passportCopy.sv["disc.activate"] === "Gör mig sökbar" &&
    passportCopy.sv["disc.saveChanges"] === "Spara ändringar" &&
    /fortfarande det sparade/.test(passportCopy.sv["disc.unsaved.body"]) &&
    !/arbetsgivar|employer/i.test(
      passportCopy.sv["disc.summary.title"] + passportCopy.en["disc.summary.title"],
    ),
  "D15 the saved preview, the unsaved notice and the two actions in the workshop's words; the draft summary is not called the employer's view",
);
const shell = read("src/routes/_authenticated.passport.tsx");
check(
  shell.includes('to: "/passport/discoverability"'),
  "D9 a tab of the Passport workspace, not a second profile",
);

// ── 5 · explaining a result ──────────────────────────────────────────────
console.log("5 · explaining a result");
const states = ["evidenced", "needs_clarification", "not_shared", "to_clarify"] as const;
for (const lang of ["sv", "en"] as const) {
  const words = states
    .map((s) => talentCopy[lang][requirementStateKey(s) as keyof (typeof talentCopy)["sv"]])
    .join(" | ");
  check(
    !/saknas|missing|lacks|uppfyller inte|not met|underkänd|fail/i.test(words),
    `X1 ${lang}: no state says a person lacks something`,
  );
}
// The card carries only the level, so a CQrityjob review and a downgraded
// legacy record read alike: the words claim neither CQrityjob nor the issuer
// (workshop 2026-10-15, package A).
check(
  /^Granskad/.test(
    talentCopy.sv[levelKey("document_reviewed") as keyof (typeof talentCopy)["sv"]],
  ) &&
    !/CQrityjob|utfärdar/i.test(
      talentCopy.sv[levelKey("document_reviewed") as keyof (typeof talentCopy)["sv"]],
    ) &&
    !/CQrityjob|issuer/i.test(
      talentCopy.en[levelKey("document_reviewed") as keyof (typeof talentCopy)["en"]],
    ),
  "X2 a review is worded as reviewed and documented, claiming neither CQrityjob nor the issuer",
);
check(
  meritDisplayName({ nameEn: "Certified Protection Professional", abbreviation: "CPP" }, "en") ===
    "Certified Protection Professional (CPP)" &&
    meritDisplayName(
      { nameEn: "Certified Protection Professional (CPP)", abbreviation: "CPP" },
      "en",
    ) === "Certified Protection Professional (CPP)",
  "X3 full name with abbreviation, never doubled",
);
check(
  reasonKeys(["international_certification_is_not_authorisation", "made_up"]).length === 1,
  "X4 unknown reasons are dropped, known ones explained",
);
check(
  JSON.stringify(ORDERING) ===
    '["mandatoryEvidenced","mandatoryReviewed","desirableEvidenced","preferencesMet","reference"]',
  "X5 the documented order",
);
const catalogue: CatalogueOption[] = [
  {
    code: "OV",
    nameSv: "Ordningsvakt",
    nameEn: "Public Order Guard",
    abbreviation: "OV",
    requirementClass: "regulated_authorisation",
    jurisdiction: "SE",
    scope: "national_regulated",
  },
  {
    code: "INTL_ASIS_CPP",
    nameSv: "CPP",
    nameEn: "CPP",
    abbreviation: "CPP",
    requirementClass: "certification",
    jurisdiction: null,
    scope: "global_professional",
  },
];
const crit = {
  requirementId: "r",
  credentialCodes: ["OV", "INTL_ASIS_CPP"],
  jurisdiction: null,
  mustBeValid: true,
  minLevel: "any" as const,
  experienceMonths: null,
};
check(
  criterionProblem(crit, catalogue) === "mixed_classes",
  "X6 an international certification cannot stand in for an authorisation",
);
check(
  criterionProblem({ ...crit, credentialCodes: [], experienceMonths: 0 }, catalogue) ===
    "months_out_of_range",
  "X7 months in range",
);
check(
  JSON.stringify(criteriaPayload([{ ...crit, credentialCodes: [] }])) === '[{"requirementId":"r"}]',
  "X8 an unbound requirement is sent as clarified-in-dialogue",
);
const search = code(
  read("src/routes/_authenticated.employer.$employerSlug.jobs.$jobId.talent.tsx"),
);
check(
  !/score|percent|ranking|suitab/i.test(search.replace(/talent\.ui\.[a-zA-Z.]+/g, "")),
  "X9 the search page shows no score, percentage or verdict",
);
check(
  search.includes("talent.ui.order.body") && search.includes("orderingFacts"),
  "X10 the order is explained, with each result's counts",
);
check(
  search.includes("crypto.randomUUID()") && search.includes("idempotencyKey"),
  "X11 one idempotency key per contact dialog",
);

// Workshop 2026-10-15, package C: a neutral reference, a dialog that says
// who and what, a failed withdrawal that says so, and the advert before the
// candidate decides.
check(
  anonymousReference("3f9a2c10-0000-4000-8000-000000000001") === "3F9A2C" &&
    !/result\.position\}/.test(search) &&
    search.includes("anonymousReference(result.ref)") &&
    !/Kandidat|Candidate/.test(
      talentCopy.sv["talent.ui.person"] + talentCopy.en["talent.ui.person"],
    ),
  "X12 a result is named by a neutral anonymous reference, never by its place in the list",
);
check(
  /data-contact-context[\s\S]{0,600}\{employerName\}[\s\S]{0,300}\{jobTitle\}[\s\S]{0,300}\{reference\}/.test(
    search,
  ),
  "X13 the contact dialog shows the company, the position and the anonymous profile it goes to",
);
check(
  /function WithdrawContact[\s\S]{0,1600}setFailed\(true\)[\s\S]{0,1600}role="alert"/.test(
    search,
  ) &&
    /talent-contacts", jobId\] \}\),\s*qc\.invalidateQueries\(\{ queryKey: \["employer", employerId, "talent-search", jobId\]/.test(
      search,
    ) &&
    !search.includes("catch(() => undefined)") &&
    !search.includes(".catch(\n"),
  "X14 a failed withdrawal shows an error and a retry; a done one refreshes contacts and results alike",
);
check(
  search.includes('tt("talent.ui.basis")') &&
    search.includes("results.data.criteriaVersion") &&
    /Obekräftade ändringar påverkar inte sökningen/.test(talentCopy.sv["talent.ui.basis"]),
  "X15 the search says which confirmed criteria version it uses, and that unconfirmed edits do not count",
);
check(
  criterionDraftProblem("credential", { ...crit, credentialCodes: [] }, catalogue) ===
    "empty_credential" &&
    criterionDraftProblem(
      "experience",
      { ...crit, credentialCodes: [], experienceMonths: null },
      catalogue,
    ) === "empty_experience" &&
    criterionDraftProblem("unbound", { ...crit, credentialCodes: [] }, catalogue) === null &&
    criterionDraftProblem(
      "experience",
      { ...crit, credentialCodes: ["X"], experienceMonths: 24 },
      catalogue,
    ) === null,
  "X16 a chosen catalogue or experience binding left empty is refused, never sent as if filled in",
);
{
  const critPanel = code(read("src/components/talent/TalentCriteriaPanel.tsx"));
  check(
    critPanel.includes("criterionDraftProblem(d.kind, d, options)") &&
      critPanel.includes("data-criteria-unconfirmed") &&
      critPanel.includes('tt("talent.crit.inUse")') &&
      /påverkar inte sökningen/.test(talentCopy.sv["talent.crit.unconfirmed.body"]),
    "X17 the criteria panel names the confirmed version in use and says unconfirmed edits do not affect the search",
  );
}
{
  const list = code(read("src/components/talent/ContactRequestList.tsx"));
  const pending = list.slice(list.indexOf('c.status === "pending" ? ('));
  check(
    passportCopy.sv["disc.contacts.whatAccept"] ===
      "När du accepterar får företaget se ditt namn. Ingen ansökan skickas. Du väljer själv om du söker och vilka Passport-uppgifter du delar då." &&
      passportCopy.sv["disc.contacts.accept"] === "Acceptera och dela mitt namn",
    "K1 the shared consequence text, and an accept button that says the name is shared",
  );
  check(
    pending.indexOf("data-contact-advert") > 0 &&
      pending.indexOf("data-contact-advert") < pending.indexOf('pt("disc.contacts.accept")'),
    "K2 the advert can be read before the decision",
  );
  check(
    /\{company\}/.test(passportCopy.sv["disc.contacts.declineBlock"]) &&
      /hela \{company\}/.test(passportCopy.sv["disc.contacts.declineHelp"]) &&
      list.includes('pt("disc.contacts.declineBlock").replace("{company}", c.employer.name)'),
    "K3 stopping names the company and says it covers every position there",
  );
  check(
    list.includes('pt("disc.contacts.acceptedApplyLeft")') &&
      list.includes('pt("disc.contacts.acceptedExternal")') &&
      /inte registreras|not recorded/.test(
        passportCopy.sv["disc.contacts.acceptedExternal"] +
          passportCopy.en["disc.contacts.acceptedExternal"],
      ),
    "K4 after accepting, the application is still the candidate's step; an external one is explained as such",
  );
}

// ── 6 · copy parity ──────────────────────────────────────────────────────
console.log("6 · copy parity");
const svKeys = Object.keys(talentCopy.sv);
check(
  svKeys.every((k) => (talentCopy.en as Record<string, string>)[k]?.trim()),
  "C1 every talent key has English",
);
const newPassportKeys = Object.keys(passportCopy.sv).filter((k) =>
  /^(ver\.reply|ver\.thread|ver\.current|next\.|notices\.|disc\.)/.test(k),
);
check(
  newPassportKeys.length > 100 &&
    newPassportKeys.every((k) => (passportCopy.en as Record<string, string>)[k]?.trim()),
  "C2 every new Passport key has English",
);

console.log("");
if (failures.length > 0) {
  console.error(`talent-discovery:check FAILED (${failures.length} of ${assertions})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`talent-discovery:check: ${assertions} assertions passed`);
