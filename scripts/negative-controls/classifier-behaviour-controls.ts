/**
 * Negative controls for the EXECUTED classifier.
 *
 * Every mutation below is a defect that a source-reading guard cannot see.
 * The harness plants it, runs the behavioural suite, and REQUIRES a named
 * diagnostic. A control that passes with the defect applied is a dead
 * assertion, and this file is the only thing that makes that visible.
 *
 * ── WHY THESE ARE NOT IN global-certification-controls.ts ──────────────
 *
 * That file's mutations target SQL, the generated types and the source-text
 * guard. These target runtime SEMANTICS and are answered by
 * `passport-classifier-behaviour:check`, which imports the modules and calls
 * them. Keeping them apart keeps each control pointed at the guard that is
 * actually meant to catch it — a control whose guard is only incidentally
 * failing is a control nobody can reason about.
 *
 * Two of these are the defects that really shipped:
 * CLASSIFIER-NC-JURISDICTION-IS-AUTHORITY and
 * CLASSIFIER-NC-UNKNOWN-LIFECYCLE-IS-CURRENT.
 *
 * Run: bun run negative-controls:classifier-behaviour
 */
import { runControls, type Mutation } from "./runner";

const CLASSIFIER = "src/lib/security-passport/classification.ts";
const SCOPE = "src/lib/security-passport/certification-scope.ts";

const GUARD = "passport-classifier-behaviour:check";

const MUTATIONS: readonly Mutation[] = [
  /* ── A jurisdiction is provenance, never authority ────────────────── */
  //
  // THE DEFECT THAT SHIPPED. `isNationalCredential` existed, was exported and
  // was called by nothing; the branch tested the country column instead. A
  // training course recorded in Sweden became a current-market REGULATED
  // credential.
  {
    id: "CLASSIFIER-NC-JURISDICTION-IS-AUTHORITY",
    defect: "a bare jurisdiction is treated as regulated national authority again",
    file: CLASSIFIER,
    find: "if (isNationalCredential(claim.definition) && claim.jurisdictionCode) {",
    replace: "if (claim.jurisdictionCode) {",
    guard: GUARD,
    expect: "definition=null + jurisdiction is NOT a regulated credential",
  },
  {
    id: "CLASSIFIER-NC-NOT-GLOBAL-IS-NATIONAL",
    defect: "'not global' collapses into national, so an undeclared scope becomes regulated",
    file: SCOPE,
    find: "  return definition?.scopeCode === NATIONAL_REGULATED_SCOPE;",
    replace: "  return !isGlobalCertification(definition);",
    guard: GUARD,
    expect: "an undeclared scope is neither global nor national",
  },

  /* ── The lifecycle gate, and where it sits ────────────────────────── */
  //
  // THE OTHER DEFECT THAT SHIPPED. The comment promised a fail-closed gate;
  // the code listed the states that are NOT current and let every other
  // string through into the international and current-market branches.
  {
    id: "CLASSIFIER-NC-UNKNOWN-LIFECYCLE-IS-CURRENT",
    defect:
      "the fail-closed lifecycle gate is removed, so an unknown state is presented as current",
    file: CLASSIFIER,
    find: `  if (!isCurrentMerit(claim.lifecycleState)) {
    return { claim, bucket: "other_self_declared", groupKey: null };
  }`,
    replace: "  void isCurrentMerit;",
    guard: GUARD,
    expect: "is not presented as current",
  },
  {
    id: "CLASSIFIER-NC-GATE-BELOW-GLOBAL",
    defect:
      "the lifecycle gate moves BELOW global classification, so a non-current CPP is international",
    file: CLASSIFIER,
    find: `  if (!isCurrentMerit(claim.lifecycleState)) {
    return { claim, bucket: "other_self_declared", groupKey: null };
  }`,
    replace: `  if (isGlobalCertification(claim.definition)) {
    return { claim, bucket: "international_certification", groupKey: null };
  }
  if (!isCurrentMerit(claim.lifecycleState)) {
    return { claim, bucket: "other_self_declared", groupKey: null };
  }`,
    guard: GUARD,
    expect: "+ global is not presented as current",
  },
  {
    id: "CLASSIFIER-NC-CURRENT-WIDENED",
    defect:
      "the gate accepts a second state as current, so 'pending_review' is presented as governed",
    file: CLASSIFIER,
    find: "  if (!isCurrentMerit(claim.lifecycleState)) {",
    replace:
      '  if (!isCurrentMerit(claim.lifecycleState) && claim.lifecycleState !== "pending_review") {',
    guard: GUARD,
    expect: 'lifecycle "pending_review"',
  },

  /* ── An overseas credential is never grouped under the holder ─────── */
  {
    id: "CLASSIFIER-NC-GROUPED-UNDER-WORK-COUNTRY",
    defect: "an overseas credential is grouped under the holder's work country instead of its own",
    file: CLASSIFIER,
    find: "          groupKey: claim.subJurisdictionCode ?? claim.jurisdictionCode,",
    replace: "          groupKey: work.subJurisdictionCode ?? work.jurisdictionCode,",
    guard: GUARD,
    expect: "grouped by ITS OWN jurisdiction",
  },

  /* ── Ordering stays total ─────────────────────────────────────────── */
  {
    id: "CLASSIFIER-NC-TIEBREAK-REMOVED",
    defect:
      "the stable id tie-break is removed, so the order depends on what the database returned",
    file: CLASSIFIER,
    find: "  return a.claim.id < b.claim.id ? -1 : a.claim.id > b.claim.id ? 1 : 0;",
    replace: "  return 0;",
    guard: GUARD,
    expect: "the comparator never returns 0 for two different rows",
  },
  {
    id: "CLASSIFIER-NC-BUCKET-RANK-DROPPED",
    defect: "the documented bucket-first ordering is silently changed to trust-first",
    file: CLASSIFIER,
    find: `  const bucket = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket];
  if (bucket !== 0) return bucket;`,
    replace: "  // bucket term removed",
    guard: GUARD,
    expect: "BUCKET leads",
  },

  /* ── The international bucket carries no country ──────────────────── */
  {
    id: "CLASSIFIER-NC-GLOBAL-GAINS-A-COUNTRY",
    defect: "an international certification is given a country group key",
    file: CLASSIFIER,
    find: `  if (isGlobalCertification(claim.definition)) {
    return { claim, bucket: "international_certification", groupKey: null };
  }`,
    replace: `  if (isGlobalCertification(claim.definition)) {
    return {
      claim,
      bucket: "international_certification",
      groupKey: claim.jurisdictionCode,
    };
  }`,
    guard: GUARD,
    expect: "a global definition outranks a stray jurisdiction, and still groups under none",
  },

  /* ── Work country is presentation, never a write ──────────────────── */
  {
    id: "CLASSIFIER-NC-WORK-COUNTRY-REWRITES-THE-CLAIM",
    defect: "classification writes the holder's work country onto the claim it was handed",
    file: CLASSIFIER,
    find: "  // 1. A draft is private work in progress, whatever it is a draft OF.",
    replace: `  (claim as { jurisdictionCode: string | null }).jurisdictionCode =
    work.jurisdictionCode ?? claim.jurisdictionCode;
  // 1. A draft is private work in progress, whatever it is a draft OF.`,
    guard: GUARD,
    expect: "classifying under two work countries mutates no claim",
  },

  /* ── A draft is still the one bucket a recipient never sees ───────── */
  {
    id: "CLASSIFIER-NC-DRAFT-BECOMES-DISCLOSABLE",
    defect: "draft joins the disclosable buckets, so unfinished private work can be shared",
    file: CLASSIFIER,
    find: `export const DISCLOSABLE_BUCKETS: readonly PassportBucket[] = [
  "historical",`,
    replace: `export const DISCLOSABLE_BUCKETS: readonly PassportBucket[] = [
  "draft",
  "historical",`,
    guard: GUARD,
    expect: "exactly one bucket (draft) is not disclosable",
  },
];

runControls("classifier-behaviour", MUTATIONS);
