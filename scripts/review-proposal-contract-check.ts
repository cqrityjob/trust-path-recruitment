// The AI proposal contract, tested before any provider exists.
//
// Run via `bun run review-proposal-contract:check`.
//
// ── WHY TEST SOMETHING THAT NEVER RUNS ──────────────────────────────────
//
// scp_ai_providers has 'anthropic' registered with is_enabled = false and no
// credential in this environment, so nothing calls a model today. The contract
// is built anyway, because the shape of what an AI may return and the
// validation it has to survive are governance decisions -- and settling them
// under time pressure on the day a key arrives is how a product ends up with
// an automated employment decision it did not mean to make.
//
// So the rules are written down now and asserted now:
//
//   a proposal is never an assessment          human confirms or changes it
//   a proposal is never a verdict              the type has no field for one
//   a proposal is bound to its rubric version  or it is about another question
//   a proposal's evidence is the candidate's   quotes must be verbatim
//   a rejected proposal degrades to manual     never to a partial proposal
//
// ── AND THE ONE THAT BIT ────────────────────────────────────────────────
//
// The forbidden-word scan originally read the whole object, evidenceQuote
// included. That quote is the candidate's own words, and a security answer
// about access control very plausibly contains "passerkort". A valid proposal
// would have been thrown away because of something the candidate wrote. The
// scan now reads keys and the two fields the model writes in its own voice,
// and the case is asserted below so it cannot come back.

import { validateProposal, deriveOutcome } from "../src/lib/security-competency/review-proposal";
import { dictionaries } from "../src/i18n/dictionaries";
import type { RubricDimension } from "../src/lib/security-competency/academy-employer.functions";

const fails: string[] = [];
const ck = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) fails.push(name);
};

const RUBRIC: RubricDimension[] = [
  {
    dimension_key: "concrete_situation",
    name: "Konkret situation",
    criterion: "En verklig, avgränsad händelse beskrivs.",
    style_only: false,
    levels: [0, 1, 2, 3, 4].map((level) => ({ level, descriptor: `Nivå ${level}` })),
  },
  {
    dimension_key: "own_action",
    name: "Eget handlande",
    criterion: "Vad personen själv gjorde.",
    style_only: false,
    levels: [0, 1, 2, 3, 4].map((level) => ({ level, descriptor: `Nivå ${level}` })),
  },
];

const RESPONSE =
  "Jag upptäckte att en dörr till serverrummet stått uppställd. Jag kontrollerade passerkortsloggen och rapporterade till min arbetsledare.";

const good = {
  scoringRunId: "11111111-1111-1111-1111-111111111111",
  providerCode: "anthropic",
  modelVersion: "m-1",
  rubricVersionId: "rv-1",
  promptVersionId: "pv-1",
  runStatus: "complete",
  confidence: 0.7,
  rationaleDraft: "Svaret beskriver en avgränsad händelse och vad personen gjorde.",
  suggestedFollowUp: "Hur säkerställde du att loggen inte hade ändrats?",
  levels: [
    {
      dimensionKey: "concrete_situation",
      level: 3,
      evidenceQuote: "en dörr till serverrummet stått uppställd",
      uncertain: false,
    },
    {
      dimensionKey: "own_action",
      level: 3,
      evidenceQuote: "rapporterade till min arbetsledare",
      uncertain: true,
    },
  ],
};

const ctx = {
  rubric: RUBRIC,
  rubricVersionId: "rv-1",
  responseText: RESPONSE,
  providerEnabled: true,
};

console.log("\n1. A well-formed proposal is accepted");
{
  const r = validateProposal(good, ctx);
  ck("accepted", r.rejected === null, String(r.rejected));
  ck("both dimensions carried", r.proposal?.levels.length === 2);
  ck("the run id is bound", r.proposal?.scoringRunId === good.scoringRunId);
  ck("the rubric version is bound", r.proposal?.rubricVersionId === "rv-1");
  ck("uncertainty is carried", r.proposal?.levels[1].uncertain === true);
  ck("confidence is carried, not acted on", r.proposal?.confidence === 0.7);
}

console.log("\n2. The provider being disabled is the default answer");
{
  const r = validateProposal(good, { ...ctx, providerEnabled: false });
  ck("disabled provider yields no proposal", r.proposal === null);
  ck("and says why", r.rejected === "provider_disabled");
}

console.log("\n3. A candidate's own words are never scanned for forbidden terms");
{
  // The bug this exists for: "passerkort" contains "pass".
  const r = validateProposal(good, ctx);
  ck("a quote containing 'passerkort' is accepted", r.rejected === null, String(r.rejected));

  const withPoang = {
    ...good,
    levels: [
      { ...good.levels[0], evidenceQuote: "Jag kontrollerade passerkortsloggen" },
      good.levels[1],
    ],
  };
  ck(
    "a longer quote from the same answer is accepted",
    validateProposal(withPoang, ctx).rejected === null,
  );
}

console.log("\n4. An employment judgement is refused wherever it appears");
{
  for (const [name, mutated] of [
    ["a verdict field", { ...good, verdict: "suitable" }],
    ["a ranking field", { ...good, rank: 2 }],
    [
      "a recommendation in the rationale",
      { ...good, rationaleDraft: "Kandidaten är lämplig för rollen." },
    ],
    [
      "a hire suggestion in the follow-up",
      { ...good, suggestedFollowUp: "Rekommenderar anställning." },
    ],
    ["a readiness score", { ...good, readiness: 0.9 }],
    [
      "a per-level verdict key",
      { ...good, levels: [{ ...good.levels[0], pass: true }, good.levels[1]] },
    ],
  ] as const) {
    const r = validateProposal(mutated, ctx);
    ck(`${name} is refused`, r.rejected === "forbidden_field", String(r.rejected));
  }
}

console.log("\n5. A proposal must be about THIS question");
{
  ck(
    "a different rubric version is refused",
    validateProposal({ ...good, rubricVersionId: "rv-2" }, ctx).rejected ===
      "rubric_version_mismatch",
  );
  ck(
    "an unknown dimension is refused",
    validateProposal(
      { ...good, levels: [{ ...good.levels[0], dimensionKey: "invented" }, good.levels[1]] },
      ctx,
    ).rejected === "unknown_dimension",
  );
  ck(
    "a level outside the rubric is refused",
    validateProposal({ ...good, levels: [{ ...good.levels[0], level: 7 }, good.levels[1]] }, ctx)
      .rejected === "level_out_of_range",
  );
  ck(
    "a half-filled proposal is refused, never partly shown",
    validateProposal({ ...good, levels: [good.levels[0]] }, ctx).rejected === "missing_dimension",
  );
  ck(
    "an incomplete run is refused",
    validateProposal({ ...good, runStatus: "failed" }, ctx).rejected === "run_not_complete",
  );
}

console.log("\n6. Evidence has to be something the candidate actually wrote");
{
  const invented = {
    ...good,
    levels: [{ ...good.levels[0], evidenceQuote: "Jag ringde polisen omedelbart" }, good.levels[1]],
  };
  ck(
    "a paraphrased or invented quote is refused",
    validateProposal(invented, ctx).rejected === "quote_not_in_response",
  );
  ck(
    "no quote at all is allowed",
    validateProposal(
      { ...good, levels: [{ ...good.levels[0], evidenceQuote: null }, good.levels[1]] },
      ctx,
    ).rejected === null,
  );
}

console.log("\n7. The audit records what the human did, and cannot be mislabelled");
{
  const proposal = validateProposal(good, ctx).proposal!;
  const asProposed = { concrete_situation: 3, own_action: 3 };
  const changed = { concrete_situation: 1, own_action: 3 };

  ck(
    "no proposal: the reviewer's own assessment stands",
    deriveOutcome(null, asProposed) === "upheld",
  );
  ck("kept as proposed: upheld", deriveOutcome(proposal, asProposed) === "upheld");
  ck("any level changed: adjusted", deriveOutcome(proposal, changed) === "adjusted");
  ck(
    "a safety finding against a proposal: overturned",
    deriveOutcome(proposal, asProposed, true) === "overturned",
  );
  // Without a proposal there is nothing to overturn, whatever the finding.
  ck("no proposal is never overturned", deriveOutcome(null, asProposed, true) === "upheld");
}

console.log("\n8. The reviewer reads descriptions, and the numbers stay underneath");
{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  for (let level = 0; level <= 4; level++) {
    const key = `academy.reviews.level.${level}`;
    ck(`level ${level} has a name in both languages`, Boolean(sv[key] && en[key]));
    ck(`level ${level}'s name is not just the digit`, (sv[key] ?? "") !== String(level));
  }
  // The question "Utfall / Fastställs / Justeras / Ändras" is gone from the UI.
  const ui = require("node:fs").readFileSync(
    new URL("../src/components/academy/ReviewQueue.tsx", import.meta.url),
    "utf8",
  ) as string;
  const code = ui.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ck(
    "the reviewer is no longer asked to classify an outcome",
    !/academy\.reviews\.outcomeUpheld/.test(code),
    "OUTCOME_LABEL is still rendered",
  );
  ck("the outcome is derived instead", /deriveOutcome\(/.test(code));
  ck(
    "the descriptor-first control is used",
    /RubricLevelChoice/.test(code) && !/\$\{l\.level\} — /.test(code),
  );
  ck("plain-language framing is present", /academy\.reviews\.whatToAssess/.test(code));
  ck("the methodology is behind a toggle", /showMethod/.test(code));
}

console.log(
  fails.length
    ? `\nreview-proposal-contract: FAIL (${fails.length})`
    : "\nreview-proposal-contract: PASS",
);
process.exit(fails.length ? 1 : 0);
