// The Decision Support Summary Builder — rds-v1.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────
//
// A recruiter opening a released candidate report has six questions, in this
// order: what does this indicate, what is strongest, what should worry or
// interest me, what is uncertain, what do I ask, and what do I do next. The
// frozen brief already contains every fact needed to answer them; what it does
// not contain is the PRIORITISATION. This module is that layer.
//
// ── THE LINE THIS MODULE MAY NOT CROSS ──────────────────────────────────
//
// It recommends a step in the RECRUITMENT PROCESS. It does not recommend an
// employment outcome, and it cannot: `RecommendedNextStep` has four values, all
// of them process steps, and there is no hire, no reject, no suitability
// verdict, no total, no band and no comparison with another candidate anywhere
// in the type. Those are absent from the vocabulary rather than filtered out of
// it, which is the same discipline scp_release_attempt_report proves about
// itself in SQL. scripts/recruitment-decision-support-check.ts asserts it from
// the outside as well.
//
// ── WHY IT IS DETERMINISTIC ─────────────────────────────────────────────
//
// Two people reading one candidate's evidence must get the same brief, and any
// line of it must be traceable to the rows that produced it. So every bucket
// here is a filter over the frozen arrays and every recommendation is a rule
// written out below. No scoring happens here — signal, evidence state and
// safety findings are decided in the database and arrive already decided.
//
// ── AND WHY THE PROSE IS DETERMINISTIC TOO ──────────────────────────────
//
// The first version of this layer reused the paragraph the database freezes
// with the snapshot. That paragraph is honest and complete, and completeness is
// exactly what was wrong with it: it named every competency in every bucket, in
// one breath, and a recruiter with forty minutes read a catalogue instead of a
// brief.
//
// So there are now two steps rather than one. `selectSummaryFacts` decides WHICH
// facts are decision-relevant — at most five, in a fixed priority order, with
// thin areas COUNTED rather than listed. `composeNarrative` writes those, and
// only those, into three to five sentences. Nothing was added to the evidence to
// make this possible; what changed is that most of it is deliberately left out
// of the opening paragraph and kept in the sections below, where a reader goes
// looking for it.
//
// The AI seam at the end of this file is additive and stays additive. It exists
// so a provider can improve the register one day; it is not the plan for making
// the copy good. The deterministic paragraph has to read well on its own,
// because it is what ships.

import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  InterviewGuideEntry,
  ObservedArea,
  ReportBrief,
  SelfReportedArea,
} from "./academy-employer.functions";

export const DECISION_SUPPORT_VERSION = "rds-v1";

/** The four process steps this product may recommend.
 *
 *  Every one of them is something the EMPLOYER does next in its own process.
 *  None of them is an employment decision, and there is deliberately no fifth
 *  value: a type with `hire` in it is a type somebody eventually returns. */
export type RecommendedNextStep =
  | "structured_interview"
  | "additional_assessment"
  | "request_clarification"
  | "gather_more_evidence";

/** A follow-up area, paired with the authored interview prompt that belongs to
 *  it. The prompt is not generated here — it comes from the governed interview
 *  guide in the frozen brief, matched by area code. */
export type FollowUpItem = {
  area: ObservedArea;
  /** The authored question for this area, when the guide selected one. */
  prompt: InterviewGuideEntry | null;
};

/** The input contract.
 *
 *  Assembled from the frozen brief and nothing else. Deliberately carries no
 *  name, no address, no subject id, no attempt id and no raw response text: an
 *  AI enrichment step receives exactly this object, so what it cannot be given
 *  is decided by the shape of the type rather than by the caller remembering. */
export type DecisionSupportInput = {
  observed: ObservedArea[];
  selfReported: SelfReportedArea[];
  interviewGuide: InterviewGuideEntry[];
  safetyFlagCount: number;
  observedObservations: number;
  selfReportObservations: number;
  evidenceContexts: number;
  reviewsTotal: number;
  reviewsCompleted: number;
  /** The paragraph the database froze with the snapshot. Kept as the last
   *  resort for a brief whose arrays are empty — never as the ordinary path,
   *  because it is the catalogue this layer exists to replace. */
  frozenSummary: { sv: string; en: string } | null;
};

/**
 * What the steadiest part of the evidence is — and how much weight it can take.
 *
 * `supported` means at least one competency actually held together across
 * comparable tasks. `provisional` means none did, and what is shown instead is
 * what the candidate CONSISTENTLY DESCRIBES about their own way of working,
 * labelled as self-report on every row.
 *
 * ── WHY PROVISIONAL IS SELF-REPORT ONLY ─────────────────────────────────
 *
 * The temptation is to promote the least-bad observed area into the panel. It
 * would be wrong twice over: `mixed` means answers pointed different ways, and
 * `developing` means they consistently chose the less well-judged option —
 * neither is a stable signal, and dressing one as "comparatively strongest"
 * would be inventing a strength out of a ranking the product does not make.
 * A consistent self-description is a real, observable regularity; it simply is
 * not evidence of competence, and the panel says so.
 */
export type StabilityPanel = {
  kind: "supported" | "provisional";
  observed: ObservedArea[];
  selfReported: SelfReportedArea[];
};

export type DecisionSupport = {
  version: typeof DECISION_SUPPORT_VERSION;
  /** Where the narrative came from. The buckets and the step are always
   *  deterministic, whatever this says. */
  source: "deterministic" | "ai";
  recommendedNextStep: RecommendedNextStep;
  /** Why that step, in words the surface translates. Named as a key rather
   *  than as prose so the reason is one sentence in both languages and cannot
   *  drift between them. */
  rationaleKey: TranslationKey;
  /** Three to five sentences. Null only when there is nothing at all to say. */
  narrative: { sv: string; en: string } | null;
  /** The facts the narrative was built from, in the order it used them. Carried
   *  so a surface — or a test — can check the prose against its own sources. */
  facts: SummaryFact[];
  strongestSupported: ObservedArea[];
  /** Null hides the panel entirely rather than rendering an empty box that
   *  reads as a finding. */
  stability: StabilityPanel | null;
  priorityFollowUp: FollowUpItem[];
  /** Null, not an empty array: a panel that renders "no safety-critical
   *  findings" on every clean report is a panel that alarms every reader of a
   *  clean report. */
  safetyCriticalFollowUp: { count: number; prompts: InterviewGuideEntry[] } | null;
  uncertainties: ObservedArea[];
  selfReportedPatterns: SelfReportedArea[];
  reviewComplete: boolean;
};

/** Signals that say something about how the person answered. `limited` is
 *  excluded on purpose: it says the assessment did not ask enough, which is a
 *  fact about the instrument and never a finding about the person. */
const USABLE_SIGNALS = new Set(["strong", "consistent", "mixed", "developing"]);

export function buildDecisionSupportInput(
  brief: ReportBrief,
  safetyFlagCount: number,
): DecisionSupportInput {
  return {
    observed: brief.observed,
    selfReported: brief.selfReported,
    interviewGuide: brief.interviewGuide,
    safetyFlagCount,
    observedObservations: brief.coverage.observedObservations,
    selfReportObservations: brief.coverage.selfReportObservations,
    evidenceContexts: brief.coverage.evidenceContexts,
    reviewsTotal: brief.coverage.reviewsTotal ?? 0,
    reviewsCompleted: brief.coverage.reviewsCompleted ?? 0,
    frozenSummary: brief.executiveSummary,
  };
}

/**
 * The recommendation, as four rules read in order.
 *
 * ── WHY SAFETY IS FIRST ─────────────────────────────────────────────────
 *
 * A response a reviewer marked safety-critical is the one thing on the page
 * that a strong assessment elsewhere must never be allowed to outweigh. It is
 * read before the evidence-sufficiency rules so that no combination of counts
 * can move the recommendation off it, and the safety panel renders from its own
 * field regardless of what this function returns.
 *
 * ── WHY "NOT ENOUGH EVIDENCE" IS NOT "WEAK" ─────────────────────────────
 *
 * Rule 3 fires when more areas were barely touched than were actually
 * exercised. The step it recommends is more assessment, not a negative reading
 * of the person: `limited` is excluded from USABLE_SIGNALS precisely so that
 * thin coverage can never be counted as a shortcoming.
 */
export function recommendNextStep(input: DecisionSupportInput): {
  step: RecommendedNextStep;
  rationaleKey: TranslationKey;
} {
  const limited = input.observed.filter((o) => o.signal === "limited").length;
  const usable = input.observed.filter((o) => USABLE_SIGNALS.has(o.signal)).length;

  if (input.safetyFlagCount > 0) {
    return { step: "request_clarification", rationaleKey: "decision.why.safety" };
  }
  if (input.observedObservations === 0) {
    return { step: "gather_more_evidence", rationaleKey: "decision.why.noObserved" };
  }
  if (usable === 0 || limited > usable) {
    return { step: "additional_assessment", rationaleKey: "decision.why.thinCoverage" };
  }
  return { step: "structured_interview", rationaleKey: "decision.why.readyForInterview" };
}

/** Follow-up before strength when both are the same size, and within each
 *  bucket the area with the most tasks behind it first — a recruiter reading
 *  only the first line should get the area with the most under it, not the
 *  alphabetically luckiest. */
const byWeight = (a: ObservedArea, b: ObservedArea) =>
  b.items - a.items || a.areaCode.localeCompare(b.areaCode);

/** How many rows a summary panel shows before the detail sections take over.
 *  The panel exists to be read in fifteen seconds; a panel that lists eleven
 *  areas is the report it was supposed to replace. */
// Three, not four. The strongest-evidence panel is a scan target on a screen a
// recruiter has thirty seconds for, and a fourth row is the one that turns it
// back into a list to read rather than a shape to recognise.
export const PANEL_LIMIT = 3;

/** Follow-up is capped tighter than the other panels. "Everything matters" and
 *  "nothing matters" arrive at the same place, and a recruiter can hold three
 *  priorities into an interview. The rest are one section further down. */
export const FOLLOW_UP_LIMIT = 3;

// ═══════════════════════════════════════════════════════════════════════════
// The selection layer
// ═══════════════════════════════════════════════════════════════════════════
//
// Between the evidence and the prose. Its whole job is to LEAVE THINGS OUT: at
// most five facts, in a fixed priority order, with the thin-coverage areas
// counted rather than named. Everything it discards is still on the page — one
// section down, where somebody reading past the summary will find it.

export type SummaryFact =
  | { kind: "safety"; count: number }
  | { kind: "strength"; areas: ObservedArea[] }
  | { kind: "follow_up"; areas: ObservedArea[] }
  | { kind: "mixed"; areas: ObservedArea[] }
  | { kind: "thin"; count: number }
  | { kind: "self_report_consistent"; count: number }
  | { kind: "self_report_varied"; count: number }
  | { kind: "next_step"; step: RecommendedNextStep };

/** At most two areas are ever named per sentence. Three names in one clause is
 *  where a sentence stops being read and starts being skimmed. */
const NAMED_PER_SENTENCE = 2;

const MAX_FACTS = 5;

export function selectSummaryFacts(input: DecisionSupportInput): SummaryFact[] {
  const developing = input.observed.filter((o) => o.signal === "developing").sort(byWeight);
  const mixed = input.observed.filter((o) => o.signal === "mixed").sort(byWeight);
  const strong = input.observed
    .filter((o) => o.signal === "strong" || o.signal === "consistent")
    .sort(byWeight);
  const thin = input.observed.filter((o) => o.signal === "limited").length;
  const consistent = input.selfReported.filter(
    (s) => s.consistency === "consistent" && s.pattern === "consistently_described",
  ).length;
  const varied = input.selfReported.filter((s) => s.consistency === "varied").length;

  const facts: SummaryFact[] = [];
  if (input.safetyFlagCount > 0) facts.push({ kind: "safety", count: input.safetyFlagCount });

  // The strongest OBSERVED signal, whichever direction it points. A run where
  // two areas held together and one was uneven opens on the two that held; a
  // run where nothing held opens on what needs following up.
  if (strong.length > 0)
    facts.push({ kind: "strength", areas: strong.slice(0, NAMED_PER_SENTENCE) });
  if (developing.length > 0)
    facts.push({ kind: "follow_up", areas: developing.slice(0, NAMED_PER_SENTENCE) });
  if (mixed.length > 0) facts.push({ kind: "mixed", areas: mixed.slice(0, NAMED_PER_SENTENCE) });
  if (thin > 0) facts.push({ kind: "thin", count: thin });
  if (consistent > 0) facts.push({ kind: "self_report_consistent", count: consistent });
  else if (varied > 0) facts.push({ kind: "self_report_varied", count: varied });

  const { step } = recommendNextStep(input);
  facts.push({ kind: "next_step", step });

  // Five, and the last one out is the process step — because it is already the
  // headline of the card directly above the paragraph, and repeating it there
  // costs a sentence that could have carried something the reader does not
  // already know.
  if (facts.length <= MAX_FACTS) return facts;
  return facts.filter((f) => f.kind !== "next_step").slice(0, MAX_FACTS);
}

// ── Composition ────────────────────────────────────────────────────────
//
// A fixed clause per fact kind, in both languages. Not a template engine: the
// point of writing them out is that every sentence this product can produce is
// visible in one place and can be read as English and Swedish prose rather than
// inferred from a grammar.

const NUMBER_WORD: Record<"sv" | "en", string[]> = {
  sv: ["noll", "ett", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio", "tio"],
  en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"],
};

const count = (n: number, lang: "sv" | "en") => NUMBER_WORD[lang][n] ?? String(n);

/** "a och b", or "a, b" when a name already contains the conjunction.
 *
 *  Several competency names are themselves conjunctions — "Kommunikation och
 *  informationskvalitet", "Ansvarstagande och tillförlitlighet" — and joining
 *  two of those with another "och" produces a sentence a reader has to parse
 *  twice to find the boundary. A comma has one reading. */
const join = (items: string[], lang: "sv" | "en") => {
  if (items.length <= 1) return items[0] ?? "";
  const conj = lang === "sv" ? "och" : "and";
  const collides = items.some((i) => new RegExp(`\\b${conj}\\b`, "i").test(i));
  const head = items.slice(0, -1).join(", ");
  return collides
    ? `${head}, ${items[items.length - 1]}`
    : `${head} ${conj} ${items[items.length - 1]}`;
};

const STEP_PHRASE: Record<RecommendedNextStep, { sv: string; en: string }> = {
  structured_interview: {
    sv: "gå vidare till en strukturerad intervju",
    en: "move on to a structured interview",
  },
  additional_assessment: {
    sv: "komplettera med ytterligare bedömning",
    en: "add a further assessment",
  },
  request_clarification: { sv: "begära förtydligande", en: "ask for clarification" },
  gather_more_evidence: {
    sv: "samla ytterligare underlag",
    en: "gather more evidence",
  },
};

function sentence(fact: SummaryFact, lang: "sv" | "en"): string {
  const sv = lang === "sv";
  const name = (a: ObservedArea) => (sv ? a.areaSv : a.areaEn);

  switch (fact.kind) {
    case "safety":
      return sv
        ? fact.count === 1
          ? "Ett svar rör säkerhetskritisk bedömning och har lästs av en granskare — det behöver följas upp innan processen går vidare."
          : `${count(fact.count, "sv")[0].toUpperCase()}${count(fact.count, "sv").slice(1)} svar rör säkerhetskritisk bedömning och har lästs av en granskare — de behöver följas upp innan processen går vidare.`
        : fact.count === 1
          ? "One response concerns a safety-critical judgement and has been read by a reviewer — it needs following up before the process continues."
          : `${count(fact.count, "en")[0].toUpperCase()}${count(fact.count, "en").slice(1)} responses concern a safety-critical judgement and have been read by a reviewer — they need following up before the process continues.`;

    case "strength": {
      const names = join(fact.areas.map(name), lang);
      // The named areas sit at the END of the clause rather than in the middle:
      // several competency names are themselves two words joined by "och", and
      // a list of them followed by a subordinate clause is a sentence the
      // reader has to re-enter to find where the list stopped.
      return sv
        ? `Svaren pekade åt samma håll över jämförbara uppgifter inom ${names} — det är där underlaget håller tydligast ihop.`
        : `The answers pointed the same way across comparable tasks in ${names} — that is where the evidence holds together most clearly.`;
    }

    case "follow_up": {
      const names = join(fact.areas.map(name), lang);
      return sv
        ? `Svaren valde genomgående mindre välavvägda alternativ inom ${names} — det är det tydligaste behovet av uppföljning.`
        : `The answers consistently chose the less well-judged option in ${names} — that is the clearest need for follow-up.`;
    }

    case "mixed": {
      const names = join(fact.areas.map(name), lang);
      return sv
        ? `${names} gav ett mer blandat mönster mellan jämförbara uppgifter.`
        : `${names} produced a more mixed pattern across comparable tasks.`;
    }

    case "thin":
      return sv
        ? fact.count === 1
          ? "Ett kompetensområde berördes för lite för att kunna tolkas, vilket säger något om bedömningens bredd och inget om kandidaten."
          : `${count(fact.count, "sv")[0].toUpperCase()}${count(fact.count, "sv").slice(1)} kompetensområden berördes för lite för att kunna tolkas, vilket säger något om bedömningens bredd och inget om kandidaten.`
        : fact.count === 1
          ? "One competency area was touched too lightly to be read, which says something about the breadth of the assessment and nothing about the candidate."
          : `${count(fact.count, "en")[0].toUpperCase()}${count(fact.count, "en").slice(1)} competency areas were touched too lightly to be read, which says something about the breadth of the assessment and nothing about the candidate.`;

    case "self_report_consistent":
      return sv
        ? "Det självrapporterade arbetssättet visar flera konsekventa mönster, men de är inte observerade och behöver verifieras i intervju."
        : "The self-reported way of working shows several consistent patterns, but they are not observed and need verifying in interview.";

    case "self_report_varied":
      return sv
        ? "Inom det självrapporterade arbetssättet pekade närliggande svar åt olika håll — värt att utforska i intervju."
        : "Within the self-reported way of working, related answers pointed different ways — worth exploring in interview.";

    case "next_step":
      return sv
        ? `Rekommendationen är att ${STEP_PHRASE[fact.step].sv} innan nästa beslut i processen.`
        : `The recommendation is to ${STEP_PHRASE[fact.step].en} before the next decision in the process.`;
  }
}

/**
 * Three to five sentences from the selected facts.
 *
 * ── WHY THE SAFETY FACT IS SELECTED AND NOT WRITTEN ─────────────────────
 *
 * It stays first in `facts`, because the priority order is the product's and
 * has to be visible and testable. It does not become a sentence, because on the
 * page it already owns two slots above this paragraph: the recommended step's
 * reason ("a safety-critical response needs following up before the process
 * continues") and its own emphasised panel, which states the finding and the
 * action to take. Saying it a third time in the narrative is how the reader
 * learns that this paragraph repeats what they have already read.
 *
 * A surface that renders `narrative` MUST also render `safetyCriticalFollowUp`.
 * DecisionSupportSummary does; the render suite asserts it does.
 */
/** Fact kinds the PARAGRAPH does not write, though the report still carries
 *  them as structured facts.
 *
 *  `safety` has its own panel, and saying it a third time in prose is how a
 *  reader learns to skim the paragraph that matters most.
 *
 *  `thin` and `next_step` are new here, and both were removed for the same
 *  reason: each was already on screen, in a better place, one line away.
 *  `next_step` is the headline of the card directly above the paragraph.
 *  `thin` is a fact about how much the instrument asked -- methodology, which
 *  the summary is explicitly not for -- and the "Begransat underlag: N" line
 *  below the panels already states it.
 *
 *  Nothing is lost by leaving them out; five sentences became three, and the
 *  two that went were the two the reader had just read. */
const NOT_WRITTEN_IN_PROSE = new Set<SummaryFact["kind"]>(["safety", "thin", "next_step"]);

/** The paragraph's own ceiling, tighter than MAX_FACTS.
 *
 *  A customer read this brief and could not get the candidate picture out of
 *  it quickly. The facts were right; there were simply too many sentences for
 *  something a recruiter reads before an interview, so the paragraph stops at
 *  three and the rest of the report carries the detail. */
const MAX_SENTENCES = 3;

export function composeNarrative(facts: SummaryFact[]): { sv: string; en: string } | null {
  const preferred = facts.filter((f) => !NOT_WRITTEN_IN_PROSE.has(f.kind));
  // A brief with nothing observed selects only `next_step`, and excluding that
  // would leave the paragraph empty -- so the exclusions are a preference, not
  // a prohibition. The rule is "do not repeat what the reader just read", and
  // on a report where there IS nothing else, the step has not been said twice.
  const written = (
    preferred.length > 0 ? preferred : facts.filter((f) => f.kind !== "safety")
  ).slice(0, MAX_SENTENCES);
  if (written.length === 0) return null;
  return {
    sv: written.map((f) => sentence(f, "sv")).join(" "),
    en: written.map((f) => sentence(f, "en")).join(" "),
  };
}

export function buildDecisionSupport(input: DecisionSupportInput): DecisionSupport {
  const { step, rationaleKey } = recommendNextStep(input);

  const strongest = input.observed
    .filter((o) => o.signal === "strong" || o.signal === "consistent")
    .sort(byWeight);

  // developing before mixed: answers that consistently chose the less
  // well-judged option are a clearer thing to ask about than answers that
  // varied, and a recruiter reading only the first row should get the former.
  const rank = (o: ObservedArea) => (o.signal === "developing" ? 0 : 1);
  const followUp = input.observed
    .filter((o) => o.signal === "developing" || o.signal === "mixed")
    .sort((a, b) => rank(a) - rank(b) || byWeight(a, b))
    .map((area) => ({
      area,
      prompt: input.interviewGuide.find((g) => g.areaCode === area.areaCode) ?? null,
    }));

  const uncertainties = input.observed.filter((o) => o.signal === "limited").sort(byWeight);

  const describedConsistently = input.selfReported.filter(
    (s) => s.consistency === "consistent" && s.pattern === "consistently_described",
  );

  // What the person said about themselves, with the areas whose related
  // answers pointed different ways first. Never merged with the observed
  // buckets above: they are different kinds of evidence and occupy different
  // fields all the way to the page.
  const selfReported = [
    ...input.selfReported.filter((s) => s.consistency === "varied"),
    ...input.selfReported.filter(
      (s) => s.consistency !== "varied" && s.pattern === "rarely_described",
    ),
  ];

  const stability: StabilityPanel | null =
    strongest.length > 0
      ? { kind: "supported", observed: strongest.slice(0, PANEL_LIMIT), selfReported: [] }
      : describedConsistently.length > 0
        ? {
            kind: "provisional",
            observed: [],
            selfReported: describedConsistently.slice(0, PANEL_LIMIT),
          }
        : null;

  const facts = selectSummaryFacts(input);

  return {
    version: DECISION_SUPPORT_VERSION,
    source: "deterministic",
    recommendedNextStep: step,
    rationaleKey,
    // The frozen paragraph is the fallback, not the default: it is the
    // catalogue this layer replaced, and it is better than nothing on a brief
    // whose arrays turn out to be empty.
    narrative: composeNarrative(facts) ?? input.frozenSummary,
    facts,
    strongestSupported: strongest,
    stability,
    priorityFollowUp: followUp,
    safetyCriticalFollowUp:
      input.safetyFlagCount > 0
        ? {
            count: input.safetyFlagCount,
            // Safety-critical responses are reviewed by a person, and the
            // guide's own entries are what the conversation should cover. No
            // question is invented here.
            prompts: input.interviewGuide.filter((g) => g.focus === "explore_development"),
          }
        : null,
    uncertainties,
    selfReportedPatterns: selfReported,
    reviewComplete: input.reviewsCompleted >= input.reviewsTotal,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// The AI seam
// ═══════════════════════════════════════════════════════════════════════════
//
// No provider is wired in, and this module does not add one: that is a billing
// and vendor decision for the owner, not something to introduce while building
// an architecture. The same seam already exists for Career Discovery
// (src/lib/career-discovery/v31/ai-explanation.ts) and this mirrors it, so the
// day a provider is chosen there is one shape to implement, not two.
//
// It is an improvement to the register, never the plan for making the copy
// good. `composeNarrative` above is what ships and has to read well on its own.
//
// What an AI layer may and may not do here is enforced by code rather than by
// a prompt:
//
//   MAY   reword the narrative into something shorter and more readable.
//   MAY   NOT choose the step         — `recommendedNextStep` is overwritten
//                                       back to the deterministic value.
//   MAY   NOT invent an area          — a narrative naming an area absent from
//                                       the input is rejected wholesale.
//   MAY   NOT express a verdict       — forbidden vocabulary is rejected.
//   MAY   NOT ramble                  — a narrative longer than the ceiling the
//                                       deterministic path holds itself to is
//                                       rejected.
//   MAY   NOT fail loudly             — any throw returns the deterministic
//                                       result unchanged.

export type DecisionSupportAiFn = (
  input: DecisionSupportInput,
) => Promise<{ sv: string; en: string }>;

/** The ceiling the deterministic paragraph holds itself to, and therefore the
 *  ceiling anything replacing it has to clear. Fifteen to twenty seconds of
 *  reading, which is what the summary is for. */
export const NARRATIVE_WORD_LIMIT = 130;

/** The vocabulary a narrative may not contain, in either language. Mirrors the
 *  assertion scp_release_attempt_report makes about its own source. */
const FORBIDDEN = [
  "hire",
  "reject",
  "suitab",
  "unsuitab",
  "rank",
  "percentile",
  "score",
  "anställ",
  "avslå",
  "lämplig",
  "olämplig",
  "rangordn",
  "poäng",
  "betyg",
];

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function narrativeIsAcceptable(text: string, input: DecisionSupportInput): boolean {
  const lower = text.toLowerCase();
  if (lower.trim().length === 0) return false;
  if (wordCount(text) > NARRATIVE_WORD_LIMIT) return false;
  if (FORBIDDEN.some((w) => lower.includes(w))) return false;

  // Every capitalised area name the narrative uses must be one the evidence
  // actually contains. Checked by looking for names that are NOT present
  // rather than by parsing prose: the question is whether the text stays
  // inside the vocabulary, and any area it mentions must come from here.
  const known = new Set(
    input.observed.flatMap((o) => [o.areaSv.toLowerCase(), o.areaEn.toLowerCase()]),
  );
  for (const s of input.selfReported) {
    known.add(s.domainSv.toLowerCase());
    known.add(s.domainEn.toLowerCase());
  }
  return known.size === 0 || [...known].some((k) => lower.includes(k));
}

/**
 * Runs the AI narrative if one is configured, and returns the deterministic
 * result untouched if it is not, if it fails, or if what it produced does not
 * survive `narrativeIsAcceptable`.
 *
 * The buckets, counts and step in the returned object are the deterministic
 * ones in every case. Only `narrative` and `source` can change.
 */
export async function enrichDecisionSupport(
  base: DecisionSupport,
  input: DecisionSupportInput,
  aiCall?: DecisionSupportAiFn,
): Promise<DecisionSupport> {
  if (!aiCall) return base;
  try {
    const text = await aiCall(input);
    if (narrativeIsAcceptable(text.sv, input) && narrativeIsAcceptable(text.en, input)) {
      return { ...base, source: "ai", narrative: text };
    }
  } catch {
    // An AI outage is never an employer-facing error. The report is complete
    // without it — see the file header.
  }
  return base;
}
