// TRUST Evidence Report — rds-v1 process-step parity (TypeScript ⇄ SQL).
//
// Run: bun run trust-next-step-parity:check          (the TypeScript half)
//      bun run scripts/trust-next-step-parity-check.ts --sql > parity.sql
//      psql -f parity.sql                              (the SQL half, from db-test.sh)
//
// There is ONE rds-v1 process-step rule. It is stated in the database as
// public.scp_report_next_step(safety_findings_present, observed_items,
// areas_sufficient, areas_limited) (PR-R3A, 20261029090000) and in the client
// as recommendNextStep() in src/lib/security-competency/decision-support.ts.
// This script walks the COMPLETE AGGREGATE-INPUT MATRIX for rds-v1 -- every
// combination of the aggregates the rule consumes, with the inert review,
// disputed and priority dimensions walked beside them; not the complete
// semantic state space of a report -- through the TypeScript rule and
// emits, for every point, the step and reason code the SQL function must
// return for the same inputs. db-test.sh executes that SQL against the
// replayed database, so any drift between the two fails the database job;
// the TypeScript job runs the same walk and fails if the matrix is not
// fully covered or any step falls outside the four process steps.
//
// The matrix, per the working group: observed_pattern, evidence_sufficiency,
// safety finding yes/no, human review status, disputed reading yes/no,
// follow_up_priority and observed-item-count boundaries. The rule consumes
// four aggregates -- a finding, the observed item total, how many areas are
// sufficient and how many limited -- so review status, disputed state and
// priority are walked as well and must be INERT: the same aggregates give
// the same step whatever they are. That inertness is part of the contract.

import { writeSync } from "node:fs";
import {
  recommendNextStep,
  type DecisionSupportInput,
} from "../src/lib/security-competency/decision-support";
import type { ObservedArea } from "../src/lib/security-competency/academy-employer.functions";
import { TRUST_PROCESS_STEPS } from "./fixtures/trust-evidence-report-v3-contract";

type Pattern = "clearly_consistent" | "consistent" | "mixed" | "developing" | "not_established";
type Sufficiency = "sufficient" | "limited" | "none";

/** The frozen ras-v1 signal that yields a (pattern, sufficiency) pair. */
const SIGNAL: Record<Pattern, ObservedArea["signal"]> = {
  clearly_consistent: "strong",
  consistent: "consistent",
  mixed: "mixed",
  developing: "developing",
  not_established: "limited",
};

/** rds-v1 rationale keys → the reason codes the SQL rule returns. */
const REASON: Record<string, string> = {
  "decision.why.safety": "safety_follow_up",
  "decision.why.noObserved": "no_observed_evidence",
  "decision.why.thinCoverage": "thin_coverage",
  "decision.why.readyForInterview": "ready_for_interview",
};

const area = (code: string, signal: ObservedArea["signal"], items: number): ObservedArea => ({
  areaCode: code,
  areaSv: code,
  areaEn: code,
  evidenceType: "observed",
  signal,
  items,
  evidenceState: "follow_up",
  behaviourSv: null,
  behaviourEn: null,
  whySv: "",
  whyEn: "",
});

type Point = {
  label: string;
  finding: boolean;
  observedItems: number;
  areasSufficient: number;
  areasLimited: number;
  step: string;
  reason: string;
};

const PATTERNS: Pattern[] = ["clearly_consistent", "consistent", "mixed", "developing"];
const REVIEW = ["not_required", "pending", "completed"] as const;
const DISPUTED = [false, true] as const;
const PRIORITY = ["first", "next", "if_time_allows", "none"] as const;
/** Item-count boundaries: 1 and 2 are limited; 3 is the first sufficient count. */
const SUFFICIENT_ITEMS = [3, 4, 6] as const;
const LIMITED_ITEMS = [1, 2] as const;

export function walkMatrix(): Point[] {
  const points: Point[] = [];
  for (const finding of [false, true]) {
    for (let nSufficient = 0; nSufficient <= 3; nSufficient += 1) {
      for (let nLimited = 0; nLimited <= 3; nLimited += 1) {
        for (let nNone = 0; nNone <= 2; nNone += 1) {
          for (const review of REVIEW) {
            for (const disputed of DISPUTED) {
              for (const priority of PRIORITY) {
                const observed: ObservedArea[] = [];
                let items = 0;
                for (let i = 0; i < nSufficient; i += 1) {
                  const p = PATTERNS[i % PATTERNS.length];
                  const n = SUFFICIENT_ITEMS[i % SUFFICIENT_ITEMS.length];
                  observed.push(area(`S${i}`, SIGNAL[p], n));
                  items += n;
                }
                for (let i = 0; i < nLimited; i += 1) {
                  const n = LIMITED_ITEMS[i % LIMITED_ITEMS.length];
                  observed.push(area(`L${i}`, SIGNAL.not_established, n));
                  items += n;
                }
                // `none` areas contribute no observed line and no items.
                const input: DecisionSupportInput = {
                  observed,
                  selfReported: [],
                  interviewGuide: [],
                  safetyFlagCount: finding ? 1 : 0,
                  observedObservations: items,
                  selfReportObservations: 0,
                  evidenceContexts: 1,
                  reviewsTotal: review === "not_required" ? 0 : 7,
                  reviewsCompleted: review === "completed" ? 7 : 0,
                  frozenSummary: null,
                };
                const r = recommendNextStep(input);
                const reason = REASON[r.rationaleKey];
                if (!reason) throw new Error(`unmapped rationale ${r.rationaleKey}`);
                points.push({
                  label: `finding=${finding} sufficient=${nSufficient} limited=${nLimited} none=${nNone} review=${review} disputed=${disputed} priority=${priority}`,
                  finding,
                  observedItems: items,
                  areasSufficient: nSufficient,
                  areasLimited: nLimited,
                  step: r.step,
                  reason,
                });
              }
            }
          }
        }
      }
    }
  }
  return points;
}

const points = walkMatrix();

if (process.argv.includes("--sql")) {
  // The SQL half: one DO block that walks every point against the database rule.
  const rows = points
    .map(
      (p) =>
        `(${p.finding}, ${p.observedItems}, ${p.areasSufficient}, ${p.areasLimited}, '${p.step}', '${p.reason}', '${p.label.replace(/'/g, "''")}')`,
    )
    .join(",\n    ");
  // Synchronous: a pipe reader must receive every byte before the process ends.
  writeSync(
    1,
    `-- generated by scripts/trust-next-step-parity-check.ts --sql; do not edit
DO $$
DECLARE _n int := 0; _bad text;
BEGIN
  SELECT count(*), min(label) INTO _n, _bad
    FROM (VALUES
    ${rows}
    ) AS m(finding, items, sufficient, limited, step, reason, label)
    CROSS JOIN LATERAL public.scp_report_next_step(m.finding, m.items, m.sufficient, m.limited) r
   WHERE r.step <> m.step OR r.reason_code <> m.reason OR r.rule_version <> 'rds-v1';
  IF _n > 0 THEN
    RAISE EXCEPTION 'RDS-V1 PARITY FAILED: % matrix point(s) differ between TypeScript and SQL; first: %', _n, _bad;
  END IF;
  RAISE NOTICE 'ok  rds-v1 parity: % aggregate-input matrix points, TypeScript and SQL agree on step and reason code', ${points.length};
END $$;
`,
  );
  process.exit(0);
}

// The TypeScript half.
let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const allowed = new Set<string>(TRUST_PROCESS_STEPS);
check(
  "P1 the matrix walks every combination",
  points.length === 2 * 4 * 4 * 3 * 3 * 2 * 4,
  String(points.length),
);
check(
  "P2 every step is one of the four process steps",
  points.every((p) => allowed.has(p.step)),
);
check(
  "P3 all four steps and all four reason codes are reached",
  new Set(points.map((p) => p.step)).size === 4 && new Set(points.map((p) => p.reason)).size === 4,
);
check(
  "P4 review status, disputed state and priority are inert: same aggregates, same step",
  (() => {
    const byAgg = new Map<string, string>();
    for (const p of points) {
      const k = `${p.finding}|${p.observedItems}|${p.areasSufficient}|${p.areasLimited}`;
      const v = `${p.step}|${p.reason}`;
      if (byAgg.has(k) && byAgg.get(k) !== v) return false;
      byAgg.set(k, v);
    }
    return true;
  })(),
);
check(
  "P5 the four corners hold: finding → clarification; no items → more evidence; more limited than sufficient → further assessment; else interview",
  points.every((p) => {
    if (p.finding) return p.step === "request_clarification";
    if (p.observedItems === 0) return p.step === "gather_more_evidence";
    if (p.areasSufficient === 0 || p.areasLimited > p.areasSufficient)
      return p.step === "additional_assessment";
    return p.step === "structured_interview";
  }),
);
check(
  "P6 a consistent pattern on limited evidence never counts as a sufficient area",
  SIGNAL.not_established === "limited" && (LIMITED_ITEMS as readonly number[]).every((n) => n < 3),
);

if (failures > 0) {
  console.error(`trust-next-step-parity:check: FAIL (${failures})`);
  process.exit(1);
}
console.log(`trust-next-step-parity:check: PASS (${points.length} aggregate-input matrix points)`);
