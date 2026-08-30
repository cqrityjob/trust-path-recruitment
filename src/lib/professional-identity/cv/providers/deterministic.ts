// A rule-based CV drafting engine.
//
// ── WHAT IT IS FOR, AND WHERE IT MAY RUN ───────────────────────────────
//
// It exists so the CV flow can be demonstrated, tested and reviewed without
// a model credential — the whole path, not a bypass of it: it returns JSON
// text through the same `AiProvider` interface, so the caller parses it,
// validates it against the schema and runs the same anti-fabrication sweep
// it would run on a model's answer. A change that broke the validator would
// break this too, which is the point.
//
// It is a TEST INSTRUMENT and it is confined the same way the interview
// engine's is: `selectProvider` refuses `deterministic` outside
// automated_test, synthetic_development and internal_qa, and provenance
// records the run as `synthetic` so nobody reading a draft has to guess.
// The reasoning is stated in full in interview-intelligence/ai/orchestrator.ts
// and applies here unchanged — a recruiter (or a candidate) cannot tell
// rule-based output from a model's by looking.
//
// ── WHY IT CANNOT FABRICATE ────────────────────────────────────────────
//
// Every sentence it emits is assembled from strings that were already in
// the source bundle, plus fixed connective words. It has no vocabulary of
// its own for employers, dates or achievements, so it passes the validator
// by construction rather than by luck. That makes it a fair stand-in for
// "what a well-behaved model would return", and a poor stand-in for
// "what a badly-behaved one would" — which is why the hostile cases in the
// guard script are written by hand instead.

import type {
  AiProvider,
  AiRequest,
  AiResponse,
} from "@/lib/interview-intelligence/ai/provider";
import type { CvSourceBundle } from "../source-bundle";

/** Fixed connective words. Never a fact, never a number. */
const PHRASES = {
  sv: {
    role: "Ansvarade för uppdraget som",
    at: "hos",
    ongoing: "Pågående uppdrag",
    concluded: "Avslutat uppdrag",
    summaryLead: "Yrkesverksam inom säkerhetsbranschen",
    summaryIn: "med erfarenhet från",
    summaryClose:
      "Underlaget nedan är hämtat från de uppgifter du själv har registrerat i CQrityjob.",
    rationale:
      "Sammanställd i kronologisk ordning från dina registrerade uppgifter, utan tillägg.",
    rationaleTargeted:
      "Ordnad efter den roll du angav, med dina mest relevanta registrerade uppdrag först.",
  },
  en: {
    role: "Held the role of",
    at: "at",
    ongoing: "Ongoing engagement",
    concluded: "Concluded engagement",
    summaryLead: "Security professional",
    summaryIn: "with experience from",
    summaryClose:
      "The material below is taken from the information you have recorded in CQrityjob yourself.",
    rationale: "Arranged in chronological order from your recorded information, with nothing added.",
    rationaleTargeted:
      "Ordered against the role you supplied, with your most relevant recorded engagements first.",
  },
} as const;

/** Which employments best match the pasted role text.
 *
 *  Word overlap, nothing cleverer. It reorders TRUE material and can never
 *  introduce any — the worst case is a CV in a slightly odd order, which a
 *  person fixes in the review step. */
function relevanceScore(text: string, employment: { roleTitle: string; employerName: string }) {
  const terms = new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 3),
  );
  const words = `${employment.roleTitle} ${employment.employerName}`
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3);
  return words.reduce((n, w) => n + (terms.has(w) ? 1 : 0), 0);
}

function draft(bundle: CvSourceBundle): string {
  const p = PHRASES[bundle.locale];
  const targeted = Boolean(bundle.targetJobText);

  const employment = targeted
    ? [...bundle.employment].sort(
        (a, b) =>
          relevanceScore(bundle.targetJobText!, b) - relevanceScore(bundle.targetJobText!, a),
      )
    : bundle.employment;

  const employers = employment.slice(0, 3).map((e) => e.employerName);
  const headlineBase =
    bundle.identity.headline ?? bundle.identity.currentProfession ?? p.summaryLead;

  const summary = [
    `${p.summaryLead}${bundle.identity.country ? ` (${bundle.identity.country})` : ""}.`,
    employers.length > 0 ? `${p.summaryIn} ${employers.join(", ")}.` : "",
    p.summaryClose,
  ]
    .filter(Boolean)
    .join(" ");

  return JSON.stringify({
    headline: headlineBase.slice(0, 160),
    summary: summary.slice(0, 1200),
    experience: employment.map((e) => ({
      sourceId: e.id,
      bullets: [
        `${p.role} ${e.roleTitle} ${p.at} ${e.employerName}.`.slice(0, 240),
        e.endedOn ? p.concluded : p.ongoing,
      ],
    })),
    emphasisedClaimIds: [...bundle.skills, ...bundle.languages]
      .filter((c) => c.verified)
      .map((c) => c.id),
    tailoringRationale: targeted ? p.rationaleTargeted : p.rationale,
  });
}

/**
 * The bundle is handed in directly rather than parsed back out of the
 * request, because reconstructing structured facts from a prompt string is
 * exactly the kind of guessing this whole feature is built to avoid.
 */
export class DeterministicCvProvider implements AiProvider {
  readonly name = "deterministic";
  readonly modelId = "deterministic-cv-v1";

  constructor(private readonly bundle: CvSourceBundle) {}

  async complete(_request: AiRequest): Promise<AiResponse> {
    return {
      text: draft(this.bundle),
      model: this.modelId,
      // No tokens were bought. Zero here is a FACT, not the "unknown" that
      // a null cost means elsewhere.
      usage: { inputTokens: 0, outputTokens: 0, costMicros: 0 },
    };
  }
}
