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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONSENT_TEXT_VERSION,
  ORDERING,
  criteriaPayload,
  criterionProblem,
  discoverabilityPayload,
  draftProblem,
  levelKey,
  meritDisplayName,
  reasonKeys,
  requirementStateKey,
  type CatalogueOption,
  type DiscoverabilityDraft,
} from "../src/lib/talent/model";
import { talentCopy } from "../src/lib/talent/talent-copy";
import {
  entryNextStep,
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
  }).text.includes("inte en bekräftelse från utfärdaren"),
  "E3 an approval mail says the review is not an issuer confirmation",
);
check(
  recipientAllowed("anyone@example.com", undefined),
  "E4 no allowlist (production): every recipient",
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
check(
  talentCopy.sv[levelKey("document_reviewed") as keyof (typeof talentCopy)["sv"]].includes(
    "Dokumentgranskad",
  ) &&
    !/utfärdar|issuer/i.test(
      talentCopy.en[levelKey("document_reviewed") as keyof (typeof talentCopy)["en"]],
    ),
  "X2 an administrator's approval is worded as a document review, not as the issuer",
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
