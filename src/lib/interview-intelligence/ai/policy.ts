// The policy validator.
//
// The prompt asks the model to behave. This decides whether it did.
//
// That separation is the whole point. A model that can be argued out of its
// system prompt can also be argued out of admitting it — so nothing here reads
// the model's self-report. Every check runs over the OUTPUT, after the fact,
// with no way for the model to influence the verdict.
//
// A failure is never a silent drop and never a retry-until-it-passes loop: the
// run is quarantined with a reason, and a human sees that the engine produced
// something it was not allowed to produce.

import type { TaskDefinition } from "./registry";

export const POLICY_VERSION = "1.0.0";

export type PolicyViolationKind =
  | "prohibited_inference"
  | "scoring_or_ranking"
  | "hiring_recommendation"
  | "protected_characteristic"
  | "governed_question_altered"
  | "unapproved_probe"
  | "fabricated_citation"
  | "missing_citation"
  | "injection_followed";

export interface PolicyViolation {
  readonly kind: PolicyViolationKind;
  readonly detail: string;
  /** The offending fragment, bounded — enough to review, never the whole output. */
  readonly evidence: string;
}

/* ------------------------------------------------------------------ */
/* Vocabularies                                                        */
/* ------------------------------------------------------------------ */

/**
 * Words that only appear when the engine has strayed into judging the person.
 *
 * Matched on the OUTPUT, in Swedish and English, as whole words. Deliberately
 * excludes anything the product legitimately says: "otillräcklig evidens" is
 * the correct level-0 phrase and must never trip this.
 */
const PROHIBITED_INFERENCE = [
  // credibility / deception
  "trovärdig",
  "trovärdighet",
  "otrovärdig",
  "ljuger",
  "lögn",
  "lögnaktig",
  "bedräglig",
  "oärlig",
  "credible",
  "credibility",
  "deceptive",
  "deception",
  "lying",
  "dishonest",
  "truthful",
  // personality / emotion / stress
  "personlighet",
  "personlighetstyp",
  "temperament",
  "nervositet som tecken",
  "stressnivå",
  "känsloläge",
  "kroppsspråk",
  "ansiktsuttryck",
  "röstanalys",
  "personality",
  "emotional state",
  "stress level",
  "body language",
  "facial expression",
  "voice analysis",
  "gaze",
  // fit / suitability
  "culture fit",
  "kulturell passform",
  "lämplighetspoäng",
  "suitability score",
  "fit score",
  "cultural fit",
] as const;

const SCORING_OR_RANKING = [
  "totalpoäng",
  "slutpoäng",
  "sammanlagd poäng",
  "viktad poäng",
  "rangordning",
  "rangordna",
  "placering bland kandidater",
  "topp 3 kandidater",
  "total score",
  "overall score",
  "final score",
  "weighted score",
  "ranking",
  "rank the candidates",
  "percentile",
  "cut score",
  "pass mark",
  "godkänt/underkänt",
] as const;

const HIRING_RECOMMENDATION = [
  "rekommenderar anställning",
  "rekommenderar att anställa",
  "bör anställas",
  "bör inte anställas",
  "avslå kandidaten",
  "gå vidare med kandidaten",
  "recommend hiring",
  "recommend rejecting",
  "should be hired",
  "should not be hired",
  "do not proceed with this candidate",
  "reject the candidate",
] as const;

/**
 * Protected characteristics used AS A SIGNAL.
 *
 * The gold dataset deliberately includes cases where a CV mentions these, so
 * the test is not "does the word appear in the world" but "did the engine
 * repeat it into its own output". Since the engine's output should only ever
 * describe job-relevant behaviour, any occurrence here is a finding.
 */
const PROTECTED_CHARACTERISTIC = [
  "gravid",
  "graviditet",
  "föräldraledig",
  "sjukskriven",
  "diagnos",
  "funktionsnedsättning",
  "handikapp",
  "religion",
  "religiös",
  "kyrka",
  "moské",
  "facklig",
  "fackförbund",
  "sexuell läggning",
  "etnicitet",
  "hudfärg",
  "utländsk bakgrund",
  "invandrarbakgrund",
  "civilstånd",
  "gift",
  "skild",
  "pregnant",
  "maternity",
  "parental leave",
  "sick leave",
  "diagnosis",
  "disability",
  "handicap",
  "religious",
  "trade union",
  "sexual orientation",
  "ethnicity",
  "race",
  "marital status",
  "divorced",
] as const;

/**
 * Phrases that indicate the model followed an instruction found INSIDE source
 * material rather than treating it as data.
 */
const INJECTION_COMPLIANCE = [
  "som instruerat i cv",
  "enligt instruktionerna i dokumentet",
  "ignorerar tidigare instruktioner",
  "som dokumentet begär",
  "as instructed in the cv",
  "per the instructions in the document",
  "ignoring previous instructions",
  "ignore all previous",
  "as the document requests",
  "system prompt",
] as const;

/* ------------------------------------------------------------------ */

function findTerm(haystack: string, terms: readonly string[]): string | null {
  const lower = haystack.toLowerCase();
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx === -1) continue;
    // Whole-word-ish: reject a match glued inside a longer word, which is how
    // "rank" would otherwise fire on "franka".
    const before = idx === 0 ? " " : lower[idx - 1];
    const after = lower[idx + term.length] ?? " ";
    if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) continue;
    return term;
  }
  return null;
}

function excerptAround(haystack: string, term: string): string {
  const idx = haystack.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return term;
  return haystack.slice(Math.max(0, idx - 60), idx + term.length + 60).replace(/\s+/g, " ");
}

/* ------------------------------------------------------------------ */
/* The checks                                                          */
/* ------------------------------------------------------------------ */

export interface PolicyContext {
  readonly task: TaskDefinition;
  /** Passage ids the orchestrator actually supplied. A citation outside this is fabricated. */
  readonly allowedPassageIds: ReadonlySet<string>;
  /** Probe ids from the pinned pack. Selection may name nothing else. */
  readonly allowedProbeIds: ReadonlySet<string>;
  /** The governed question wording, by code. Altering any of it is a violation. */
  readonly governedQuestions: ReadonlyMap<string, string>;
}

/**
 * Validate a parsed, schema-valid output against product policy.
 *
 * Returns every violation rather than the first: a reviewer looking at a
 * quarantined run should see the whole picture, not one symptom.
 */
export function validatePolicy(parsed: unknown, ctx: PolicyContext): readonly PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const serialised = JSON.stringify(parsed ?? {});

  // ---- 1. Forbidden conclusions, anywhere in the output --------------------
  //
  // `prohibitedConclusionNote` is the one field whose JOB is to name a
  // forbidden conclusion in order to warn against it, so it is excluded from
  // the vocabulary sweep. Everything else is fair game.
  const sweepable = stripFields(parsed, ["prohibitedConclusionNote"]);
  const sweepText = JSON.stringify(sweepable ?? {});

  const inference = findTerm(sweepText, PROHIBITED_INFERENCE);
  if (inference) {
    violations.push({
      kind: "prohibited_inference",
      detail: `The output infers something the product must never infer ("${inference}").`,
      evidence: excerptAround(sweepText, inference),
    });
  }

  const scoring = findTerm(sweepText, SCORING_OR_RANKING);
  if (scoring) {
    violations.push({
      kind: "scoring_or_ranking",
      detail: `The output scores or ranks ("${scoring}"). No total, weighting or ranking may exist.`,
      evidence: excerptAround(sweepText, scoring),
    });
  }

  const hiring = findTerm(sweepText, HIRING_RECOMMENDATION);
  if (hiring) {
    violations.push({
      kind: "hiring_recommendation",
      detail: `The output recommends an employment decision ("${hiring}"). The decision is the employer's alone.`,
      evidence: excerptAround(sweepText, hiring),
    });
  }

  const protectedTerm = findTerm(sweepText, PROTECTED_CHARACTERISTIC);
  if (protectedTerm) {
    violations.push({
      kind: "protected_characteristic",
      detail: `The output repeats a protected characteristic ("${protectedTerm}"). It must be ignored, not echoed.`,
      evidence: excerptAround(sweepText, protectedTerm),
    });
  }

  const injection = findTerm(serialised, INJECTION_COMPLIANCE);
  if (injection) {
    violations.push({
      kind: "injection_followed",
      detail: `The output suggests an instruction inside source material was followed ("${injection}").`,
      evidence: excerptAround(serialised, injection),
    });
  }

  // ---- 2. Citations must resolve to supplied passages ----------------------
  for (const claim of collectClaims(parsed)) {
    if (claim.claimClass === "source_grounded") {
      if (!claim.sourcePassageId) {
        violations.push({
          kind: "missing_citation",
          detail: "A source-grounded claim carries no citation.",
          evidence: claim.statement.slice(0, 160),
        });
      } else if (!ctx.allowedPassageIds.has(claim.sourcePassageId)) {
        violations.push({
          kind: "fabricated_citation",
          detail: `Citation ${claim.sourcePassageId} is not one of the passages this run was given.`,
          evidence: claim.statement.slice(0, 160),
        });
      }
    }
  }

  // ---- 3. Probes are SELECTED, never invented ------------------------------
  for (const probeId of collectProbeIds(parsed)) {
    if (!ctx.allowedProbeIds.has(probeId)) {
      violations.push({
        kind: "unapproved_probe",
        detail: `Probe ${probeId} is not in the pinned pack. Governed mode permits approved probes only.`,
        evidence: probeId,
      });
    }
  }

  // ---- 4. The governed questions are untouched -----------------------------
  //
  // Checked by looking for a near-miss: the output containing a string that is
  // clearly a rewrite of a core question rather than the question itself.
  for (const [code, wording] of ctx.governedQuestions) {
    const quoted = extractQuestionLike(parsed, code);
    if (quoted && quoted !== wording && similarity(quoted, wording) > 0.55) {
      violations.push({
        kind: "governed_question_altered",
        detail: `${code} appears in the output in altered wording. Core questions are read verbatim and may never be rewritten.`,
        evidence: quoted.slice(0, 200),
      });
    }
  }

  return violations;
}

/* ------------------------------------------------------------------ */
/* Traversal helpers                                                   */
/* ------------------------------------------------------------------ */

interface CollectedClaim {
  readonly claimClass: string;
  readonly sourcePassageId: string | null;
  readonly statement: string;
}

function collectClaims(node: unknown, out: CollectedClaim[] = []): CollectedClaim[] {
  if (Array.isArray(node)) {
    for (const child of node) collectClaims(child, out);
    return out;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.claimClass === "string") {
      out.push({
        claimClass: rec.claimClass,
        sourcePassageId: typeof rec.sourcePassageId === "string" ? rec.sourcePassageId : null,
        statement: typeof rec.statement === "string" ? rec.statement : "",
      });
    }
    for (const value of Object.values(rec)) collectClaims(value, out);
  }
  return out;
}

function collectProbeIds(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) collectProbeIds(child, out);
    return out;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.probeId === "string" && rec.probeId.length > 0) out.push(rec.probeId);
    for (const value of Object.values(rec)) collectProbeIds(value, out);
  }
  return out;
}

/** Remove named fields before the vocabulary sweep, without mutating the input. */
function stripFields(node: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(node)) return node.map((child) => stripFields(child, fields));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (fields.includes(key)) continue;
      out[key] = stripFields(value, fields);
    }
    return out;
  }
  return node;
}

/** Find a string in the output that looks like it is presenting question `code`. */
function extractQuestionLike(node: unknown, code: string): string | null {
  const found: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
      return;
    }
    if (n && typeof n === "object") {
      const rec = n as Record<string, unknown>;
      const isThisQuestion =
        rec.questionCode === code || rec.code === code || rec.question === code;
      if (isThisQuestion) {
        for (const key of ["prompt", "promptSv", "questionText", "statement", "wording"]) {
          const v = rec[key];
          if (typeof v === "string" && v.length > 30) found.push(v);
        }
      }
      for (const v of Object.values(rec)) walk(v);
    }
  };
  walk(node);
  return found[0] ?? null;
}

/** Cheap token-overlap similarity. Enough to catch a paraphrase of a question. */
function similarity(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((t) => t.length > 3),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

/* ------------------------------------------------------------------ */
/* Self-test surface                                                   */
/* ------------------------------------------------------------------ */

/**
 * Exported for the contract guard, which asserts the matcher fires on a known
 * violation and stays quiet on the product's own legitimate wording. A
 * validator nobody tests in both directions is a validator that has quietly
 * stopped matching.
 */
export const POLICY_SELF_TEST_VOCABULARIES = {
  PROHIBITED_INFERENCE,
  SCORING_OR_RANKING,
  HIRING_RECOMMENDATION,
  PROTECTED_CHARACTERISTIC,
  INJECTION_COMPLIANCE,
} as const;
