/**
 * BESKT PR 5B negative controls: every material assertion of the interview
 * TOOL guard must detect a planted defect in the REAL surface — the server
 * functions, the route, the components, the query identity, the dictionaries
 * and the registration — never a comment, and never a sentence that merely
 * describes the rule.
 *
 * Each mutation introduces exactly the defect one assertion exists to catch,
 * the guard must fail with that assertion's named diagnostic, and every file
 * is restored byte-for-byte (proved by the shared runner, which also refuses
 * to start against a dirty tree and checks the tree again at the end).
 *
 * Run: bun run negative-controls:beskt-interview-tool
 */
import { runControls, type Mutation } from "./runner";

const FUNCTIONS = "src/lib/beskt/interview-conduct.functions.ts";
const QUERIES = "src/lib/beskt/conduct-queries.ts";
const ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.beskt.tsx";
const SNAPSHOT = "src/components/employer/interview/beskt/BesktSnapshot.tsx";
const THEMES = "src/components/employer/interview/beskt/BesktThemes.tsx";
const ENTRY_FORM = "src/components/employer/interview/beskt/BesktEntryForm.tsx";
const HISTORY = "src/components/employer/interview/beskt/BesktEntryHistory.tsx";
const POSITION = "src/components/employer/interview/beskt/BesktPosition.tsx";
const PANEL = "src/components/employer/interview/beskt/BesktPanel.tsx";
const UI = "src/components/employer/interview/beskt/BesktConductUi.tsx";
const MODULE_CARD = "src/components/employer/interview/beskt/BesktModuleCard.tsx";
const VERIFY_FORM = "src/components/employer/interview/beskt/BesktVerificationForm.tsx";
const DICT = "src/i18n/dictionaries.ts";
const PKG = "package.json";
const CI = ".github/workflows/ci.yml";

const GUARD = "beskt-interview-tool:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The server functions stay thin and governed -------------------------
  {
    id: "TOOL-NC-SERVICE-ROLE",
    defect: "the conduct module starts naming service_role, stepping around every row policy",
    file: FUNCTIONS,
    find: "const operation = z.object({ operationId: z.string().uuid() });",
    replace:
      'const operation = z.object({ operationId: z.string().uuid() });\nconst ELEVATED_ROLE = "service_role";\nvoid ELEVATED_ROLE;',
    guard: GUARD,
    expect: "BESKT_TOOL_SERVICE_ROLE",
  },
  {
    id: "TOOL-NC-DIRECT-WRITE",
    defect: "a mutation writes a conduct table directly instead of going through its governed RPC",
    file: FUNCTIONS,
    find: '    const { data: row, error } = await context.supabase.rpc("bcp_conduct_lock_position", {',
    replace:
      '    await context.supabase.from("bcp_conduct_sessions").update({ state: "concluded" });\n' +
      '    const { data: row, error } = await context.supabase.rpc("bcp_conduct_lock_position", {',
    guard: GUARD,
    expect: "BESKT_TOOL_DIRECT_WRITE",
  },
  {
    id: "TOOL-NC-FRESH-OPERATION-ID",
    defect:
      "a mutation mints a new operation id per attempt, so a retry after a dropped response writes twice",
    file: FUNCTIONS,
    find:
      '    const { data: row, error } = await context.supabase.rpc("bcp_conduct_lock_position", {\n' +
      "      _operation_id: data.operationId,",
    replace:
      '    const { data: row, error } = await context.supabase.rpc("bcp_conduct_lock_position", {\n' +
      "      _operation_id: crypto.randomUUID(),",
    guard: GUARD,
    expect: "BESKT_TOOL_OPERATION_ID",
  },
  {
    id: "TOOL-NC-REVISION-IGNORED",
    defect:
      "a compare-and-swap mutation stops forwarding the revision it read, so two interviewers overwrite one another silently",
    file: FUNCTIONS,
    find:
      '    const { data: row, error } = await context.supabase.rpc("bcp_conduct_save_entry", {\n' +
      "      _operation_id: data.operationId,\n" +
      "      _position_id: data.positionId,\n" +
      "      _expected_revision: data.expectedRevision,",
    replace:
      '    const { data: row, error } = await context.supabase.rpc("bcp_conduct_save_entry", {\n' +
      "      _operation_id: data.operationId,\n" +
      "      _position_id: data.positionId,\n" +
      "      _expected_revision: 1,",
    guard: GUARD,
    expect: "BESKT_TOOL_EXPECTED_REVISION",
  },
  {
    id: "TOOL-NC-CLIENT-EMPLOYER",
    defect:
      "the client is allowed to name the employer, a fact the database derives and must never be told",
    file: FUNCTIONS,
    find: "  .validator((d: unknown) => operation.extend({ linkId: z.string().uuid() }).parse(d))",
    replace:
      "  .validator((d: unknown) =>\n" +
      "    operation.extend({ linkId: z.string().uuid(), employerId: z.string().uuid() }).parse(d),\n" +
      "  )",
    guard: GUARD,
    expect: "BESKT_TOOL_CLIENT_FACT",
  },

  // ---- The independence rule -----------------------------------------------
  {
    id: "TOOL-NC-INDEPENDENCE-EMPTY-ARRAY",
    defect:
      "the route hands the components the withheld list as an empty array, which renders as 'nobody recorded anything'",
    file: ROUTE,
    find: "  const others = w.othersVisible ? w.others : null;",
    replace: "  const others = w.others;",
    guard: GUARD,
    expect: "BESKT_TOOL_INDEPENDENCE",
  },
  {
    id: "TOOL-NC-INDEPENDENCE-NONNULL-TYPE",
    defect:
      "the position section stops accepting a withheld list, so the withholding has nowhere to be expressed",
    file: POSITION,
    find:
      "  topics: readonly BesktConductTopic[];\n" +
      "  /** NULL while the database withholds them. Never an empty array in that case. */\n" +
      "  others: readonly BesktOtherPosition[] | null;",
    replace:
      "  topics: readonly BesktConductTopic[];\n" +
      "  /** NULL while the database withholds them. Never an empty array in that case. */\n" +
      "  others: readonly BesktOtherPosition[];",
    guard: GUARD,
    expect: "BESKT_TOOL_INDEPENDENCE_TYPE",
  },
  {
    id: "TOOL-NC-DIRECT-POSITION-READ",
    defect:
      "the surface fetches other people's positions directly, stepping around the workspace payload that withholds them",
    file: FUNCTIONS,
    find: '      .from("bcp_conduct_sessions")\n      .select("id, state")',
    replace: '      .from("bcp_conduct_positions")\n      .select("id, state")',
    guard: GUARD,
    expect: "BESKT_TOOL_INDEPENDENCE_FETCH",
  },
  {
    id: "TOOL-NC-WITHHELD-AS-EMPTY",
    defect:
      "a withheld position is reported as an empty list rather than as something being withheld and why",
    file: POSITION,
    find: "  const withheld = others === null;",
    replace: "  const withheld = false;",
    guard: GUARD,
    expect: "BESKT_TOOL_INDEPENDENCE_SAID",
  },
  {
    id: "TOOL-NC-REVEAL-SUMMARISED",
    defect:
      "a revealed position is reduced to its item keys, so the colleague's actual record is never shown",
    file: POSITION,
    find: '              <OtherRow label={t("beskt.conduct.entry.observableFact")} value={e.observableFact} />\n',
    replace: "",
    guard: GUARD,
    expect: "BESKT_TOOL_INDEPENDENCE_REVEAL",
  },
  {
    id: "TOOL-NC-OTHERS-CACHE-KEY",
    defect:
      "a cache key of its own is minted for other people's positions, which is a fetch this surface must never make",
    file: QUERIES,
    find: "/** One entry's correction and verification history. */",
    replace:
      "export const besktOtherPositionsKey = (sessionId: string) =>\n" +
      '  ["beskt", "conduct", "others", sessionId] as const;\n\n' +
      "/** One entry's correction and verification history. */",
    guard: GUARD,
    expect: "BESKT_TOOL_OTHERS_KEY",
  },

  // ---- No score, no ranking, no verdict ------------------------------------
  {
    id: "TOOL-NC-AGGREGATION",
    defect: "the panel starts totalling the assessors' records into a single figure",
    file: PANEL,
    find: "  const union = allItemKeys(myEntries, others);",
    replace:
      "  const agreementScore = sets.reduce((acc, s) => acc + s.size, 0);\n" +
      "  void agreementScore;\n" +
      "  const union = allItemKeys(myEntries, others);",
    guard: GUARD,
    expect: "BESKT_TOOL_AGGREGATION",
  },

  // ---- The candidate's own answers -----------------------------------------
  {
    id: "TOOL-NC-SNAPSHOT-EDITABLE",
    defect: "the interviewer surface offers to edit the candidate's submitted answer",
    file: SNAPSHOT,
    find: '                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">\n                  {answerText(a, t)}\n                </p>',
    replace: '                <textarea className="mt-2 w-full" defaultValue={answerText(a, t)} />',
    guard: GUARD,
    expect: "BESKT_TOOL_SNAPSHOT_EDITABLE",
  },
  {
    id: "TOOL-NC-OMITTED-AS-WARNING",
    defect:
      "a skipped or oral answer is rendered as unresolved work, turning the method's own affordance into a mark against the candidate",
    file: UI,
    find: '      tone={state === "answered" ? "work" : "neutral"}',
    replace: '      tone={state === "answered" ? "work" : "attention"}',
    guard: GUARD,
    expect: "BESKT_TOOL_RESPONSE_TONE",
  },

  // ---- The themes are the database's ---------------------------------------
  {
    id: "TOOL-NC-INVENTED-THEME",
    defect: "the client starts inventing follow-up themes of its own",
    file: THEMES,
    find: "export function BesktThemes({",
    replace:
      'const SUGGESTED = ["tell me more about that", "why did you skip this?"];\n' +
      "void SUGGESTED;\n\n" +
      "export function BesktThemes({",
    guard: GUARD,
    expect: "BESKT_TOOL_INVENTED_CONTENT",
  },
  {
    id: "TOOL-NC-THEME-IDENTITY-HIDDEN",
    defect:
      "a theme stops showing the exact item key and method version it came from, so nobody can check it is the governed item",
    file: THEMES,
    find:
      "          {topic.itemKey}\n" +
      '          <span className="sr-only"> · {t("beskt.conduct.themes.methodVersion")}: </span>\n' +
      '          {" · "}\n' +
      "          {methodVersionId}",
    replace: '          {""}',
    guard: GUARD,
    expect: "BESKT_TOOL_THEME_IDENTITY",
  },

  // ---- Eight separate fields ------------------------------------------------
  {
    id: "TOOL-NC-MERGED-NOTE",
    defect:
      "the observable fact loses its own control, so an observation can only be filed inside another field",
    file: ENTRY_FORM,
    find: '        label={t("beskt.conduct.entry.observableFact")}',
    replace: '        label={t("beskt.conduct.entry.candidateExplanation")}',
    guard: GUARD,
    expect: "BESKT_TOOL_FIELD_MISSING",
  },
  {
    id: "TOOL-NC-NO-SEPARATION-SAID",
    defect: "the form stops telling the interviewer that observation and interpretation stay apart",
    file: ENTRY_FORM,
    find: '        {t("beskt.conduct.entry.separation")}',
    replace: "        {null}",
    guard: GUARD,
    expect: "BESKT_TOOL_SEPARATION_SAID",
  },

  // ---- Corrections ----------------------------------------------------------
  {
    id: "TOOL-NC-CORRECTION-NO-REASON",
    defect: "a correction can be saved without saying why, so the history becomes unreadable",
    file: ENTRY_FORM,
    find: "    if (correcting && reason.trim().length < 3) {",
    replace: "    if (correcting && false) {",
    guard: GUARD,
    expect: "BESKT_TOOL_CORRECTION_REASON",
  },
  {
    id: "TOOL-NC-HISTORY-FILTERED",
    defect: "the history starts filtering superseded versions out, so a corrected record is hidden",
    file: HISTORY,
    find: "        {data.versions.map((v) => {",
    replace: "        {data.versions.filter((x) => x.supersededByEntryId === null).map((v) => {",
    guard: GUARD,
    expect: "BESKT_TOOL_HISTORY_FILTER",
  },
  {
    id: "TOOL-NC-HISTORY-NO-ATTRIBUTION",
    defect: "the history stops saying who wrote each version",
    file: HISTORY,
    find: "                {v.recordedBy && (",
    replace: "                {false && (",
    guard: GUARD,
    expect: "BESKT_TOOL_HISTORY_ATTRIBUTION",
  },

  // ---- Verification ---------------------------------------------------------
  {
    id: "TOOL-NC-VERIFICATION-SOURCE-OPTIONAL",
    defect: "a settled verification can be recorded without naming where the answer came from",
    file: VERIFY_FORM,
    find: '    if (SOURCE_REQUIRED.includes(state) && source.trim() === "") {',
    replace: "    if (false) {",
    guard: GUARD,
    expect: "BESKT_TOOL_VERIFICATION_SOURCE",
  },
  {
    id: "TOOL-NC-NOT-VERIFIED-AS-VERDICT",
    defect:
      "the surface stops saying that 'not verified' is not a statement about the candidate's honesty",
    file: THEMES,
    find: '          {t("beskt.conduct.verification.notVerifiedMeaning")}',
    replace: "          {null}",
    guard: GUARD,
    expect: "BESKT_TOOL_NOT_VERIFIED_MEANING",
  },

  // ---- Locking and reopening ------------------------------------------------
  {
    id: "TOOL-NC-LOCK-WITHOUT-DIALOG",
    defect:
      "locking stops being a described, modal confirmation, so an irreversible step happens on one stray click",
    file: POSITION,
    find: '        aria-modal="true"',
    replace: "",
    guard: GUARD,
    expect: "BESKT_TOOL_LOCK_DIALOG",
  },
  {
    id: "TOOL-NC-REOPEN-NO-REASON",
    defect: "a locked position can be reopened without a reason, so the audit event says nothing",
    file: POSITION,
    find: "            if (reason.trim().length < 3) {",
    replace: "            if (false) {",
    guard: GUARD,
    expect: "BESKT_TOOL_REOPEN_REASON",
  },

  // ---- The panel ------------------------------------------------------------
  {
    id: "TOOL-NC-DIVERGENCE-DROPPED",
    defect:
      "a disagreement can be recorded without the divergent position, which deletes the minority view",
    file: PANEL,
    find: '      setLocalError(t("beskt.error.conductDivergenceRequired"));',
    replace: '      setLocalError(t("beskt.error.conductRationaleRequired"));',
    guard: GUARD,
    expect: "BESKT_TOOL_DIVERGENCE_REQUIRED",
  },
  {
    id: "TOOL-NC-PANEL-OVERWRITES",
    defect: "the panel reaches into the assessors' own records instead of recording beside them",
    file: PANEL,
    find: 'import { BESKT_RESOLUTION_KINDS } from "@/lib/beskt/interview-conduct.functions";',
    replace:
      'import {\n  BESKT_RESOLUTION_KINDS,\n  saveBesktConductEntry,\n} from "@/lib/beskt/interview-conduct.functions";\nvoid saveBesktConductEntry;',
    guard: GUARD,
    expect: "BESKT_TOOL_PANEL_WRITES_ENTRIES",
  },
  {
    id: "TOOL-NC-PANEL-PRESERVES-UNSAID",
    defect: "the panel stops saying it leaves the assessors' own positions untouched",
    file: PANEL,
    find: '            {t("beskt.conduct.panel.preservesPositions")}',
    replace: "            {null}",
    guard: GUARD,
    expect: "BESKT_TOOL_PANEL_PRESERVES",
  },

  // ---- Errors, identity and the gate ----------------------------------------
  {
    id: "TOOL-NC-RAW-ERROR",
    defect: "an original database error is rendered straight into the DOM, leaking the schema",
    file: HISTORY,
    find: "        {t(besktErrorKey(q.error))}",
    replace: "        {(q.error as Error).message}",
    guard: GUARD,
    expect: "BESKT_TOOL_RAW_ERROR",
  },
  {
    id: "TOOL-NC-QUERY-KEY-NO-EMPLOYER",
    defect:
      "the workspace cache key stops naming the employer, so one employer's answer can be served to another",
    file: QUERIES,
    find:
      "export const besktWorkspaceKey = (employerSlug: string, caseId: string, sessionId: string) =>\n" +
      '  ["beskt", "conduct", employerSlug, caseId, sessionId] as const;',
    replace:
      "export const besktWorkspaceKey = (employerSlug: string, caseId: string, sessionId: string) =>\n" +
      '  ["beskt", "conduct", caseId, sessionId] as const;',
    guard: GUARD,
    expect: "BESKT_TOOL_QUERY_KEYS",
  },
  {
    id: "TOOL-NC-MODULE-GATE-CLIENT",
    defect: "the route stops reading the server's binding gate and decides for itself",
    file: ROUTE,
    find: "  if (!mod.linked || !mod.submitted || !mod.methodBindingValid) {",
    replace: "  if (!mod.linked || !mod.submitted) {",
    guard: GUARD,
    expect: "BESKT_TOOL_MODULE_GATE",
  },
  {
    id: "TOOL-NC-MODULE-CARD-VANISHES",
    defect:
      "the module card disappears whenever the module is not usable, so a recruiter cannot find out why",
    file: MODULE_CARD,
    find: "  if (!module.linked) return null;",
    replace: "  if (!module.available) return null;",
    guard: GUARD,
    expect: "BESKT_TOOL_MODULE_CARD_GATE",
  },

  // ---- Language, accessibility ----------------------------------------------
  {
    id: "TOOL-NC-UNTRANSLATED",
    defect: "an English sentence is left as the Swedish one, so the English surface is not English",
    file: DICT,
    find:
      '    "beskt.conduct.panel.lede":\n' +
      '      "The panel compares locked positions and records how the conversation handled them. It totals nothing.",',
    replace:
      '    "beskt.conduct.panel.lede":\n' +
      '      "Panelen jämför låsta ståndpunkter och registrerar hur samtalet hanterade dem. Den räknar ingenting samman.",',
    guard: GUARD,
    expect: "BESKT_TOOL_LANG_COPY",
  },
  {
    id: "TOOL-NC-SCHEMA-LEAK",
    defect: "a user-facing sentence starts naming a database table",
    file: DICT,
    find: '    "beskt.conduct.others.empty": "Nobody else holds a position in this conversation yet.",',
    replace:
      '    "beskt.conduct.others.empty": "No rows in bcp_conduct_positions for this session yet.",',
    guard: GUARD,
    expect: "BESKT_TOOL_SCHEMA_LEAK",
  },
  {
    id: "TOOL-NC-TOUCH-TARGET",
    defect: "a control drops below the 44px floor and becomes unusable one-handed on a phone",
    file: ENTRY_FORM,
    find: "        className={`${FIELD} ${TOUCH}`}\n        aria-describedby={`${id}-help`}",
    replace: "        className={FIELD}\n        aria-describedby={`${id}-help`}",
    guard: GUARD,
    expect: "BESKT_TOOL_TOUCH_RENDER",
  },

  // ---- Saving waits for the server ------------------------------------------
  {
    id: "TOOL-NC-SAVE-BEFORE-CONFIRM",
    defect: "the screen reports a save before the server has confirmed it",
    file: ROUTE,
    find: "                  setPendingItemKey(input.itemKey);\n                  setSavedItemKey(null);",
    replace:
      "                  setPendingItemKey(input.itemKey);\n                  setSavedItemKey(input.itemKey);",
    guard: GUARD,
    expect: "BESKT_TOOL_SAVE_CONFIRM",
  },
  {
    id: "TOOL-NC-CLOSE-ON-CLICK",
    defect:
      "the documentation form closes the moment the button is clicked, so an interviewer is told their correction was recorded before the server has accepted it",
    file: THEMES,
    find: '      if (actions.savedItemKey === itemKey) setMode("view");',
    replace: '      setMode("view");',
    guard: GUARD,
    expect: "BESKT_TOOL_FORM_CLOSE",
  },

  {
    id: "TOOL-NC-BLANKET-INVALIDATION",
    defect: "a successful mutation invalidates the whole cache instead of exactly what changed",
    file: ROUTE,
    find: "    for (const key of besktInvalidateAfterMutation(employerSlug, caseId, sessionId)) {",
    replace: "    await queryClient.invalidateQueries();\n" + "    for (const key of []) {",
    guard: GUARD,
    expect: "BESKT_TOOL_INVALIDATION",
  },

  // ---- The guard itself stays wired in --------------------------------------
  {
    id: "TOOL-NC-NOT-IN-CI",
    defect: "CI stops running the guard, so the whole surface contract becomes unenforced",
    file: CI,
    find: "        run: bun run beskt-interview-tool:check",
    replace: "        run: echo skipped",
    guard: GUARD,
    expect: "BESKT_TOOL_NOT_IN_CI",
  },
  {
    id: "TOOL-NC-CONTROLS-NOT-WIRED",
    defect:
      "the planted controls stop running in negative-controls:all, so a dead guard stays dead",
    file: PKG,
    find: "bun run negative-controls:beskt-interview-conduct && bun run negative-controls:beskt-interview-tool",
    replace: "bun run negative-controls:beskt-interview-conduct",
    guard: GUARD,
    expect: "BESKT_TOOL_CONTROLS_NOT_WIRED",
  },
];

runControls("beskt-interview-tool", MUTATIONS);
