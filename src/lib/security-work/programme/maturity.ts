import type { BaselineQuestion } from "./content/baseline-v1";
import { SECURITY_DOMAINS } from "./content/baseline-v1";
import type { BaselineAnswerValue, MaturityLevel, SecurityDomainId } from "./types";

export type AnswerMap = Record<string, BaselineAnswerValue | undefined>;
export type DomainMaturity = {
  domain: SecurityDomainId;
  level: MaturityLevel;
  /** True when no applicable question in scope has been answered. */
  notAssessed: boolean;
  answered: number;
  total: number;
  quickAnswered: number;
  quickTotal: number;
  /** Questions in scope answered "no" or "partly": the potential gaps. */
  shortfalls: { questionId: string; answer: "no" | "partly"; level: 2 | 3 | 4 }[];
  /** Unanswered questions in scope that block the next level. */
  missingForNextLevel: string[];
};
export type MaturitySummary = {
  scope: "quick" | "detailed";
  overall: MaturityLevel;
  overallNotAssessed: boolean;
  domains: DomainMaturity[];
  answered: number;
  total: number;
};

const LEVELS: (2 | 3 | 4)[] = [2, 3, 4];

/**
 * Deterministic maturity. A domain reaches level L only when every
 * applicable question for L and every level below is answered "yes".
 * "partly", "no" and an unanswered question stop the ladder. "not_applicable"
 * removes the question from the ladder, and a level with no applicable
 * question in scope cannot be reached. Overall maturity is the lowest
 * assessed domain: a programme is as mature as its weakest area.
 */
export function computeMaturity(
  questions: BaselineQuestion[],
  answers: AnswerMap,
  scope: "quick" | "detailed",
): MaturitySummary {
  const inScope = scope === "quick" ? questions.filter((q) => q.quick) : questions;
  const domains = SECURITY_DOMAINS.map((domain): DomainMaturity => {
    const own = inScope.filter((q) => q.domain === domain.id);
    const quick = questions.filter((q) => q.domain === domain.id && q.quick);
    const applicable = own.filter((q) => answers[q.id] !== "not_applicable");
    const answered = own.filter((q) => answers[q.id] !== undefined);
    let level: MaturityLevel = 1;
    let missingForNextLevel: string[] = [];
    for (const candidate of LEVELS) {
      const required = applicable.filter((q) => q.level <= candidate);
      const atLevel = applicable.filter((q) => q.level === candidate);
      const unanswered = required.filter((q) => answers[q.id] === undefined);
      const allYes = required.every((q) => answers[q.id] === "yes");
      // A level is never reached by default: at least one applicable question
      // AT that level must be in scope and answered "yes". The quick set
      // therefore tops out at the highest level it asks about (Measured for
      // most domains); Optimised needs the detailed review.
      if (atLevel.length > 0 && allYes && unanswered.length === 0) {
        level = candidate;
        continue;
      }
      missingForNextLevel = unanswered.map((q) => q.id);
      break;
    }
    return {
      domain: domain.id,
      level,
      notAssessed: answered.length === 0,
      answered: answered.length,
      total: own.length,
      quickAnswered: quick.filter((q) => answers[q.id] !== undefined).length,
      quickTotal: quick.length,
      shortfalls: own.flatMap((q) => {
        const answer = answers[q.id];
        return answer === "no" || answer === "partly"
          ? [{ questionId: q.id, answer, level: q.level }]
          : [];
      }),
      missingForNextLevel,
    };
  });
  const assessed = domains.filter((domain) => !domain.notAssessed);
  return {
    scope,
    overall: assessed.length
      ? (Math.min(...assessed.map((domain) => domain.level)) as MaturityLevel)
      : 1,
    overallNotAssessed: assessed.length === 0,
    domains,
    answered: domains.reduce((sum, domain) => sum + domain.answered, 0),
    total: domains.reduce((sum, domain) => sum + domain.total, 0),
  };
}
export function answerMap(rows: { question_id: string; answer: string }[]): AnswerMap {
  const map: AnswerMap = {};
  for (const row of rows) map[row.question_id] = row.answer as BaselineAnswerValue;
  return map;
}
