/**
 * Interview Context Bridge — behaviour and safety guard.
 *
 * Two halves, and the split matters:
 *
 *   BEHAVIOUR   `buildInterviewContext` is a pure function, so the cases that
 *               matter — released assessment, no assessment, external CV,
 *               unlinked case — are exercised for real rather than described.
 *
 *   SOURCE      The things that must NEVER happen are absences, and an absence
 *               cannot be exercised. "Reviewer notes never appear" is not a
 *               test you can run; it is a claim about what the code reads, and
 *               the only honest way to hold it is to read the code.
 *
 * Deterministic, offline, no database. Every assertion below corresponds to a
 * lettered requirement in the PR that commissioned it, and the letters are
 * printed so a failure names the promise it broke.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildInterviewContext,
  normaliseRequirements,
  unlinkedContext,
  type ContextAssessmentInput,
  type ContextCvInput,
  type ContextInput,
  type ContextJobInput,
} from "../src/lib/interview-intelligence/context";
import { dictionaries } from "../src/i18n/dictionaries";

const root = process.cwd();
let failures = 0;
let passes = 0;

function ok(cond: boolean, label: string): void {
  if (cond) {
    passes += 1;
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

/** Source with comments stripped, so a guard never trips on prose that
 *  merely NAMES the thing it forbids — every file here discusses reviewer
 *  notes and Passport data at length in order to explain not reading them. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

const CONTEXT = "src/lib/interview-intelligence/context.ts";
const FUNCTIONS = "src/lib/interview-intelligence/context.functions.ts";
const PANEL = "src/components/employer/interview/InterviewContextPanel.tsx";
const PREPARE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.prepare.tsx";
const NEW_CASE = "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.new.tsx";
const APPLICATION =
  "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx";

console.log("interview-context-bridge-check\n");

/* ================================================================== */
/* Fixtures                                                            */
/* ================================================================== */

const job: ContextJobInput = {
  titleSv: "Säkerhetssamordnare",
  titleEn: "Security Coordinator",
  requirements: ["Erfarenhet av incidenthantering", "Vana att arbeta i skyddsobjekt"],
  formalRequirements: ["SSG Entre"],
  languageRequirements: ["sv", "en"],
  experienceLevel: "mid",
  regulated: true,
  securityVettingMentioned: true,
  drivingLicenceRequired: true,
};

const cqrityjobCv: ContextCvInput = {
  presence: "cqrityjob_cv",
  submittedAt: "2026-08-01T09:00:00Z",
  document: {
    documentVersion: "cv-document-v1",
    origin: "factual",
    locale: "sv",
    displayName: "Anna Lind",
    country: "SE",
    headline: "Säkerhetssamordnare med tio års erfarenhet",
    headlineIsAiWritten: false,
    summary: null,
    summaryIsAiWritten: false,
    experience: [
      {
        fact: {
          id: "e1",
          employerName: "Nordic Security AB",
          roleTitle: "Skyddsvakt",
          startedOn: "2019-01-01",
          endedOn: "2024-06-30",
          employmentType: "permanent",
          assertionLevel: "self_declared",
        },
        bullets: [],
        bulletsAreAiWritten: false,
      },
    ],
    education: [],
    credentials: [
      {
        id: "c1",
        claimType: "certificate",
        title: "Skyddsvaktsutbildning",
        issuerName: "Polismyndigheten",
        issuedOn: "2019-02-01",
        validUntil: null,
        level: null,
        verified: true,
      },
    ],
    skills: [],
    languages: [],
    careerInsightSnapshotId: null,
    tailoringRationale: null,
    omittedEmployment: [],
    trust: { employment: {}, claims: {} } as never,
  },
};

const assessment: ContextAssessmentInput = {
  releasedAt: "2026-08-20T12:00:00Z",
  observed: [
    {
      areaSv: "Riskbedömning",
      areaEn: "Risk assessment",
      signal: "limited",
      behaviourSv: "Beskrev en strukturerad genomgång.",
      behaviourEn: "Described a structured walkthrough.",
    },
  ],
  guide: [
    {
      areaCode: "RISK",
      areaSv: "Riskbedömning",
      areaEn: "Risk assessment",
      focus: "explore_limited_evidence",
      whySv: "Bedömningen innehåller få svar inom området.",
      whyEn: "The assessment holds few answers in this area.",
      followupSv: "Be om ett konkret exempel på en riskbedömning personen gjort.",
      followupEn: "Ask for a concrete example of a risk assessment they carried out.",
    },
    {
      areaCode: "COMM",
      areaSv: "Kommunikation",
      areaEn: "Communication",
      focus: "confirm_strength",
      whySv: "Området var starkt och är värt att bekräfta.",
      whyEn: "The area was strong and is worth confirming.",
      followupSv: "Låt personen beskriva en svår avstämning.",
      followupEn: "Have them describe a difficult handover.",
    },
  ],
};

const base: ContextInput = {
  candidateName: "Anna Lind",
  application: {
    status: "in_review",
    appliedAt: "2026-08-01T09:00:00Z",
    coverNote: "Jag söker rollen därför att …",
    jobTitleSv: "Säkerhetssamordnare",
    jobTitleEn: "Security Coordinator",
  },
  job,
  cv: cqrityjobCv,
  assessment,
  assessmentPending: false,
};

/* ================================================================== */
/* A · A case created from an application inherits its context         */
/* ================================================================== */

const full = buildInterviewContext(base);

ok(full.linked, "A · a case with an application produces a linked context");
ok(full.candidateName === "Anna Lind", "A · the candidate is carried through");
ok(full.appliedAt === "2026-08-01T09:00:00Z", "A · the application date is carried through");
ok(full.applicationStatus === "in_review", "A · the application status is carried through");

/* ================================================================== */
/* B · The job and its requirements are visible                        */
/* ================================================================== */

ok(full.roleSv === "Säkerhetssamordnare", "B · the role title is present in Swedish");
ok(full.roleEn === "Security Coordinator", "B · the role title is present in English");

const reqText = full.requirements.map((r) => r.sv);
ok(
  reqText.includes("Erfarenhet av incidenthantering"),
  "B · an advert requirement reaches the briefing",
);
ok(reqText.includes("SSG Entre"), "B · a formal requirement reaches the briefing");
ok(
  reqText.some((r) => r.includes("sv, en")),
  "B · language requirements are collapsed into one readable line",
);
ok(
  full.requirements.every((r) => r.from === "job"),
  "B · every requirement is attributed to the advert",
);

/* ================================================================== */
/* C · The submitted CQrityjob CV is visible                           */
/* ================================================================== */

const cvFacts = full.known.filter((f) => f.from === "cqrityjob_cv");
ok(cvFacts.length >= 3, "C · CV headline, employment and credential all reach the briefing");
ok(
  cvFacts.some((f) => f.sv.includes("Skyddsvakt") && f.sv.includes("Nordic Security AB")),
  "C · an employment renders as role, employer and dates",
);
ok(
  cvFacts.some((f) => f.sv.includes("Skyddsvaktsutbildning") && f.verified === true),
  "C · the CV's own verification mark is carried, not recomputed",
);
ok(full.cvPresence === "cqrityjob_cv", "C · the CV's origin is stated");

// The candidate's cover note is application material, not CV material, and is
// attributed accordingly — a recruiter checking a claim must be sent to the
// right document.
ok(
  full.known.some((f) => f.key === "cover-note" && f.from === "application"),
  "C · the cover note is attributed to the application",
);

/* ================================================================== */
/* D · An external (uploaded) CV does not break the context            */
/* ================================================================== */

const external = buildInterviewContext({
  ...base,
  cv: { presence: "external", submittedAt: "2026-08-01T09:00:00Z", document: null },
});

ok(external.linked, "D · an uploaded CV still produces a linked context");
ok(external.cvPresence === "external", "D · an uploaded CV is named as what it is");
ok(external.requirements.length > 0, "D · the role requirements survive an external CV");
ok(
  external.followUps.length === full.followUps.length,
  "D · follow-up areas do not depend on having a CQrityjob CV",
);
ok(
  external.known.every((f) => f.from !== "cqrityjob_cv"),
  "D · nothing is invented from a CV that was never parsed",
);

// A CV we failed to read is NOT a candidate who applied without one.
const unreadable = buildInterviewContext({
  ...base,
  cv: { presence: "unreadable", submittedAt: "2026-08-01T09:00:00Z", document: null },
});
ok(unreadable.cvPresence === "unreadable", "D · an unreadable CV is distinct from no CV");

/* ================================================================== */
/* E · A released assessment brief appears                             */
/* ================================================================== */

ok(full.assessmentReleasedAt === "2026-08-20T12:00:00Z", "E · the release date is stated");

const assessmentFollowUps = full.followUps.filter((f) => f.from === "assessment");
ok(assessmentFollowUps.length === 2, "E · both governed guide entries reach the briefing");

// The AREA leads and the brief's prompt is subordinate to it. The prompt is
// phrased as a question, and leading with it would put a second set of
// interview questions beside the pinned pack's governed Q1–Q8.
ok(
  assessmentFollowUps.every((f) => !/\?$/.test(f.sv.trim())),
  "E · the headline of a follow-up is an area, never a question",
);
ok(
  assessmentFollowUps.some((f) => f.sv === "Riskbedömning"),
  "E · the area's own name is the headline",
);
ok(
  assessmentFollowUps.some((f) => (f.suggestionSv ?? "").includes("konkret exempel")),
  "E · the guide's own follow-up wording is reused verbatim, as a suggestion",
);

// One entry per area and reason, not per prompt: the guide can carry several
// prompts for one competency, and repeating the area for each is the raw
// source data this panel exists to spare the reader.
const dupes = buildInterviewContext({
  ...base,
  assessment: {
    ...assessment,
    guide: [assessment.guide[0], { ...assessment.guide[0] }, assessment.guide[1]],
  },
}).followUps.filter((f) => f.from === "assessment");
ok(
  dupes.length === 2,
  `E · repeated prompts for one area collapse to one line (got ${dupes.length})`,
);
ok(
  assessmentFollowUps.every((f) => (f.whySv ?? "") !== ""),
  "E · every assessment follow-up carries the brief's reason for it",
);
ok(
  full.known.some((f) => f.from === "assessment" && f.sv.includes("strukturerad genomgång")),
  "E · an observed behaviour reaches 'what we already know'",
);

// The brief's OWN classification decides the label, and only
// explore_limited_evidence may be called limited evidence. explore_development
// describes the person's answers, not the quantity of evidence, and must not
// be relabelled into a neutral-sounding bucket.
ok(
  full.followUps.filter((f) => f.reason === "limited_evidence").length === 1,
  "E · only the brief's own limited-evidence finding is labelled as such",
);
ok(
  full.followUps.some(
    (f) => f.reason === "assessment_follow_up" && (f.suggestionSv ?? "").includes("avstämning"),
  ),
  "E · a confirm-strength entry is a follow-up, never a limited-evidence claim",
);

const development = buildInterviewContext({
  ...base,
  assessment: {
    ...assessment,
    guide: [{ ...assessment.guide[0], focus: "explore_development" }],
  },
});
ok(
  development.followUps.filter((f) => f.reason === "limited_evidence").length === 0,
  "E · explore_development is never relabelled as limited evidence",
);

// An unrecognised focus is dropped rather than defaulted: a governed prompt
// under a heading nobody chose for it is worse than one prompt fewer.
const unknownFocus = buildInterviewContext({
  ...base,
  assessment: { ...assessment, guide: [{ ...assessment.guide[0], focus: "invented_focus" }] },
});
ok(
  unknownFocus.followUps.every((f) => f.from !== "assessment"),
  "E · an unrecognised guide focus is dropped, not defaulted into a bucket",
);

/* ================================================================== */
/* F · No assessment — the interview still works                       */
/* ================================================================== */

const noAssessment = buildInterviewContext({ ...base, assessment: null });

ok(noAssessment.linked, "F · a case with no assessment still produces a linked context");
ok(noAssessment.assessmentReleasedAt === null, "F · no release date is claimed");
ok(
  noAssessment.followUps.every((f) => f.reason === "requirement_to_cover"),
  "F · the advert's requirements still give the recruiter somewhere to start",
);
ok(noAssessment.requirements.length > 0, "F · role requirements are unaffected");
ok(noAssessment.known.length > 0, "F · candidate material is unaffected");

// The neutral state must be a real sentence in both languages, and must not
// imply the candidate failed to do something.
for (const lang of ["sv", "en"] as const) {
  const copy = dictionaries[lang]["iic.assessment.none"] as string;
  ok(copy.length > 10, `F · a truthful no-assessment state exists in ${lang}`);
}

/* ================================================================== */
/* G · An unreleased assessment is not exposed                         */
/* ================================================================== */

const pending = buildInterviewContext({ ...base, assessment: null, assessmentPending: true });
ok(pending.assessmentPending, "G · a pending assessment is reported as pending");
ok(pending.assessmentReleasedAt === null, "G · a pending assessment has no release date");
ok(
  pending.followUps.every((f) => f.from !== "assessment"),
  "G · nothing from an unreleased assessment reaches the briefing",
);

// The structural half: release is the gate because an employer-audience
// snapshot only EXISTS once the report is released. The read must therefore be
// pinned to audience 'employer', and must select the brief rather than the
// internal payload.
const fnSource = codeOnly(read(FUNCTIONS));
ok(
  /\.eq\(\s*"audience"\s*,\s*"employer"\s*\)/.test(fnSource),
  "G · the snapshot read is pinned to the employer audience",
);
ok(
  /released_at/.test(fnSource),
  "G · the attempt list is filtered on release rather than on availability alone",
);

/* ================================================================== */
/* H · Internal reviewer notes and scoring mechanics never appear      */
/* ================================================================== */

const BRIDGE_FILES = [CONTEXT, FUNCTIONS, PANEL];

// `derivation_input` holds the internal maturity a state was derived from and
// exists for reproducibility, not for a reader. `payload` is the full
// competency report. Neither is selected, and not selecting them is what makes
// them unable to leak.
for (const forbidden of ["derivation_input", "scoring_rationale", "is_best_key", "score_value"]) {
  for (const file of BRIDGE_FILES) {
    ok(
      !codeOnly(read(file)).includes(forbidden),
      `H · ${path.basename(file)} does not read ${forbidden}`,
    );
  }
}

ok(
  !/scp_review|reviewer_note|internal_note/.test(fnSource),
  "H · the bridge reads no reviewer-facing table",
);
ok(
  /\.select\(\s*"released_at,\s*brief"\s*\)/.test(fnSource),
  "H · the snapshot read selects only the released brief, by name",
);

/* ================================================================== */
/* I · Passport material not disclosed to the application never appears */
/* ================================================================== */

// The same access routes scripts/passport-separation-check.ts closes on the
// applications surfaces, applied to this one.
//
// That guard's RECRUITMENT_SURFACES list is scoped to `applications*` routes,
// so the interview bridge — which reaches the same candidate through a
// different door — is outside it. Restating the rule here is not duplication:
// the bridge is a NEW route from an employer to a named candidate's material,
// and a route nobody checks is how the ban is eventually lost.
//
// The rule is about ACCESS, not vocabulary. `\bdisclosure\b` is deliberately
// NOT among these: the panel imports an accordion primitive called
// `Disclosure` from the interview layout, and banning the word would fail on a
// UI component while proving nothing about Passport data.
const PASSPORT_ACCESS: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /security-passport/, why: "a Security Passport module" },
  { pattern: /\bsp_[a-z_]+/, why: "a Passport table or function" },
  { pattern: /getPublicDisclosure|sp_get_disclosure/, why: "the disclosure boundary" },
  { pattern: /DisclosurePackage/, why: "a disclosure payload" },
  { pattern: /getMyPassport|passport_disclosure/, why: "a Passport read" },
];

for (const file of BRIDGE_FILES) {
  const body = codeOnly(read(file));
  for (const { pattern, why } of PASSPORT_ACCESS) {
    ok(!pattern.test(body), `I · ${path.basename(file)} reaches ${why}`);
  }
}
// cv_documents is the candidate's own library and has no employer read policy.
// The bridge reads the COPY frozen onto the application, never the library.
ok(!/cv_documents/.test(fnSource), "I · the bridge never reaches into cv_documents");
ok(
  fnSource.includes("getApplicationSubmittedCv"),
  "I · the CV comes from the employer's existing authorised read",
);

/* ================================================================== */
/* J · Cross-tenant access is structurally impossible                  */
/* ================================================================== */

// No service-role client anywhere in the bridge: one would be a general bypass
// of the tenant isolation every other read here depends on.
for (const file of [CONTEXT, FUNCTIONS]) {
  ok(
    !/service_role|serviceRole|SERVICE_ROLE/.test(codeOnly(read(file))),
    `J · ${path.basename(file)} holds no service-role client`,
  );
}

// The case read is the gate, and every downstream id comes from the row it
// returned rather than from the request.
ok(
  /from\("scp_interview_cases"\)[\s\S]{0,400}?\.eq\("id",\s*data\.caseId\)/.test(fnSource),
  "J · the case is read under the caller's own RLS before anything else happens",
);
ok(
  /const applicationId = str\(c\.application_id\)/.test(fnSource),
  "J · the application id is taken from the case row, never from the caller",
);
ok(
  /const jobId = str\(a\.job_id\)/.test(fnSource),
  "J · the job id is taken from the application, never from the caller",
);
ok(
  /\.eq\("employer_id",\s*employerId\)/.test(fnSource),
  "J · the advert read is additionally filtered by the case's employer",
);

/* ================================================================== */
/* K · Repeated action does not duplicate an interview case            */
/* ================================================================== */

const appSource = read(APPLICATION);
// The hub offers "start an interview" only when the application has none, and
// lists the existing cases with an "open" link otherwise. There is therefore no
// screen state in which the create action and an existing case coexist.
ok(
  /interviewCases\.length === 0 \? \(/.test(codeOnly(appSource)),
  "K · the start action renders only when the application has no interview case",
);
ok(
  appSource.includes("interview-intelligence/$caseId/prepare"),
  "K · an existing case is opened rather than recreated",
);
ok(
  appSource.includes("interview-intelligence/$caseId/report"),
  "K · a finished case opens its report rather than starting a new interview",
);

/* ================================================================== */
/* L · A completed report does not mutate with live candidate context  */
/* ================================================================== */

// The bridge is a read. It writes nothing, anywhere.
for (const file of [CONTEXT, FUNCTIONS]) {
  const body = codeOnly(read(file));
  ok(
    !/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(body),
    `L · ${path.basename(file)} performs no write`,
  );
}
ok(
  !/method:\s*"POST"[\s\S]*?scp_iv_/.test(fnSource),
  "L · the bridge calls no interview mutation RPC",
);

// And it is not wired into the report. A report is a frozen payload built from
// confirmed evidence and attached sources; a live context read reaching it is
// exactly how a finished interview would start saying something new.
const reportRoute =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
ok(
  !codeOnly(read(reportRoute)).includes("getInterviewCaseContext"),
  "L · the report screen does not read live recruitment context",
);
ok(
  codeOnly(read(PREPARE)).includes("getInterviewCaseContext"),
  "L · the briefing is on the preparation screen, where current material belongs",
);

// The panel says so in words, in both languages, because a reader cannot see
// the wiring.
for (const lang of ["sv", "en"] as const) {
  ok(
    (dictionaries[lang]["iic.footnote"] as string).length > 60,
    `L · the panel states that it is current material and not the record (${lang})`,
  );
}

/* ================================================================== */
/* M · No suitability, ranking, scoring or hire/reject output          */
/* ================================================================== */

// The vocabulary that would mean this PR had grown a decision engine. Checked
// against code AND against the copy, because a product expresses a judgement
// through its words at least as readily as through its types.
const BANNED = [
  "suitability",
  "suitable",
  "lämplighetsbedömning",
  "rangordn",
  "ranking",
  "shortlist",
  "fitScore",
  "fit_score",
  "matchScore",
  "match_score",
  "overallScore",
  "recommendHire",
  "hireRecommendation",
  "rekommenderar anställning",
  "percentageFit",
];

for (const file of BRIDGE_FILES) {
  const body = codeOnly(read(file)).toLowerCase();
  for (const word of BANNED) {
    ok(!body.includes(word.toLowerCase()), `M · ${path.basename(file)} does not contain "${word}"`);
  }
}

// The copy this PR added, in both languages — sentence by sentence, and with
// negations allowed.
//
// A blunt substring check fails the copy that matters MOST here: "det är inte
// en rangordning" / "this is not a ranking" is the sentence doing the work,
// and a guard that forbids it would push the product towards saying nothing
// about ranking at all, which is how a reader concludes there is one. So the
// rule is that the product may DENY a judgement and may not MAKE one, and a
// sentence carrying a negation is read as the former.
const NEGATIONS = ["inte", "aldrig", "ingen", "inga", "not ", "never", "no ", "without"];

for (const lang of ["sv", "en"] as const) {
  const sentences = Object.entries(dictionaries[lang])
    .filter(([k]) => k.startsWith("iic."))
    .flatMap(([, v]) => String(v).split(/(?<=[.!?])\s+/))
    .map((s) => s.toLowerCase());

  for (const word of BANNED) {
    const offending = sentences.filter(
      (s) => s.includes(word.toLowerCase()) && !NEGATIONS.some((n) => s.includes(n)),
    );
    ok(
      offending.length === 0,
      `M · the ${lang} briefing copy only ever denies "${word}"` +
        (offending.length > 0 ? ` — found: "${offending[0].slice(0, 70)}"` : ""),
    );
  }
}

// And the denial is actually present rather than merely permitted: the panel
// states in both languages that it is not an assessment of the candidate.
for (const lang of ["sv", "en"] as const) {
  const note = String(dictionaries[lang]["iic.explore.note"]).toLowerCase();
  ok(
    NEGATIONS.some((n) => note.includes(n)),
    `M · the ${lang} follow-up section says what it is not`,
  );
}

// The derived model carries no numeric judgement of the person at all: the
// only numbers anywhere in it would be dates.
const serialised = JSON.stringify(full);
ok(
  !/"(score|level|rank|percent|percentage|total|average|mean)"\s*:/.test(serialised),
  "M · the derived context carries no score, level, rank or aggregate field",
);

// And the follow-up reasons remain exactly the three that were argued for.
// A fourth arriving without this guard being updated is how a neutral surface
// acquires a judgemental bucket.
const reasons = new Set(full.followUps.map((f) => f.reason));
for (const r of reasons) {
  ok(
    ["assessment_follow_up", "limited_evidence", "requirement_to_cover"].includes(r),
    `M · "${r}" is one of the three argued follow-up reasons`,
  );
}

/* ================================================================== */
/* N · SV / EN parity                                                  */
/* ================================================================== */

const svKeys = Object.keys(dictionaries.sv).filter((k) => k.startsWith("iic."));
const enKeys = Object.keys(dictionaries.en).filter((k) => k.startsWith("iic."));

ok(svKeys.length > 0, "N · the briefing has Swedish copy");
ok(
  svKeys.length === enKeys.length,
  `N · same key count (sv ${svKeys.length}, en ${enKeys.length})`,
);

for (const key of svKeys) {
  ok(enKeys.includes(key), `N · ${key} exists in English`);
}
for (const key of enKeys) {
  ok(svKeys.includes(key), `N · ${key} exists in Swedish`);
}

// A key present but empty is a parity failure that a key-count check misses.
for (const lang of ["sv", "en"] as const) {
  for (const key of Object.keys(dictionaries[lang]).filter((k) => k.startsWith("iic."))) {
    const value = String((dictionaries[lang] as Record<string, unknown>)[key] ?? "");
    ok(value.trim() !== "", `N · ${key} is non-empty in ${lang}`);
  }
}

// The form error that was a hardcoded Swedish string on a translated screen.
ok(
  dictionaries.en["iiu.new.err.candidate"] !== dictionaries.sv["iiu.new.err.candidate"],
  "N · the new-interview candidate error is genuinely translated",
);
ok(
  !codeOnly(read(NEW_CASE)).includes("Ange kandidatens namn"),
  "N · the new-interview form carries no hardcoded Swedish message",
);

// No raw enum reaches a surface: every source and reason is rendered through a
// dictionary key rather than printed.
const panelSource = codeOnly(read(PANEL));
// The ContextSource and FollowUpReason values. Deliberately not every enum in
// the file: `cvPresence` values appear inside translation KEY names
// ("iic.cv.unreadable"), which is a reference to translated copy and the
// opposite of the problem this checks for.
// Counting occurrences and excusing the ones that "look like code" is the
// wrong shape for this check: every excuse widens it, and an excuse for quoted
// literals excuses `{cond ? "requirement_to_cover" : t(...)}` too — which was
// exactly the mutation that slipped through while this was written that way.
//
// So it asserts the FAILURE MODE directly. A raw enum reaches a recruiter one
// way: a JSX interpolation that renders the field instead of looking it up.
// The lookbehind excludes ATTRIBUTE positions: `from={f.from}` passes the
// value to a component that will look it up, which is the correct pattern and
// the one the panel actually uses. What is banned is the same braces in a TEXT
// position, where whatever is inside them lands on the screen verbatim.
const RAW_ENUM_FIELDS = /(?<!=)\{[^{}]*\.(reason|from|cvPresence|applicationStatus)\s*\}/g;
const rendered = panelSource.match(RAW_ENUM_FIELDS) ?? [];
ok(
  rendered.length === 0,
  `N · the panel renders no enum field directly (found ${rendered.join(", ")})`,
);

// And a bare enum literal must never sit in a JSX text position either.
const ENUM_VALUES = [
  "cqrityjob_cv",
  "requirement_to_cover",
  "assessment_follow_up",
  "limited_evidence",
];
for (const raw of ENUM_VALUES) {
  const inJsxText = new RegExp(`\\{[^{}]*["']${raw}["'][^{}]*\\}(?!\\s*[,;)])`, "g");
  const hits = panelSource.match(inJsxText) ?? [];
  ok(
    hits.length === 0,
    `N · ${raw} never appears in a JSX text position (found ${hits.join(", ")})`,
  );
}
ok(
  /SOURCE_LABEL\[/.test(panelSource) && /REASON_LABEL\[/.test(panelSource),
  "N · sources and reasons are rendered through translation tables",
);

/* ================================================================== */
/* Supporting behaviour                                                */
/* ================================================================== */

// An unlinked case is a first-class state, not an error: an employer may
// interview for a role that was never advertised.
const unlinked = buildInterviewContext({ ...base, application: null });
ok(!unlinked.linked, "· a case with no application produces an unlinked context");
ok(unlinked.requirements.length === 0, "· an unlinked context asserts no requirements");
ok(unlinked.followUps.length === 0, "· an unlinked context asserts no follow-ups");
ok(unlinkedContext("X").candidateName === "X", "· the unlinked context still names the candidate");

// jobs.requirements is jsonb written by importers of several generations.
ok(normaliseRequirements(["a", "b"]).length === 2, "· a string array normalises");
ok(normaliseRequirements([{ text: "a" }])[0] === "a", "· a {text} object normalises");
ok(normaliseRequirements([{ sv: "a", en: "b" }])[0] === "a", "· a {sv,en} object normalises");
ok(normaliseRequirements([{ nope: 1 }]).length === 0, "· an unknown shape yields nothing");
ok(normaliseRequirements(null).length === 0, "· null yields nothing");
ok(normaliseRequirements("  ").length === 0, "· whitespace yields nothing");
ok(
  !normaliseRequirements([{ nope: 1 }]).some((r) => r.includes("object")),
  "· an unknown shape never renders as [object Object]",
);

/* ================================================================== */

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
