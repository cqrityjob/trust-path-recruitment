// Synthetic, offline regressions for persisted question explanations.
import assert from "node:assert/strict";
import { originalQuestionBasis } from "../src/lib/security-work/question-provenance";
import { qualityCases, referenceOutput } from "./fixtures/security-work-ai-quality-fixtures";

const workspace = "91000000-0000-4000-8000-000000000001";
const analysis = "91000000-0000-4000-8000-000000000002";
const question = "91000000-0000-4000-8000-000000000003";
const output = referenceOutput(qualityCases.find((c) => c.id === "missing")!, "en");
const proposal = output.followups[0];
// Deliberately repeat the wording: receipt identity, not text, must select it.
output.followups = [proposal];
proposal.citations = [
  {
    segmentId: "91000000-0000-4000-8000-000000000004",
    sourceItemId: "91000000-0000-4000-8000-000000000005",
    quote: "The backup test result is absent.",
  },
];
const job = {
  id: "91000000-0000-4000-8000-000000000006",
  workspace_id: workspace,
  assessment_id: analysis,
  status: "succeeded",
  output,
};
const receipt = {
  job_id: job.id,
  workspace_id: workspace,
  assessment_id: analysis,
  question_ids: [question],
};
const source = {
  id: proposal.citations[0].sourceItemId,
  workspace_id: workspace,
  original_title: "Synthetic evidence · page 2",
  factual_extract: proposal.citations[0].quote,
};
const read = (jobs = [job], receipts = [receipt], sources = [source], ids = [question]) =>
  originalQuestionBasis(workspace, analysis, ids, jobs, receipts, sources);
let checks = 0;
function check(label: string, run: () => void) {
  try {
    run();
    checks++;
  } catch (cause) {
    throw new Error(label, { cause });
  }
}
check("applied original reason and exact source survive an independent read", () => {
  assert.deepEqual(read()[question], {
    jobId: job.id,
    originalQuestion: proposal.statement,
    reason: proposal.uncertainty,
    citations: [
      {
        sourceItemId: source.id,
        sourceTitle: source.original_title,
        quote: source.factual_extract,
      },
    ],
  });
});
check("unapplied output supplies no question rationale", () =>
  assert.deepEqual(read([job], []), {}),
);
check("same wording in an unapplied newer job cannot replace the original reason", () => {
  const newer = structuredClone(job);
  newer.id = "91000000-0000-4000-8000-000000000007";
  newer.output.followups[0].uncertainty = "Unapplied replacement";
  assert.equal(read([newer, job])[question].reason, proposal.uncertainty);
});
check("foreign workspace receipt is ignored", () =>
  assert.deepEqual(read([job], [{ ...receipt, workspace_id: "foreign" }]), {}),
);
check("another assessment receipt is ignored", () =>
  assert.deepEqual(read([job], [{ ...receipt, assessment_id: "foreign" }]), {}),
);
check("foreign workspace job is ignored", () =>
  assert.deepEqual(read([{ ...job, workspace_id: "foreign" }]), {}),
);
check("unsuccessful job cannot supply trusted application context", () =>
  assert.deepEqual(read([{ ...job, status: "failed" }]), {}),
);
check("ambiguous receipt/output lengths are not guessed", () =>
  assert.deepEqual(read([job], [{ ...receipt, question_ids: [question, "extra"] }]), {}),
);
check("foreign source does not leak into citations", () =>
  assert.deepEqual(
    read([job], [receipt], [{ ...source, workspace_id: "foreign" }])[question].citations,
    [],
  ),
);
check("unsupported quote is not rendered as a source", () =>
  assert.deepEqual(
    read([job], [receipt], [{ ...source, factual_extract: "Different passage" }])[question]
      .citations,
    [],
  ),
);
check("removed/unavailable questions do not receive stale basis", () =>
  assert.deepEqual(read([job], [receipt], [source], []), {}),
);
check("missing explanation stays absent", () => {
  const empty = structuredClone(job);
  empty.output.followups[0].uncertainty = "";
  assert.deepEqual(read([empty]), {});
});
console.log(`PASS: ${checks} persisted question-provenance checks. No network or customer data.`);
