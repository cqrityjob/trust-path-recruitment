// The Interview Context Bridge — what CQrityjob already knows, arranged for
// the person about to conduct the interview.
//
// ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────
//
// scp_interview_cases has carried job_id, application_id and candidate_user_id
// since the runtime migration. The read path never selected them. So a case
// created FROM an application arrived at the preparation screen knowing only
// its own title and a candidate's display name, and the recruiter — who had
// just come from a page showing the advert, the cover note, the submitted CV
// and a released assessment — was asked to paste all of it back in by hand.
//
// Nothing was missing from the database. The join was missing from the read.
//
// ── WHAT THIS FILE IS, AND WHAT IT IS NOT ───────────────────────────────
//
// It is a PROJECTION. Every line it produces is quoted or restated from a
// record the employer is already authorised to read, and every line carries
// the source it came from so the recruiter can go and look. It derives no new
// facts about the candidate.
//
// It is not an analysis. There is deliberately no matching of CV text against
// requirement text, because a matcher is a scorer wearing different clothes:
// the moment "this requirement has no matching CV line" becomes computable,
// the count of such requirements becomes a fit percentage, and nobody has to
// write the word "suitability" for the product to start expressing one.
//
// So the three follow-up buckets below are each traceable to an authored
// source, and none of them is computed by comparing the candidate to the role:
//
//   assessment_follow_up   an entry of the released brief's OWN interview
//                          guide, whose wording comes from
//                          scp_interview_guide_prompts at content_status
//                          'published' — governed content, authored once and
//                          selected here, never generated
//   limited_evidence       the same guide, for an area the brief itself
//                          classified `explore_limited_evidence`
//   requirement_to_cover   a requirement the advert states, listed neutrally
//                          as ground the conversation has to cover
//
// That the first two are SELECTED from published prompts rather than written
// here is the whole safety argument for them. 20260830093000 already decided
// which prompt belongs to which finding, and re-deciding it in TypeScript
// would put an ungoverned second opinion beside a governed first one.
//
// Each carries the guide's own `why`, because the recruiter's real question is
// not "what should I ask" but "why does this matter here" — and the brief has
// already answered it in reviewed language.
//
// A `limited_evidence` area is a statement about how much evidence exists. It
// is not a statement about the person. The copy that renders it says so.
//
// ── CURRENT CONTEXT vs THE INTERVIEW RECORD ─────────────────────────────
//
// This model is CURRENT RECRUITMENT CONTEXT: read live, on every render, and
// never written anywhere. It is briefing material.
//
// The INTERVIEW RECORD is the other thing entirely — scp_interview_case_sources
// and the immutable passages under it, and ultimately the frozen report
// payload. When a recruiter decides a piece of this context should become
// evidence the interview reasons about, they attach it, and attaching copies
// it into a passage that can never change afterwards.
//
// The boundary is the point. A completed report must not start saying
// something different because the candidate edited their CV in March.

import type { CvDocument } from "@/lib/professional-identity/cv/document";

export const CONTEXT_BRIDGE_VERSION = "icb-v1" as const;

/** Where a line came from, in the recruiter's words rather than the
 *  database's. Table names, RPC names and snapshot ids are deliberately
 *  absent: provenance a reader cannot act on is decoration. */
export type ContextSource = "application" | "job" | "cqrityjob_cv" | "assessment";

/** One thing already known, ready to render. `sv`/`en` are carried together
 *  rather than resolved here so a single derivation serves both surfaces and
 *  the two can never drift apart. */
export interface ContextFact {
  readonly key: string;
  readonly sv: string;
  readonly en: string;
  readonly from: ContextSource;
  /** A candidate-declared statement is not a verified one. Carried through so
   *  the surface can keep the distinction the CV itself keeps. */
  readonly verified?: boolean;
}

export type FollowUpReason = "assessment_follow_up" | "limited_evidence" | "requirement_to_cover";

export interface FollowUpArea {
  readonly key: string;
  /** The AREA — what to explore. This is the headline, deliberately: the
   *  brief's own follow-up wording is phrased as a question, and leading with
   *  it would put a second set of interview questions beside the pinned pack's
   *  governed Q1–Q8. An area is not a question and cannot compete with one. */
  readonly sv: string;
  readonly en: string;
  readonly from: ContextSource;
  readonly reason: FollowUpReason;
  /** The governed brief's own explanation of why this area matters, when the
   *  area came from one. Null for a requirement, whose reason for being there
   *  is that the advert asks for it. */
  readonly whySv?: string | null;
  readonly whyEn?: string | null;
  /** The published prompt the brief selected for this finding, offered
   *  SUBORDINATE to the area and labelled as a suggestion. Reused rather than
   *  written, per the instruction to reuse contextual follow-ups that already
   *  exist — and kept below the area so the governed pack stays the authority
   *  on what is actually asked. */
  readonly suggestionSv?: string | null;
  readonly suggestionEn?: string | null;
}

/** How the candidate's CV reached this application. `external` is a complete,
 *  supported answer, not a degraded one: the interview does not require a
 *  CQrityjob CV and must not imply that it does. */
export type CvPresence = "cqrityjob_cv" | "external" | "unreadable" | "none";

/* ------------------------------------------------------------------ */
/* How each source read went, and how the case read went               */
/* ------------------------------------------------------------------ */
//
// ── THE DEFECT THIS SECTION EXISTS BECAUSE OF ───────────────────────────
//
// This model had ONE field for the whole question -- `linked: boolean` -- and
// the read that filled it answered five materially different situations with
// the same two values:
//
//   the case names no application            -> linked: false
//   the case names one and it cannot be read -> linked: false   ← WRONG
//   the advert read failed                   -> requirements: []
//   the advert read was refused              -> requirements: []
//   the assessment read failed               -> assessmentPending: false
//
// Every one of those is the same defect wearing a different hat: a read that
// did not succeed rendered as a fact about the world. The second is the worst,
// because it is not merely an omission -- it is an ASSERTION. A recruiter
// preparing for an interview with an application behind it was told, in the
// product's own words, that this was a standalone interview with no advertised
// role. They then prepared for a conversation about a role the system had, and
// had simply failed to fetch.
//
// So every source carries how its own read went, and there is no code path
// that turns a failure into an absence. The three unhappy members are distinct
// on purpose: "refused" is a permission answer a recruiter can act on (ask an
// admin), "failed" is a transient one they can retry, and "absent" is the only
// one that is a statement about the world.

/** How ONE source read went. */
export type SourceRead =
  /** Read, and there is something there. */
  | "ok"
  /** Read, and there is genuinely nothing. The ONLY member that asserts
   *  anything about the world. */
  | "absent"
  /** The database refused this caller. Not an absence: somebody else can see
   *  it, and the surface says so rather than implying it does not exist. */
  | "refused"
  /** The read broke. Nothing is known either way, and the surface must not
   *  pretend otherwise. */
  | "failed";

/** Whether this interview belongs to an application, as three answers.
 *
 *  `standalone` is a real, supported, first-class case -- an employer may
 *  interview for a role with no advert -- and it must never be reachable by
 *  accident, which is exactly what `linkedUnreadable` exists to prevent. */
export type LinkState =
  /** The case names no application. Nothing failed; there is nothing to link. */
  | "standalone"
  /** The case names an application and it was read. */
  | "linked"
  /** The case names an application and the read did NOT succeed. The
   *  identifier is known; the record behind it is not. Everything downstream
   *  of it is unavailable rather than empty. */
  | "linkedUnreadable";

/** How each source of this briefing read. Never inferred from whether its
 *  content is empty: an advert with no stated requirements and an advert
 *  nobody could fetch produce the same empty list and are not the same fact. */
export interface ContextReads {
  readonly application: SourceRead;
  readonly job: SourceRead;
  readonly cv: SourceRead;
  readonly assessment: SourceRead;
}

/**
 * The whole answer to "what does CQrityjob hold about this interview".
 *
 * A union rather than a nullable context, because the four unhappy answers are
 * not degraded contexts -- they are the absence of one, and each needs its own
 * sentence. `getInterviewCaseContext` used to THROW for three of them, with
 * three different `Error` messages that the three consuming screens then
 * pattern-matched on by substring.
 */
export type InterviewContextResult =
  | { readonly kind: "context"; readonly context: InterviewContext }
  /**
   * The case row came back empty.
   *
   * "Not there" and "not yours" are ONE answer here and that is deliberate:
   * `scp_interview_cases` is under RLS, so a case belonging to another
   * employer returns no row exactly as a deleted one does. Distinguishing them
   * would mean telling a stranger that a case exists, which is the thing RLS
   * is preventing. The member is named for what is actually known.
   */
  | { readonly kind: "caseNotFoundOrRefused" }
  /** The case read itself broke. Nothing is known about the case at all --
   *  including whether it exists. */
  | { readonly kind: "caseReadFailed" };

export interface InterviewContext {
  readonly version: typeof CONTEXT_BRIDGE_VERSION;
  /** Whether this interview belongs to an application, in three answers.
   *
   *  This was `linked: boolean`, and the boolean was the defect: an
   *  application that could not be READ produced `false`, which every surface
   *  rendered as "standalone interview, no advertised role" -- an assertion,
   *  about a case that had an application all along. */
  readonly link: LinkState;
  /** How each source read. Carried beside the content, never derived from it. */
  readonly reads: ContextReads;

  readonly candidateName: string;
  readonly roleSv: string | null;
  readonly roleEn: string | null;
  readonly applicationStatus: string | null;
  readonly appliedAt: string | null;

  readonly cvPresence: CvPresence;
  readonly cvSubmittedAt: string | null;

  /** Null when no assessment exists for this application, or when one exists
   *  but has not been released. The two are the same answer to an employer:
   *  there is nothing here they may read. */
  readonly assessmentReleasedAt: string | null;
  /** An assessment was assigned and is not readable yet. Distinct from "none":
   *  a recruiter about to interview benefits from knowing one is coming. */
  readonly assessmentPending: boolean;

  readonly requirements: readonly ContextFact[];
  readonly known: readonly ContextFact[];
  readonly followUps: readonly FollowUpArea[];
}

// ── INPUTS ────────────────────────────────────────────────────────────────
//
// Plain data, so the derivation can be exercised without a database. The
// server function that fills these in is the only thing that talks to
// PostgREST, and it reads nothing this file cannot describe.

export interface ContextApplicationInput {
  readonly status: string;
  readonly appliedAt: string;
  readonly coverNote: string | null;
  readonly jobTitleSv: string | null;
  readonly jobTitleEn: string | null;
}

/** The advert's own words. Read from `jobs`, which already holds structured
 *  requirements — this PR does not invent a Role Profile system beside it. */
export interface ContextJobInput {
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  /** `jobs.requirements` is jsonb and has been written by several importers
   *  over the project's life. Normalised to strings before it gets here. */
  readonly requirements: readonly string[];
  readonly formalRequirements: readonly string[];
  readonly languageRequirements: readonly string[];
  readonly experienceLevel: string | null;
  readonly regulated: boolean;
  readonly securityVettingMentioned: boolean;
  readonly drivingLicenceRequired: boolean;
}

export interface ContextCvInput {
  readonly presence: CvPresence;
  readonly submittedAt: string | null;
  /** Present only for a CQrityjob CV. An uploaded PDF is a file the employer
   *  downloads; its contents are not parsed here and must not be guessed at. */
  readonly document: CvDocument | null;
}

/** The released employer brief, reduced to the parts intended for an employer
 *  to read. Reviewer-internal notes, scoring mechanics and raw ids are absent
 *  from this type, which is why they cannot reach the surface. */
export interface ContextAssessmentInput {
  readonly releasedAt: string;
  readonly observed: readonly {
    readonly areaSv: string;
    readonly areaEn: string;
    /** `strong | consistent | mixed | developing | limited`, within this one
     *  assessment. Never aggregated, never turned into a total. */
    readonly signal: string;
    readonly behaviourSv: string | null;
    readonly behaviourEn: string | null;
  }[];
  /** The brief's governed interview guide, already ordered by the database in
   *  the order a recruiter with forty minutes should spend them in. Passed
   *  through in that order; this file does not re-sort it. */
  readonly guide: readonly {
    readonly areaCode: string;
    readonly areaSv: string;
    readonly areaEn: string;
    readonly focus: string;
    readonly whySv: string;
    readonly whyEn: string;
    readonly followupSv: string;
    readonly followupEn: string;
  }[];
}

export interface ContextInput {
  readonly candidateName: string;
  readonly application: ContextApplicationInput | null;
  readonly job: ContextJobInput | null;
  readonly cv: ContextCvInput | null;
  readonly assessment: ContextAssessmentInput | null;
  readonly assessmentPending: boolean;
  /** How each of the four reads went.
   *
   *  REQUIRED, with no default. A default would be `"ok"`, and a caller that
   *  forgot to pass one would silently declare a failed read successful --
   *  which is the entire defect this field exists to make impossible. The
   *  compiler asks instead. */
  readonly reads: ContextReads;
}

// ── DERIVATION ────────────────────────────────────────────────────────────

/** The brief's own classification of a guide entry, mapped onto the two
 *  reasons this surface distinguishes. Data rather than a chain of `if`s, so
 *  the whole mapping is readable at once and a new focus value added upstream
 *  fails loudly here instead of silently becoming a follow-up of some kind.
 *
 *  `explore_limited_evidence` is the ONLY thing that may be labelled limited
 *  evidence. `explore_development` sounds like it should qualify and must not:
 *  the brief uses it for an area with mixed or developing signal, which is a
 *  statement about the person's answers, not about how much evidence exists,
 *  and relabelling it would put a judgement under a neutral heading. */
const GUIDE_FOCUS_REASON: Record<string, FollowUpReason> = {
  explore_limited_evidence: "limited_evidence",
  explore_development: "assessment_follow_up",
  explore_self_report: "assessment_follow_up",
  confirm_strength: "assessment_follow_up",
};

/** How many CV entries reach the briefing. A CV is a document the recruiter
 *  can open in full; restating twenty roles here buries the three things they
 *  needed to see. The surface says when it has trimmed. */
export const CV_FACT_LIMIT = 6;

const clean = (s: string | null | undefined): string => (s ?? "").trim();

function dateOnly(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/** An employment, as one line, in the CV's own words. Nothing is inferred:
 *  employer, role and dates are the source bundle's and the model never
 *  touched them. */
function employmentLine(e: {
  employerName: string;
  roleTitle: string;
  startedOn: string;
  endedOn: string | null;
}): string {
  const from = dateOnly(e.startedOn) ?? "";
  const to = dateOnly(e.endedOn);
  const span = to ? `${from} – ${to}` : `${from} –`;
  return `${clean(e.roleTitle)}, ${clean(e.employerName)} (${span})`;
}

function jobRequirementFacts(job: ContextJobInput): ContextFact[] {
  const out: ContextFact[] = [];
  job.requirements.forEach((r, i) => {
    const text = clean(r);
    if (text !== "") out.push({ key: `req-${i}`, sv: text, en: text, from: "job" });
  });
  job.formalRequirements.forEach((r, i) => {
    const text = clean(r);
    if (text !== "") out.push({ key: `formal-${i}`, sv: text, en: text, from: "job" });
  });
  if (job.languageRequirements.length > 0) {
    const text = job.languageRequirements.map(clean).filter(Boolean).join(", ");
    if (text !== "")
      out.push({
        key: "lang",
        sv: `Språk: ${text}`,
        en: `Languages: ${text}`,
        from: "job",
      });
  }
  if (job.drivingLicenceRequired)
    out.push({
      key: "licence",
      sv: "Körkort krävs.",
      en: "Driving licence required.",
      from: "job",
    });
  if (job.securityVettingMentioned)
    out.push({
      key: "vetting",
      sv: "Säkerhetsprövning nämns i annonsen.",
      en: "Security vetting is mentioned in the advert.",
      from: "job",
    });
  if (job.regulated)
    out.push({
      key: "regulated",
      sv: "Rollen är reglerad.",
      en: "This is a regulated role.",
      from: "job",
    });
  return out;
}

/** What the candidate has already told this employer, restated. Everything
 *  here is candidate-declared unless the CV's own verification mark says
 *  otherwise, and that mark is carried through rather than recomputed. */
function candidateFacts(
  application: ContextApplicationInput | null,
  cv: ContextCvInput | null,
): ContextFact[] {
  const out: ContextFact[] = [];

  const note = clean(application?.coverNote);
  if (note !== "") out.push({ key: "cover-note", sv: note, en: note, from: "application" });

  const doc = cv?.document ?? null;
  if (!doc) return out;

  const headline = clean(doc.headline);
  if (headline !== "")
    out.push({ key: "cv-headline", sv: headline, en: headline, from: "cqrityjob_cv" });

  for (const section of doc.experience.slice(0, CV_FACT_LIMIT)) {
    const line = employmentLine(section.fact);
    out.push({ key: `cv-exp-${section.fact.id}`, sv: line, en: line, from: "cqrityjob_cv" });
  }

  for (const c of [...doc.credentials, ...doc.education].slice(0, CV_FACT_LIMIT)) {
    const title = clean(c.title);
    if (title === "") continue;
    const issuer = clean(c.issuerName);
    const line = issuer === "" ? title : `${title} — ${issuer}`;
    // NO `verified` HERE ANY MORE, and it is not an omission.
    //
    // It used to read a boolean frozen into the submitted CV's bundle at
    // save time. That flag is gone: it was a display decision with no date on
    // it, and a saved CV was found still printing "Verified" after the
    // credential behind it had been revoked. An interviewer reading a
    // months-old copy is exactly the reader who would be misled by it.
    //
    // Verified standing reaches a recruiter the one way it should: through
    // the holder-authorised, application-scoped Passport disclosure, which is
    // live and logged. `verified` stays on ContextFact for the sources that
    // genuinely have a current answer.
    out.push({
      key: `cv-claim-${c.id}`,
      sv: line,
      en: line,
      from: "cqrityjob_cv",
    });
  }

  return out;
}

/** What the released assessment already observed. Restated per area, always
 *  next to the area's own name, and never summed. */
function assessmentFacts(a: ContextAssessmentInput): ContextFact[] {
  const out: ContextFact[] = [];
  a.observed.forEach((o, i) => {
    // The behaviour statement when the brief wrote one, the area name
    // otherwise. An area with neither is skipped rather than rendered as an
    // empty bullet with a source tag beside it.
    const sv = clean(o.behaviourSv) || clean(o.areaSv);
    const en = clean(o.behaviourEn) || clean(o.areaEn) || sv;
    if (sv === "") return;
    out.push({ key: `obs-${i}`, sv, en, from: "assessment" });
  });
  return out;
}

function followUpAreas(
  job: ContextJobInput | null,
  assessment: ContextAssessmentInput | null,
): FollowUpArea[] {
  const out: FollowUpArea[] = [];

  if (assessment) {
    // The governed guide, in the order the database put it in. Each entry is a
    // published prompt selected by the brief for a finding the brief made;
    // nothing here decides which area deserves attention, only how to say so.
    // One entry per AREA, not per prompt. The guide can carry several prompts
    // for the same competency, and eleven cards that each name the same three
    // areas is not a briefing — it is the raw source data the recruiter was
    // supposed to be spared. The first prompt for an area wins, because the
    // database already ordered the guide by how a recruiter should spend the
    // hour, so "first" means "most worth the time" rather than "arbitrary".
    const seenAreas = new Set<string>();
    assessment.guide.forEach((g, i) => {
      const reason = GUIDE_FOCUS_REASON[g.focus];
      // An unrecognised focus is dropped rather than defaulted. A guess would
      // be a governed prompt shown under a heading nobody chose for it.
      if (!reason) return;
      const sv = clean(g.areaSv);
      const en = clean(g.areaEn) || sv;
      if (sv === "") return;
      // Keyed by area AND reason: the same competency can legitimately appear
      // once as limited evidence and once as a strength worth confirming, and
      // those are different things to tell a recruiter.
      const dedupeKey = `${g.areaCode}|${reason}`;
      if (seenAreas.has(dedupeKey)) return;
      seenAreas.add(dedupeKey);
      out.push({
        key: `guide-${g.areaCode}-${i}`,
        sv,
        en,
        from: "assessment",
        reason,
        whySv: clean(g.whySv) || null,
        whyEn: clean(g.whyEn) || clean(g.whySv) || null,
        suggestionSv: clean(g.followupSv) || null,
        suggestionEn: clean(g.followupEn) || clean(g.followupSv) || null,
      });
    });
  }

  // The advert's requirements, listed as ground to cover. Not compared with
  // anything: an unmatched requirement is a question to ask, not a shortfall
  // to record.
  if (job) {
    jobRequirementFacts(job).forEach((r) => {
      out.push({
        key: `jr-${r.key}`,
        sv: r.sv,
        en: r.en,
        from: "job",
        reason: "requirement_to_cover",
        whySv: null,
        whyEn: null,
        suggestionSv: null,
        suggestionEn: null,
      });
    });
  }

  return out;
}

/** The empty context, with the reason for its emptiness attached.
 *
 *  ── WHY THIS TAKES A LINK STATE ────────────────────────────────────────
 *
 *  There used to be one `unlinkedContext(name)`, and the server function
 *  returned it for TWO situations: a case that names no application, and a
 *  case that names one whose read did not succeed. The first is a supported
 *  product state. The second is an outage, and it was being rendered as the
 *  first -- so a recruiter with an application, an advert and a released
 *  assessment behind their interview was told there was no advertised role.
 *
 *  The two callers now have to say which one they are, and the type will not
 *  let them avoid the question. `standalone` is the only value that produces a
 *  screen asserting there is nothing to link. */
export function emptyContext(
  candidateName: string,
  link: Exclude<LinkState, "linked">,
  reads: ContextReads,
): InterviewContext {
  return {
    version: CONTEXT_BRIDGE_VERSION,
    link,
    reads,
    candidateName,
    roleSv: null,
    roleEn: null,
    applicationStatus: null,
    appliedAt: null,
    // "none" is a CLAIM, and it may only be made when the reads say so. A CV
    // whose read was refused is `unreadable`, which the type already has a
    // word for and which the surface already renders as an absence of
    // knowledge rather than an absence of a document.
    cvPresence: reads.cv === "ok" || reads.cv === "absent" ? "none" : "unreadable",
    cvSubmittedAt: null,
    assessmentReleasedAt: null,
    assessmentPending: false,
    requirements: [],
    known: [],
    followUps: [],
  };
}

/** A case that names no application at all.
 *
 *  Every read is `absent` and none of them failed, which is the whole
 *  difference between this and `linkedUnreadable`: there was nothing to fetch,
 *  so nothing could fail to be fetched. */
export function standaloneContext(candidateName: string): InterviewContext {
  return emptyContext(candidateName, "standalone", {
    application: "absent",
    job: "absent",
    cv: "absent",
    assessment: "absent",
  });
}

export function buildInterviewContext(input: ContextInput): InterviewContext {
  // No application ROW. Which of the two reasons that is comes from the read,
  // never from the absence: `absent` means the case named no application,
  // anything else means it named one nobody could fetch.
  if (!input.application) {
    return input.reads.application === "absent"
      ? standaloneContext(input.candidateName)
      : emptyContext(input.candidateName, "linkedUnreadable", input.reads);
  }

  const { application, job, cv, assessment } = input;

  const known = [
    ...candidateFacts(application, cv),
    ...(assessment ? assessmentFacts(assessment) : []),
  ];

  return {
    version: CONTEXT_BRIDGE_VERSION,
    link: "linked",
    reads: input.reads,
    candidateName: input.candidateName,
    roleSv: clean(job?.titleSv ?? application.jobTitleSv) || null,
    roleEn: clean(job?.titleEn ?? application.jobTitleEn) || null,
    applicationStatus: application.status,
    appliedAt: application.appliedAt,
    cvPresence: cv?.presence ?? "none",
    cvSubmittedAt: cv?.submittedAt ?? null,
    assessmentReleasedAt: assessment?.releasedAt ?? null,
    assessmentPending: input.assessmentPending,
    requirements: job ? jobRequirementFacts(job) : [],
    known,
    followUps: followUpAreas(job, assessment),
  };
}

// ── NORMALISERS ───────────────────────────────────────────────────────────
//
// `jobs.requirements` is jsonb written by importers of several generations.
// Every observed shape is handled and anything else becomes nothing, because
// rendering `[object Object]` into a recruiter's briefing is worse than
// rendering one requirement fewer.

export function normaliseRequirements(value: unknown): string[] {
  if (typeof value === "string") return value.trim() === "" ? [] : [value.trim()];
  if (Array.isArray(value)) return value.flatMap(normaliseRequirements);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    // The two shapes actually present: {text} and {sv,en}. `sv` is chosen for
    // the fallback because the advert corpus is Swedish-first.
    for (const key of ["text", "sv", "statement", "label", "en"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim() !== "") return [v.trim()];
    }
    if (Array.isArray(o.items)) return normaliseRequirements(o.items);
    return [];
  }
  return [];
}
