/**
 * Negative controls for the Passport stale-review guard
 * (scripts/passport-review-stale-check.tsx).
 *
 * Each mutation plants one defect the guard exists for: SP_REVIEW_STALE read
 * as a generic retry, a decision that names no version or calls the bare
 * entry point, a page that decides without the version it loaded, and a page
 * that keeps showing the old content after the refusal.
 *
 * Run: bun run negative-controls:passport-review-stale
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "passport-review-stale:check";
const ERRORS = "src/lib/security-passport/decision-errors.ts";
const FNS = "src/lib/security-passport/verification.functions.ts";
const REVIEW = "src/routes/_authenticated.passport-review.tsx";
const EMPLOYER =
  "src/routes/_authenticated.employer.$employerSlug.employment-verifications.$requestId.tsx";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "STALE-NC-UNCLASSIFIED",
    defect: "SP_REVIEW_STALE falls through to unknown and reads as 'try again'",
    file: ERRORS,
    find: '  { needle: "SP_REVIEW_STALE", code: "review_stale" },\n',
    replace: "",
    guard: GUARD,
    expect: "1.2 every raised SP_REVIEW_STALE message classifies as review_stale",
  },
  {
    id: "STALE-NC-BARE-CALL",
    defect: "the server function calls the bare decision and names no version",
    file: FNS,
    find: 'rpc("sp_verifier_decide_reviewed", {',
    replace: 'rpc("sp_verifier_decide", {',
    guard: GUARD,
    expect: "2.2 the decision calls sp_verifier_decide_reviewed with the version",
  },
  {
    id: "STALE-NC-OPTIONAL-VERSION",
    defect: "the version is optional, so a page can decide without one",
    file: FNS,
    find: "reviewedSubmittedAt: z.string().min(1).max(64),",
    replace: "reviewedSubmittedAt: z.string().max(64).optional(),",
    guard: GUARD,
    expect: "2.1 the decision input requires reviewedSubmittedAt",
  },
  {
    id: "STALE-NC-REVIEW-NO-GUARD",
    defect: "the reviewer workspace decides without the loaded detail of this request",
    file: REVIEW,
    find: "if (!detail || detail.id !== selected || !detail.submittedAt) {",
    replace: "if (false) {",
    guard: GUARD,
    expect: "3.2 no decision is sent without the loaded detail of THIS request",
  },
  {
    id: "STALE-NC-REVIEW-NO-RELOAD",
    defect: "after SP_REVIEW_STALE the reviewer still sees the old content",
    file: REVIEW,
    find: 'if (code === "review_stale") {',
    replace: 'if (code === "unknown") {',
    guard: GUARD,
    expect: "3.4 on SP_REVIEW_STALE the detail is reloaded and shown",
  },
  {
    id: "STALE-NC-EMPLOYER-NO-RELOAD",
    defect: "after SP_REVIEW_STALE the employer still sees the old content",
    file: EMPLOYER,
    find: 'if (code === "review_stale") void query.refetch();',
    replace: "",
    guard: GUARD,
    expect: "4.4 on SP_REVIEW_STALE the queue is refetched so the new version is shown",
  },
  {
    id: "STALE-NC-EMPLOYER-NO-GUARD",
    defect: "the employer page decides without a loaded version",
    file: EMPLOYER,
    find: "if (!item?.submittedAt) {",
    replace: "if (false) {",
    guard: GUARD,
    expect: "4.2 no decision is sent without a loaded version",
  },
];

runControls("passport-review-stale", MUTATIONS);
