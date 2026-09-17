/**
 * BESKT PR 6 negative controls: every material assertion of the product
 * completion guard must detect a planted defect in the REAL surface — the
 * prompt components, the report, the payload reader, the governance server
 * functions, the pure decisions, the admin route and the registration —
 * never a comment, and never a sentence that merely describes the rule.
 *
 * Each mutation introduces exactly the defect one assertion exists to catch,
 * the guard must fail with that assertion's named diagnostic, and every file
 * is restored byte-for-byte (proved by the shared runner, which refuses to
 * start against a dirty tree and checks the tree again at the end).
 *
 * The behaviour controls matter most here. Four of the rules this guard
 * enforces — the absent-versus-null contract, the three ways an approval
 * goes stale, the two liveness windows, and the limitations the report
 * derives — are decisions, and a source pattern asserting a decision is a
 * pattern asserting its spelling. Those controls break the DECISION and
 * require the guard to notice.
 *
 * Run: bun run negative-controls:beskt-product-completion
 */
import { runControls, type Mutation } from "./runner";

const PROMPTS = "src/components/employer/interview/beskt/BesktPrompts.tsx";
const THEMES = "src/components/employer/interview/beskt/BesktThemes.tsx";
const REPORT = "src/components/employer/interview/beskt/BesktReport.tsx";
const PAYLOAD = "src/lib/beskt/report-payload.ts";
const QUERIES = "src/lib/beskt/conduct-queries.ts";
const GOV_FNS = "src/lib/beskt/governance.functions.ts";
const GOV_LOGIC = "src/components/admin/beskt/governance-logic.ts";
const SCHEMA = "src/components/admin/beskt/content-schema.ts";
const EDITOR = "src/components/admin/beskt/BesktContentEditor.tsx";
const LIFECYCLE = "src/components/admin/beskt/BesktLifecyclePanel.tsx";
const ADMIN_ROUTE = "src/routes/_authenticated.admin.beskt-methods.$methodVersionId.tsx";
const CHROME = "src/components/admin/AdminShellChrome.tsx";
const ERRORS = "src/lib/beskt/errors.ts";
const DICT = "src/i18n/dictionaries.ts";
const PKG = "package.json";
const CI = ".github/workflows/ci.yml";

const GUARD = "beskt-product-completion:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- P1 · The wordings are the database's ------------------------------
  {
    id: "PC-NC-PROMPT-INVENTED",
    defect:
      "THE ORIGINAL DEFECT: the prompt surface starts carrying a wording of its own, so a screen can show an interviewer a question the method never governed",
    file: PROMPTS,
    find: "function PromptRow({ prompt }: { prompt: BesktPrompt }) {\n  const { t, lang } = useT();",
    replace:
      'function PromptRow({ prompt }: { prompt: BesktPrompt }) {\n  const { t, lang } = useT();\n  const wordingSv = "Kan du berätta mer om det?";\n  void wordingSv;',
    guard: GUARD,
    expect: "BESKT_PC_PROMPT_INVENTED",
  },
  {
    id: "PC-NC-PROMPT-GENERATED",
    defect: "a suggestion is generated in the client, putting a model in the prompt path",
    file: PROMPTS,
    find: "export function BesktThemePrompts({ prompts }: { prompts: readonly BesktPrompt[] }) {",
    replace:
      'function suggestPrompt(): string {\n  return "";\n}\nvoid suggestPrompt;\nexport function BesktThemePrompts({ prompts }: { prompts: readonly BesktPrompt[] }) {',
    guard: GUARD,
    expect: "BESKT_PC_PROMPT_GENERATED",
  },
  {
    id: "PC-NC-PROMPT-PLACEHOLDER-RETURNS",
    defect:
      "the old 'the wordings are not yet available on this surface' placeholder comes back, so the screen claims something untrue about a method that answers perfectly well",
    file: THEMES,
    find: "      {prompts !== null && !prompts.available && (",
    replace:
      '      <p>{t("beskt.conduct.themes.promptsUnavailable")}</p>\n      {prompts !== null && !prompts.available && (',
    guard: GUARD,
    expect: "BESKT_PC_PROMPT_STALE_PLACEHOLDER",
  },
  {
    id: "PC-NC-PROMPT-LOADING-CONFLATED",
    defect:
      "a still-loading answer renders as an unavailable one, so an interviewer is told the method's wordings are gone half a second before they arrive",
    file: THEMES,
    find: "      {prompts !== null && !prompts.available && (",
    replace: "      {!prompts?.available && (",
    guard: GUARD,
    expect: "BESKT_PC_PROMPT_LOADING_CONFLATED",
  },
  {
    id: "PC-NC-PROMPT-REASON-COLLAPSED",
    defect:
      "the three governed unavailability reasons collapse into one generic sentence, so nobody can tell a suspended method from an unreadable one",
    file: PROMPTS,
    find: '  version_not_published: "beskt.conduct.prompts.unavailable.versionNotPublished",',
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_PROMPT_REASON",
  },
  {
    id: "PC-NC-PROMPT-CUE",
    defect:
      "a behavioural cue becomes representable as a probe basis, so the screen can tell an interviewer that hesitation is something a question may be grounded in",
    file: PROMPTS,
    find: '  candidate_correction: "beskt.conduct.prompts.basis.candidate_correction",',
    replace:
      '  candidate_correction: "beskt.conduct.prompts.basis.candidate_correction",\n  hesitation_or_tone: "beskt.conduct.prompts.basis.candidate_correction",',
    guard: GUARD,
    expect: "BESKT_PC_PROMPT_CUE",
  },
  {
    id: "PC-NC-PROMPT-KEY-INVALIDATED",
    defect:
      "the governance wordings are invalidated by every conduct write, so saving one note refetches the method catalogue",
    file: QUERIES,
    find: "    keys.push(besktReportKey(employerSlug, caseId, sessionId));",
    replace:
      "    keys.push(besktReportKey(employerSlug, caseId, sessionId));\n    keys.push(besktPromptsKey(employerSlug, caseId, sessionId));",
    guard: GUARD,
    expect: "BESKT_PC_PROMPT_KEY",
  },

  // ---- P2 · The report is a rendering ------------------------------------
  {
    id: "PC-NC-REPORT-SCORE",
    defect:
      "THE ORIGINAL DEFECT: the report grows a score, which is the single thing the whole method exists to not produce",
    file: PAYLOAD,
    find: "export interface BesktReportLimitations {",
    replace:
      "export interface BesktReportScore {\n  readonly score: number;\n}\nexport interface BesktReportLimitations {",
    guard: GUARD,
    expect: "BESKT_PC_REPORT_SCORE",
  },
  {
    id: "PC-NC-REPORT-ARITHMETIC",
    defect:
      "the payload reader starts computing over the record, which is how a total arrives without anybody deciding to add one",
    file: PAYLOAD,
    find: "  const resolvedItems = new Set((d.panel?.resolutions ?? []).map((r) => r.itemKey));",
    replace:
      "  const resolvedItems = new Set((d.panel?.resolutions ?? []).map((r) => r.itemKey));\n  const documentedRatio = documented.size / Math.max(d.themes.length, 1);\n  void documentedRatio;",
    guard: GUARD,
    expect: "BESKT_PC_REPORT_ARITHMETIC",
  },
  {
    id: "PC-NC-REPORT-MERGED",
    defect:
      "the panel's own words lose their heading and are folded into the assessors' section, so a reader cannot tell a resolution from an observation",
    file: REPORT,
    find: '        {t("beskt.report.panel.heading")}',
    replace: '        {t("beskt.report.positions.heading")}',
    guard: GUARD,
    expect: "BESKT_PC_REPORT_MERGED",
  },
  {
    id: "PC-NC-REPORT-LIMITS-LAST",
    defect:
      "the limitations move below the evidence, so a reader meets them after they have already formed a view",
    file: REPORT,
    find:
      "      <LimitationsBlock d={d} />\n" +
      "      <ProvenanceBlock d={d} contentHash={contentHash} basisHash={basisHash} />\n" +
      "      <CandidateStatements d={d} />",
    replace:
      "      <ProvenanceBlock d={d} contentHash={contentHash} basisHash={basisHash} />\n" +
      "      <CandidateStatements d={d} />\n" +
      "      <LimitationsBlock d={d} />",
    guard: GUARD,
    expect: "BESKT_PC_REPORT_LIMITS_LAST",
  },
  {
    id: "PC-NC-REPORT-BASIS-RECOMPUTED",
    defect:
      "the client signs a hash it computed rather than the one it displayed, so a human stands behind a record they never read",
    file: REPORT,
    find: "              onClick={() => actions.finalise(preview.basisHash)}",
    replace:
      "              onClick={() => actions.finalise(String(crypto.subtle && preview.contentHash))}",
    guard: GUARD,
    expect: "BESKT_PC_REPORT_BASIS_RECOMPUTED",
  },
  {
    id: "PC-NC-REPORT-DRAFT-UNMARKED",
    defect:
      "an unsigned preview stops saying it is a draft, so a printout of it is indistinguishable from a signed report",
    file: REPORT,
    find: '            <Chip tone="attention">{t("beskt.report.document.draftChip")}</Chip>',
    replace: '            <Chip tone="attention">{t("beskt.report.document.finalChip")}</Chip>',
    guard: GUARD,
    expect: "BESKT_PC_REPORT_DRAFT_UNMARKED",
  },
  {
    id: "PC-NC-REPORT-RAW-BLOCKER",
    defect:
      "the database's own blocker sentence reaches a recruiter's screen instead of ours, carrying counts and schema vocabulary with it",
    file: REPORT,
    find:
      "          <li key={b.code}>\n" +
      '            {BLOCKER_LABEL[b.code] ? t(BLOCKER_LABEL[b.code]) : t("beskt.error.generic")}\n' +
      "          </li>",
    replace: "          <li key={b.code}>{b.message}</li>",
    guard: GUARD,
    expect: "BESKT_PC_REPORT_RAW_BLOCKER",
  },
  {
    id: "PC-NC-REPORT-NO-DISCLAIMER",
    defect:
      "the report stops saying on its own face that it carries no score and is not a decision",
    file: REPORT,
    find: '          <p className="mt-2">{t("beskt.report.notADecision.noScore")}</p>',
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_REPORT_NO_DISCLAIMER",
  },

  {
    id: "PC-NC-PREVIEW-INDEPENDENCE",
    defect:
      "THE ORIGINAL DEFECT: the report preview is fetched regardless of whether the reader may see other positions, so an assessor with an open position reads a colleague's locked record — the one thing the conduct layer exists to prevent",
    file: "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.beskt.tsx",
    find: '    enabled: sessionId !== null && view === "report" && othersVisible,',
    replace: '    enabled: sessionId !== null && view === "report",',
    guard: GUARD,
    expect: "BESKT_PC_PREVIEW_INDEPENDENCE",
  },
  {
    id: "PC-NC-PREVIEW-WITHHELD-SILENT",
    defect:
      "the withheld report renders as nothing at all, so an interviewer cannot tell a withheld report from a broken screen",
    file: "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.beskt.tsx",
    find: '            <p>{t("beskt.report.withheld.body")}</p>',
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_PREVIEW_WITHHELD_SILENT",
  },

  // ---- P2b · BEHAVIOUR: the limitations --------------------------------
  {
    id: "PC-NC-LIMIT-UNDOCUMENTED-HIDDEN",
    defect:
      "BEHAVIOUR: a theme nobody documented stops being reported, so the report reads as complete when it is not",
    file: PAYLOAD,
    find: "    undocumentedThemes: d.themes.map((th) => th.itemKey).filter((k) => !documented.has(k)),",
    replace: "    undocumentedThemes: [],",
    guard: GUARD,
    expect: "BESKT_PC_LIMIT_UNDOCUMENTED",
  },
  {
    id: "PC-NC-LIMIT-UNRESOLVED-AS-AWAITING",
    defect:
      "BEHAVIOUR: verification that could not be settled is reported as merely still waiting, which is a different and more reassuring claim",
    file: PAYLOAD,
    find: 'const UNRESOLVED_VERIFICATION = new Set(["not_verified", "inconclusive"]);',
    replace: "const UNRESOLVED_VERIFICATION = new Set<string>([]);",
    guard: GUARD,
    expect: "BESKT_PC_LIMIT_UNRESOLVED",
  },
  {
    id: "PC-NC-LIMIT-DIFFERENCE-HIDDEN",
    defect:
      "BEHAVIOUR: a theme two assessors documented differently and the panel never resolved stops being reported",
    file: PAYLOAD,
    find:
      "    unresolvedDifferences: [...byItemPositions.entries()]\n" +
      "      .filter(([itemKey, positions]) => positions.size > 1 && !resolvedItems.has(itemKey))\n" +
      "      .map(([itemKey]) => itemKey),",
    replace: "    unresolvedDifferences: [],",
    guard: GUARD,
    expect: "BESKT_PC_LIMIT_DIFFERENCE",
  },
  {
    id: "PC-NC-LIMIT-RESOLVED-STILL-REPORTED",
    defect:
      "BEHAVIOUR: a difference the panel DID resolve goes on being reported as unresolved, so the panel's work is invisible",
    file: PAYLOAD,
    find: "      .filter(([itemKey, positions]) => positions.size > 1 && !resolvedItems.has(itemKey))",
    replace: "      .filter(([, positions]) => positions.size > 1)",
    guard: GUARD,
    expect: "BESKT_PC_LIMIT_RESOLVED",
  },
  {
    id: "PC-NC-REPORT-CORRECTIONS-DROPPED",
    defect:
      "BEHAVIOUR: the correction chain is dropped from the read, so a note whose wording changed reads as if it had always said what it says now",
    file: PAYLOAD,
    find: "    corrections: arr(e.corrections).map(toCorrection),",
    replace: "    corrections: [],",
    guard: GUARD,
    expect: "BESKT_PC_REPORT_CORRECTIONS_DROPPED",
  },

  // ---- P3 · The governance surface --------------------------------------
  {
    id: "PC-NC-GOV-DIRECT-WRITE",
    defect:
      "THE ORIGINAL DEFECT: the governance module writes a governed table directly, stepping around the RPC that holds the authority",
    file: GOV_FNS,
    find: '    const { data: row, error } = await context.supabase.rpc("beskt_publish_version", {',
    replace:
      '    await context.supabase\n      .from("beskt_method_versions")\n      .update({ content_status: "published" })\n      .eq("id", data.methodVersionId);\n' +
      '    const { data: row, error } = await context.supabase.rpc("beskt_publish_version", {',
    guard: GUARD,
    expect: "BESKT_PC_GOV_DIRECT_WRITE",
  },
  {
    id: "PC-NC-GOV-SERVICE-ROLE",
    defect: "the governance path starts naming service_role, stepping around every row policy",
    file: GOV_FNS,
    find: "const opId = z.string().uuid();",
    replace: 'const ELEVATED = "service_role";\nvoid ELEVATED;\nconst opId = z.string().uuid();',
    guard: GUARD,
    expect: "BESKT_PC_SERVICE_ROLE",
  },
  {
    id: "PC-NC-GOV-ACTOR-SENT",
    defect:
      "a mutation starts naming the actor, so a caller who can name a reviewer can record a decision on somebody else's behalf",
    file: GOV_FNS,
    find:
      '    const { data: row, error } = await context.supabase.rpc("beskt_record_review", {\n' +
      "      _operation_id: data.operationId,",
    replace:
      '    const { data: row, error } = await context.supabase.rpc("beskt_record_review", {\n' +
      "      _reviewer_id: data.operationId,\n" +
      "      _operation_id: data.operationId,",
    guard: GUARD,
    expect: "BESKT_PC_GOV_ACTOR_SENT",
  },
  {
    id: "PC-NC-GOV-REVISION",
    defect:
      "a compare-and-swap mutation sends a constant revision, so two editors overwrite one another silently",
    file: ADMIN_ROUTE,
    find:
      "          methodVersionId,\n" +
      "          expectedRevision: revision,\n" +
      "          payload: input.payload,",
    replace:
      "          methodVersionId,\n" +
      "          expectedRevision: 1,\n" +
      "          payload: input.payload,",
    guard: GUARD,
    expect: "BESKT_PC_GOV_REVISION",
  },
  {
    id: "PC-NC-GOV-OPERATION-ID",
    defect:
      "a governed mutation mints a fresh operation id inside the server function, so a retry after a dropped response writes twice",
    file: GOV_FNS,
    find:
      '    const { data: row, error } = await context.supabase.rpc("beskt_submit_for_review", {\n' +
      "      _operation_id: data.operationId,",
    replace:
      '    const { data: row, error } = await context.supabase.rpc("beskt_submit_for_review", {\n' +
      "      _operation_id: crypto.randomUUID(),",
    guard: GUARD,
    expect: "BESKT_PC_GOV_OPERATION_ID",
  },
  {
    id: "PC-NC-GOV-IMPOSSIBLE-ACTION",
    defect:
      "the pilot form is offered on an unpublished version, which the database always refuses — an action that can only fail is a trap",
    file: ADMIN_ROUTE,
    find: '                canGrant: v.contentStatus === "published",',
    replace: "                canGrant: true,",
    guard: GUARD,
    expect: "BESKT_PC_GOV_IMPOSSIBLE_ACTION",
  },
  {
    id: "PC-NC-GOV-EDIT-PUBLISHED",
    defect:
      "the content form is offered on a published version, so an editor is invited to change frozen governed content",
    file: ADMIN_ROUTE,
    find: '  const editable = v.contentStatus === "draft";',
    replace: "  const editable = true;",
    guard: GUARD,
    expect: "BESKT_PC_GOV_EDIT_PUBLISHED",
  },
  {
    id: "PC-NC-GOV-NAV",
    defect:
      "the governance destination disappears from the platform navigation, so nobody can reach it",
    file: CHROME,
    find: '      key: "besktMethods",\n      labelKey: "admin.nav.besktMethods",\n      to: "/admin/beskt-methods",',
    replace:
      '      key: "besktMethods",\n      labelKey: "admin.nav.besktMethods",\n      to: "/admin",',
    guard: GUARD,
    expect: "BESKT_PC_GOV_NAV",
  },

  // ---- P3b · BEHAVIOUR: absent versus null -------------------------------
  {
    id: "PC-NC-PAYLOAD-UNCHANGED-SENT",
    defect:
      "BEHAVIOUR: an untouched field is resent, so a partial edit can blank a governed column the editor never looked at",
    file: GOV_LOGIC,
    find: "    if (text === before) continue;",
    replace: "    if (false) continue;",
    guard: GUARD,
    expect: "BESKT_PC_PAYLOAD_UNCHANGED_SENT",
  },
  {
    id: "PC-NC-PAYLOAD-CLEAR-LOST",
    defect:
      "BEHAVIOUR: an emptied field is omitted rather than nulled, so clearing a governed field becomes impossible through the form",
    file: GOV_LOGIC,
    find: '    if (text === "") {\n      payload[field.name] = null;\n      continue;\n    }',
    replace: '    if (text === "") {\n      continue;\n    }',
    guard: GUARD,
    expect: "BESKT_PC_PAYLOAD_CLEAR_LOST",
  },
  {
    id: "PC-NC-PAYLOAD-CREATE-NULL",
    defect:
      "BEHAVIOUR: creation sends an explicit null for an empty optional field, overriding the column's own default",
    file: GOV_LOGIC,
    find:
      "    if (stored === null) {\n" +
      '      if (text !== "") payload[field.name] = field.kind === "integer" ? Number(text) : text;\n' +
      "      continue;\n" +
      "    }",
    replace:
      "    if (stored === null) {\n" +
      '      payload[field.name] = text === "" ? null : field.kind === "integer" ? Number(text) : text;\n' +
      "      continue;\n" +
      "    }",
    guard: GUARD,
    expect: "BESKT_PC_PAYLOAD_CREATE_NULL",
  },
  {
    id: "PC-NC-PAYLOAD-SPURIOUS-CHANGE",
    defect:
      "BEHAVIOUR: a multi-value field compares unsorted, so merely reordering the same values bumps the revision and invalidates five approvals",
    file: GOV_LOGIC,
    find: "      const beforeSorted = [...before].sort();",
    replace: "      const beforeSorted = [...before];",
    guard: GUARD,
    expect: "BESKT_PC_PAYLOAD_SPURIOUS_CHANGE",
  },

  // ---- P3c · BEHAVIOUR: what a gate binds to -----------------------------
  {
    id: "PC-NC-GATE-STALE-CYCLE",
    defect:
      "BEHAVIOUR: an approval from an earlier review cycle goes on counting, so a rejected-and-resubmitted version publishes on stale approvals",
    file: GOV_LOGIC,
    find:
      "  if (review.reviewCycleAtReview !== version.reviewCycle)\n" +
      '    return { kind: "stale", review, reason: "cycle" };',
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_GATE_STALE_CYCLE",
  },
  {
    id: "PC-NC-GATE-STALE-HASH",
    defect:
      "BEHAVIOUR: an approval survives the content it approved, so an edited version shows five green gates",
    file: GOV_LOGIC,
    find:
      "  if (review.contentHashAtReview !== version.contentHash)\n" +
      '    return { kind: "stale", review, reason: "hash" };',
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_GATE_STALE_HASH",
  },
  {
    id: "PC-NC-GATE-STALE-REVISION",
    defect:
      "BEHAVIOUR: a touch that restored byte-identical content no longer invalidates the gates, which is the one case the hash alone cannot catch",
    file: GOV_LOGIC,
    find:
      "  if (review.revisionAtReview !== version.revision)\n" +
      '    return { kind: "stale", review, reason: "revision" };',
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_GATE_STALE_REVISION",
  },
  {
    id: "PC-NC-GATE-REJECTION-HIDDEN",
    defect:
      "BEHAVIOUR: a rejection is softened into an out-of-date approval, so a refusal reads as a technicality",
    file: GOV_LOGIC,
    find: '  if (review.decision === "rejected") return { kind: "rejected", review };',
    replace: '  if (review.decision === "rejected") return { kind: "undecided" };',
    guard: GUARD,
    expect: "BESKT_PC_GATE_REJECTION_HIDDEN",
  },
  {
    id: "PC-NC-GATE-UNDECIDED",
    defect: "BEHAVIOUR: a gate nobody decided reads as approved",
    file: GOV_LOGIC,
    find: '  if (!review) return { kind: "undecided" };',
    replace:
      '  if (!review)\n    return {\n      kind: "approved",\n      review: {\n        gate,\n        decision: "approved",\n        reviewerId: "",\n        rationale: "",\n        contentHashAtReview: "",\n        revisionAtReview: 0,\n        reviewCycleAtReview: 0,\n        decidedAt: "",\n      },\n    };',
    guard: GUARD,
    expect: "BESKT_PC_GATE_UNDECIDED",
  },

  // ---- P3d · BEHAVIOUR: the two liveness windows -------------------------
  {
    id: "PC-NC-GRANT-REVOKED-LIVE",
    defect:
      "BEHAVIOUR: a revoked mandate reads as live, so a reviewer is told they may decide a gate the database will refuse",
    file: GOV_LOGIC,
    find: "  if (grant.revokedAt !== null) return false;\n  if (grant.validFrom !== undefined",
    replace: "  if (grant.validFrom !== undefined",
    guard: GUARD,
    expect: "BESKT_PC_GRANT_REVOKED_LIVE",
  },
  {
    id: "PC-NC-GRANT-EXPIRED-LIVE",
    defect: "BEHAVIOUR: an expired mandate reads as live",
    file: GOV_LOGIC,
    find: "  if (grant.validUntil !== null && new Date(grant.validUntil) <= now) return false;\n  return true;",
    replace: "  return true;",
    guard: GUARD,
    expect: "BESKT_PC_GRANT_EXPIRED_LIVE",
  },
  {
    id: "PC-NC-PILOT-WINDOW",
    defect:
      "BEHAVIOUR: the pilot window becomes inclusive at its end, so a grant reads as live on the day it expires",
    file: GOV_LOGIC,
    find: "  return grant.startsOn <= today && today < grant.expiresOn;",
    replace: "  return grant.startsOn <= today && today <= grant.expiresOn;",
    guard: GUARD,
    expect: "BESKT_PC_PILOT_WINDOW",
  },
  {
    id: "PC-NC-PILOT-REVOKED-LIVE",
    defect: "BEHAVIOUR: a revoked pilot grant reads as live, so a revoked employer looks admitted",
    file: GOV_LOGIC,
    find: "  if (grant.revokedAt !== null) return false;\n  return grant.startsOn <= today && today < grant.expiresOn;",
    replace: "  return grant.startsOn <= today && today < grant.expiresOn;",
    guard: GUARD,
    expect: "BESKT_PC_PILOT_REVOKED_LIVE",
  },

  // ---- P4 · The form matches the contract --------------------------------
  {
    id: "PC-NC-SCHEMA-DRIFT",
    defect:
      "THE ORIGINAL DEFECT: a governed field disappears from the form while the RPC still accepts it, so an editor cannot set it and does not know it exists",
    file: SCHEMA,
    find: '      f("lawful_basis_reference", "text", false),',
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_SCHEMA_DRIFT",
  },
  {
    id: "PC-NC-VOCAB-DRIFT",
    defect:
      "a closed vocabulary drifts from the CHECK constraint, so the form offers a value the database will refuse",
    file: SCHEMA,
    find: '  "acknowledgement",\n] as const;\n\nexport const REQUIREDNESS',
    replace: '  "acknowledgement",\n  "free_form",\n] as const;\n\nexport const REQUIREDNESS',
    guard: GUARD,
    expect: "BESKT_PC_VOCAB_DRIFT",
  },
  {
    id: "PC-NC-VOCAB-FREE-TEXT",
    defect:
      "a governed classification becomes free text, so an editor can type an access class into a recruitment method by hand",
    file: SCHEMA,
    find: '      f("access_class", "select", true, ACCESS_CLASSES),\n      f("content_provenance", "select", true, PROVENANCE),\n      f("source_reference", "text", false),\n      f("prohibited_inferences", "multiselect", false, PROHIBITED_INFERENCES),',
    replace:
      '      f("access_class", "text", true),\n      f("content_provenance", "select", true, PROVENANCE),\n      f("source_reference", "text", false),\n      f("prohibited_inferences", "multiselect", false, PROHIBITED_INFERENCES),',
    guard: GUARD,
    expect: "BESKT_PC_VOCAB_FREE_TEXT",
  },

  // ---- P5 · Language -----------------------------------------------------
  {
    id: "PC-NC-RAW-ERROR",
    defect:
      "THE ORIGINAL DEFECT: a raised database message reaches the DOM, where it can carry a table, a column or a query fragment",
    file: EDITOR,
    find: "              <p>{t(besktErrorKey(error))}</p>",
    replace: "              <p>{String(error)}</p>",
    guard: GUARD,
    expect: "BESKT_PC_RAW_ERROR",
  },
  {
    id: "PC-NC-VALIDATOR-UNATTRIBUTED",
    defect:
      "the validator's own sentence is presented as the product's, so a reader cannot tell whose words name the incomplete row",
    file: LIFECYCLE,
    find: '          {t("beskt.admin.validate.ownWords")}',
    replace: '          {t("beskt.admin.validate.clear")}',
    guard: GUARD,
    expect: "BESKT_PC_VALIDATOR_UNATTRIBUTED",
  },
  {
    id: "PC-NC-UNTRANSLATED-ERROR",
    defect: "a surface stops translating its refusals at all",
    file: LIFECYCLE,
    // The CALL SITE, not the import: leaving the import in place is exactly
    // the shape that made the first version of this assertion dead.
    find: "              <p>{t(besktErrorKey(actions.error))}</p>",
    replace: '              <p>{t("beskt.error.generic")}</p>',
    guard: GUARD,
    expect: "BESKT_PC_UNTRANSLATED_ERROR",
  },
  {
    id: "PC-NC-ERROR-FAMILY",
    defect:
      "BEHAVIOUR: the translator stops recognising the BESKT_ governance family, so every governance refusal falls through to the generic sentence",
    file: ERRORS,
    find: "  const m = /\\bBESKT_[A-Z_]+\\b|\\bBCP_[A-Z_]+\\b/.exec(raw);",
    replace: "  const m = /\\bBCP_[A-Z_]+\\b/.exec(raw);",
    guard: GUARD,
    expect: "BESKT_PC_ERROR_FAMILY",
  },
  {
    id: "PC-NC-ERROR-MAPPING",
    defect:
      "BEHAVIOUR: a governance refusal loses its own sentence, so a reviewer without a mandate is told only that something went wrong",
    file: ERRORS,
    find: '  BESKT_GATE_NOT_GRANTED: "beskt.error.govGateNotGranted",',
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_ERROR_MAPPING",
  },
  {
    id: "PC-NC-ERROR-INVENTED",
    defect:
      "the translator claims a code no migration raises, which is a sentence written for a refusal that cannot happen",
    file: ERRORS,
    find: '  BESKT_NOT_AUTHENTICATED: "beskt.error.notAuthenticated",',
    replace:
      '  BESKT_NOT_AUTHENTICATED: "beskt.error.notAuthenticated",\n  BESKT_IMAGINARY_REFUSAL: "beskt.error.generic",',
    guard: GUARD,
    expect: "BESKT_PC_ERROR_INVENTED",
  },
  {
    id: "PC-NC-LANGUAGE-PARITY",
    defect:
      "a Swedish key loses its English twin, so an English reader sees a raw translation key on the governance surface",
    file: DICT,
    find: '    "beskt.admin.pilot.heading": "Pilot grants",',
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_LANGUAGE_PARITY",
  },

  // ---- P6 · Touch, focus and structure -----------------------------------
  {
    id: "PC-NC-TOUCH-TARGET",
    defect:
      "a control on the governance surface drops below the 44px floor, making it unusable one-handed on a phone",
    file: EDITOR,
    find: 'const BUTTON =\n  "inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";',
    replace:
      'const BUTTON =\n  "inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";',
    guard: GUARD,
    expect: "BESKT_PC_TOUCH_TARGET",
  },
  {
    id: "PC-NC-A11Y-LABEL",
    defect: "a section loses its accessible label, becoming a wall of text to a screen-reader user",
    file: EDITOR,
    find: "      aria-labelledby={`beskt-family-${family}-h`}",
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_A11Y_LABEL",
  },
  {
    id: "PC-NC-A11Y-ALERT",
    defect: "a refusal stops being announced and is reported by colour alone",
    file: LIFECYCLE,
    find: '            <NoticePanel tone="governance" role="alert" title={t("beskt.admin.actionRefused")}>',
    replace: '            <NoticePanel tone="governance" title={t("beskt.admin.actionRefused")}>',
    guard: GUARD,
    expect: "BESKT_PC_A11Y_ALERT",
  },
  {
    id: "PC-NC-STATE-MISSING",
    defect:
      "the report loses its error state, so a failed read is indistinguishable from a case with no report",
    file: "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.beskt.tsx",
    find: '          ) : reportQ.isError ? (\n            <State kind="error" message={t(besktErrorKey(reportQ.error))} />',
    replace: '          ) : false ? (\n            <State kind="error" message="" />',
    guard: GUARD,
    expect: "BESKT_PC_STATE_MISSING",
  },

  // ---- P7 · Registration -------------------------------------------------
  {
    id: "PC-NC-REGISTRATION-CI",
    defect: "CI stops running the guard, so it can rot without anybody noticing",
    file: CI,
    find: "        run: bun run beskt-product-completion:check",
    replace: "        run: echo skipped",
    guard: GUARD,
    expect: "BESKT_PC_REGISTRATION",
  },
  {
    id: "PC-NC-REGISTRATION-CHAIN",
    defect:
      "the planted controls drop out of negative-controls:all, so a dead assertion stops being detected",
    file: PKG,
    find: "bun run negative-controls:beskt-product-completion && ",
    replace: "",
    guard: GUARD,
    expect: "BESKT_PC_REGISTRATION",
  },
];

await runControls("beskt-product-completion", MUTATIONS);
