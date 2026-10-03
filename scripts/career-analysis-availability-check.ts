/**
 * The career analysis is available the same way everywhere, in every state.
 *
 * ── THE DEFECT THIS DEFENDS ────────────────────────────────────────────
 *
 * The release control (public.cd_access_policy: internal_test / public /
 * paused) decides who may use Karriäranalysen. Before this guard the product
 * answered "is it open to THIS reader" in four places that each carried a copy
 * (the canonical route, My Career, the retake link, the career centre) and in
 * seven places not at all: profession guides, the career centre's hero card,
 * the history's empty state, the Academy pointer, a legacy report and two more
 * linked to the route unconditionally, so a signed-in account outside the test
 * group, or anybody under `paused`, was sent to a page that says "not open".
 * The owner flips the control with ONE call at launch (cd_set_access_state), a
 * path never exercised in production, so every state has to be coherent first.
 *
 * ── WHAT IS ASSERTED ───────────────────────────────────────────────────
 *
 *   GROUP 1  the state matrix, as BEHAVIOUR: the resolver every surface reads
 *            and the server's save gate, run over every state x actor, against
 *            one explicit truth table (the one in the release note), with the
 *            UI/server consistency invariants stated and the single documented
 *            exception named. The database half is held to the same table:
 *            the expected rows are parsed out of the SQL suite.
 *   GROUP 2  ONE SOURCE, as structure: nothing but the hook, the route, the
 *            server functions and the head/sitemap read the two availability
 *            server functions or the two database functions; every link into
 *            the entrance is behind the hook or an explicitly listed prop that
 *            is itself fed by it; no private copy of the query or of the rule.
 *   GROUP 3  caching: a bounded stale time, no HTTP cache on the read, a short
 *            sitemap cache.
 *   GROUP 4  claim at signup under internal_test and paused: resolved before
 *            the allowlist, never cleared before a confirmed write, a refusal
 *            mid-run told as what it is and never as a retry, "take it again"
 *            only where the door is open.
 *   GROUP 5  indexing follows the state; the saved report can be downloaded.
 *   GROUP 6  the owner's readiness checklist is read-only and the release note
 *            carries the sequence, the checks and the rollback.
 *   GROUP 7  the suites are wired (package script, CI, db-test, controls).
 *
 * The render matrix (every surface, every state, both languages) is
 * scripts/career-analysis-surfaces-check.tsx; the database half is
 * supabase/tests/cd_availability_matrix_test.sql; the browser walk is
 * e2e/career-analysis-availability.spec.ts. Planted controls:
 * scripts/negative-controls/career-analysis-availability-controls.ts.
 *
 * Run: bun run career-analysis-availability:check
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  ANALYSIS_ROBOTS_BLOCKED,
  ANALYSIS_ROBOTS_INDEXABLE,
  analysisIndexable,
  analysisOpenFlag,
  analysisRobots,
  keepsAnalysisLink,
  mayStartFrom,
  readV31AccessState,
  resolveAnalysisAccess,
  type AnalysisAccess,
  type V31AccessState,
} from "../src/lib/career-discovery/analysis-access";
import {
  resolveSaveGate,
  type SaveGateDecision,
} from "../src/lib/career-discovery/v31-public.functions";
import { dictionaries } from "../src/i18n/dictionaries";

const ROOT = join(import.meta.dir, "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

let checks = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  checks += 1;
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}
function group(name: string): void {
  console.log(`\n${name}`);
}

/** Source without its comments, so a rule mentioned in prose is not a use. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

console.log("career-analysis-availability-check\n");

// =========================================================================
group("1 · The state matrix, as behaviour");
// =========================================================================

type State = V31AccessState;
type Actor = "anonymous" | "plain" | "tester" | "admin";
const STATES: readonly State[] = ["internal_test", "public", "paused"];
const ACTORS: readonly Actor[] = ["anonymous", "plain", "tester", "admin"];
type SignedActor = Exclude<Actor, "anonymous">;

// What the DATABASE answers (cd_v31_may_start). Held to the SQL suite below.
const DB_MAY_START: Record<State, Record<SignedActor, boolean>> = {
  internal_test: { plain: false, tester: true, admin: true },
  public: { plain: true, tester: true, admin: true },
  paused: { plain: false, tester: false, admin: true },
};
// What the DATABASE answers for the anonymous entrance (cd_access_state).
const DB_ENTRANCE_OPEN: Record<State, boolean> = {
  internal_test: true,
  public: true,
  paused: false,
};

// What the UI decides, per the release note's truth table. Under `paused` the
// UI is closed to EVERY actor, an admin included (the one place it is stricter
// than cd_v31_may_start; named in EXCEPTION below).
type Door = "open" | "closed:paused" | "closed:account";
const UI_DOOR: Record<State, Record<Actor, Door>> = {
  internal_test: { anonymous: "open", plain: "closed:account", tester: "open", admin: "open" },
  public: { anonymous: "open", plain: "open", tester: "open", admin: "open" },
  paused: {
    anonymous: "closed:paused",
    plain: "closed:paused",
    tester: "closed:paused",
    admin: "closed:paused",
  },
};

// What the SERVER's save gate decides (resolveSaveGate), for the person's own
// run (started while signed in) and for a CLAIM (finished anonymously).
const SAVE: Record<
  State,
  Record<SignedActor, { own: SaveGateDecision; claim: SaveGateDecision }>
> = {
  internal_test: {
    plain: { own: "deny", claim: "allow_claim" },
    tester: { own: "allow_test_group", claim: "allow_test_group" },
    admin: { own: "allow_test_group", claim: "allow_test_group" },
  },
  public: {
    plain: { own: "allow_public", claim: "allow_public" },
    tester: { own: "allow_test_group", claim: "allow_test_group" },
    admin: { own: "allow_test_group", claim: "allow_test_group" },
  },
  paused: {
    plain: { own: "deny", claim: "deny" },
    tester: { own: "deny", claim: "deny" },
    admin: { own: "allow_test_group", claim: "allow_test_group" },
  },
};

/** The one cell where the server is more permissive than the UI. */
const EXCEPTION = { state: "paused" as State, actor: "admin" as SignedActor };

function doorOf(a: AnalysisAccess): Door | "closed:unavailable" | "unknown" {
  if (a.door === "open") return "open";
  if (a.door === "unknown") return "unknown";
  return `closed:${a.reason}` as Door | "closed:unavailable";
}
const availabilityFor = (state: State) => ({
  // Lifecycle `active`: `available` is exactly "the control is not paused".
  available: state !== "paused",
  accessState: state,
});

for (const state of STATES) {
  for (const actor of ACTORS) {
    const signedIn = actor !== "anonymous";
    const resolved = resolveAnalysisAccess({
      availability: availabilityFor(state),
      signedIn,
      mayStart: signedIn ? DB_MAY_START[state][actor as SignedActor] : null,
    });
    ok(
      doorOf(resolved) === UI_DOOR[state][actor],
      `1.1 ${state} / ${actor}: the UI door is ${UI_DOOR[state][actor]} (resolver says ${doorOf(resolved)})`,
    );
  }
}

for (const state of STATES) {
  for (const actor of ["plain", "tester", "admin"] as const) {
    const common = {
      isInternalTester: actor === "tester" || actor === "admin", // cd_is_internal_tester includes admins
      isPlatformAdmin: actor === "admin",
      accessState: state,
    };
    const own = resolveSaveGate({ ...common, isAnonymousClaim: false });
    const claim = resolveSaveGate({ ...common, isAnonymousClaim: true });
    ok(
      own === SAVE[state][actor].own && claim === SAVE[state][actor].claim,
      `1.2 ${state} / ${actor}: save gate own=${SAVE[state][actor].own} claim=${SAVE[state][actor].claim} (got ${own} / ${claim})`,
    );
  }
}

// UI and server agree, cell by cell, except the one named exception. A door
// the server would refuse is a dead end; a refusal the server would not make
// is a door the product hides for no reason.
for (const state of STATES) {
  for (const actor of ["plain", "tester", "admin"] as const) {
    const door = UI_DOOR[state][actor];
    const own = SAVE[state][actor].own;
    const exception = state === EXCEPTION.state && actor === EXCEPTION.actor;
    const consistent = door === "open" ? own !== "deny" : own === "deny";
    ok(
      consistent || exception,
      `1.3 ${state} / ${actor}: the UI door (${door}) and the server's save of their own run (${own}) agree${exception ? " -- the documented exception (the UI is closed to everyone under paused; admins verify under internal_test)" : ""}`,
    );
  }
}
// The claim never depends on the allowlist: a non-tester finishing anonymously
// keeps the run under internal_test and public, and only `paused` stops it.
ok(
  SAVE.internal_test.plain.claim !== "deny" && SAVE.public.plain.claim !== "deny",
  "1.4 a plain account's claim is saved under internal_test and public",
);
ok(
  SAVE.paused.plain.claim === "deny",
  "1.5 and only paused stops a claim (it is kept, not lost: see group 4)",
);
// Anonymous: the entrance is the control's, and nothing else.
for (const state of STATES) {
  ok(
    (UI_DOOR[state].anonymous === "open") === DB_ENTRANCE_OPEN[state],
    `1.6 ${state}: the anonymous door equals what cd_access_state says to anon`,
  );
}

// Reads that did not answer are neither open nor closed.
ok(
  doorOf(resolveAnalysisAccess({ availability: null, signedIn: false, mayStart: null })) ===
    "unknown" &&
    doorOf(resolveAnalysisAccess({ availability: null, signedIn: true, mayStart: true })) ===
      "unknown",
  "1.7 an availability read that failed is unknown for everyone, never closed",
);
ok(
  doorOf(
    resolveAnalysisAccess({
      availability: availabilityFor("public"),
      signedIn: true,
      mayStart: null,
    }),
  ) === "unknown",
  "1.8 a signed-in reader whose gate read failed is unknown, never 'not for your account'",
);
ok(
  mayStartFrom({ allowed: false, answered: false }) === null &&
    mayStartFrom({ allowed: false, answered: true }) === false &&
    mayStartFrom({ allowed: true }) === true &&
    mayStartFrom(null) === null,
  "1.9 getV31TesterStatus's answered flag turns a failed database read into null, not false",
);
ok(
  doorOf(
    resolveAnalysisAccess({
      availability: { available: false, accessState: "internal_test" },
      signedIn: false,
      mayStart: null,
    }),
  ) === "closed:unavailable" &&
    doorOf(
      resolveAnalysisAccess({
        availability: { available: false, accessState: "public" },
        signedIn: true,
        mayStart: true,
      }),
    ) === "closed:unavailable",
  "1.10 an instrument that is not administrable closes the door for everyone, whatever the control says",
);
ok(
  analysisOpenFlag({ door: "open", basis: "anonymous" }) === true &&
    analysisOpenFlag({ door: "closed", reason: "paused" }) === false &&
    analysisOpenFlag({ door: "unknown" }) === undefined &&
    analysisOpenFlag(undefined) === undefined &&
    keepsAnalysisLink({ door: "unknown" }) === true &&
    keepsAnalysisLink({ door: "closed", reason: "account" }) === false,
  "1.11 the three-valued flag keeps a link on unknown and withdraws it only on a definite closed",
);
ok(
  readV31AccessState("public") === "public" &&
    readV31AccessState("internal_test") === "internal_test" &&
    readV31AccessState("paused") === "paused" &&
    readV31AccessState(null) === "paused" &&
    readV31AccessState("open") === "paused" &&
    readV31AccessState(undefined) === "paused",
  "1.12 an unknown or missing control answer reads as paused (fails closed)",
);

// The database half is held to the SAME table: the expected rows are parsed
// out of the SQL suite, so the two cannot drift.
{
  const sql = read("supabase/tests/cd_availability_matrix_test.sql");
  const rows = [
    ...sql.matchAll(
      /\('(internal_test|public|paused)',\s*'(admin|tester|plain)',\s*(true|false)\)/g,
    ),
  ];
  const parsed: Record<string, boolean> = {};
  for (const m of rows) parsed[`${m[1]}/${m[2]}`] = m[3] === "true";
  let same = rows.length === 9;
  for (const state of STATES)
    for (const actor of ["plain", "tester", "admin"] as const)
      if (parsed[`${state}/${actor}`] !== DB_MAY_START[state][actor]) same = false;
  ok(
    same,
    "1.13 the SQL suite's expected cd_v31_may_start table is exactly this guard's table (9 cells)",
  );
  const entrance = [...sql.matchAll(/\('(internal_test|public|paused)',\s*(true|false)\)/g)].map(
    (m) => [m[1], m[2] === "true"] as const,
  );
  ok(
    entrance.length === 3 && entrance.every(([s, v]) => DB_ENTRANCE_OPEN[s as State] === v),
    "1.14 and its expected anonymous-entrance table is this guard's (3 cells)",
  );
}

// =========================================================================
group("2 · ONE availability source, as structure");
// =========================================================================

const SRC = walk("src").filter(
  (f) => !f.includes("routeTree.gen") && !f.includes("integrations/supabase/types"),
);
const stripped = new Map(SRC.map((f) => [f, code(read(f))]));

// 2.1 Only these files may name the two availability server functions.
const READERS = new Set([
  "src/lib/career-discovery/v31-public.functions.ts", // defines them
  "src/components/career-discovery/use-career-analysis-open.ts", // the one client hook
  "src/components/career-discovery/v31/PublicAssessmentFlow.tsx", // the route itself
  "src/routes/security-career-assessment.tsx", // head: robots follow the state
  "src/routes/sitemap[.]xml.ts", // sitemap membership follows the state
]);
{
  const offenders = SRC.filter(
    (f) => /\b(getV31Availability|getV31TesterStatus)\b/.test(stripped.get(f)!) && !READERS.has(f),
  );
  ok(
    offenders.length === 0,
    offenders.length === 0
      ? "2.1 only the hook, the route, its head and the sitemap read getV31Availability / getV31TesterStatus"
      : `2.1 a surface reads the availability server functions directly (a private copy): ${offenders.join(", ")}`,
  );
}
// 2.2 Only the server functions name the database functions.
{
  const offenders = SRC.filter(
    (f) =>
      /cd_v31_may_start|cd_access_state|cd_set_access_state/.test(stripped.get(f)!) &&
      f !== "src/lib/career-discovery/v31-public.functions.ts" &&
      f !== "src/lib/career-discovery/discovery.functions.ts",
  );
  ok(
    offenders.length === 0,
    `2.2 only the career-discovery server functions call the access functions ${offenders.join(", ")}`,
  );
}
// 2.3 No file but the resolver turns the two answers into a decision.
{
  const offenders = SRC.filter(
    (f) =>
      /\bstatus\.allowed\b|\btester\.allowed\b|\.available\s*&&\s*[\w.]*allowed/.test(
        stripped.get(f)!,
      ) && f !== "src/lib/career-discovery/analysis-access.ts",
  );
  ok(
    offenders.length === 0,
    `2.3 nothing combines availability and the gate outside the resolver ${offenders.join(", ")}`,
  );
}
// 2.4 The hook and the route both go through the resolver.
{
  const hook = stripped.get("src/components/career-discovery/use-career-analysis-open.ts")!;
  const flow = stripped.get("src/components/career-discovery/v31/PublicAssessmentFlow.tsx")!;
  ok(
    /resolveAnalysisAccess\(/.test(hook) && /mayStartFrom\(/.test(hook),
    "2.4a the hook decides through resolveAnalysisAccess",
  );
  ok(
    (flow.match(/resolveAnalysisAccess\(/g) ?? []).length >= 3 && /mayStartFrom\(/.test(flow),
    "2.4b the canonical route decides through the same resolver (boot, claim notice, mid-run refusal)",
  );
  ok(
    !/\["my-career",\s*"assessment-open"\]|assessment-open/.test(
      SRC.map((f) => stripped.get(f)!).join("\n"),
    ),
    "2.4c the old private query key (my-career / assessment-open) is gone",
  );
  ok(
    SRC.filter((f) => /\["career-discovery",\s*"analysis-access"/.test(stripped.get(f)!)).length ===
      1,
    "2.4d exactly one module owns the availability query",
  );
}

// 2.5 Every link into the ENTRANCE is behind the hook, or behind an explicit
//     prop that the hook feeds, or is the route itself / a redirect.
//     An entrance is the exact path /security-career-assessment, in a `to`,
//     an `href` or a navigate, or the canonical constant used as a `to`.
const ENTRANCE =
  /["']\/security-career-assessment["']|to=\{CANONICAL_ASSESSMENT_PATH\}|to:\s*CANONICAL_ASSESSMENT_PATH/;
/** Files that hold an entrance and are gated by a prop/signal that is itself
 *  fed by the hook; the token proves the branch exists. */
const GATED_BY_PROP: Record<string, RegExp> = {
  "src/components/professional-identity/HubStatusGrid.tsx": /!careerClosed/,
  "src/components/professional-identity/CareerDirectionSection.tsx": /closed\s*\?/,
  "src/lib/professional-identity/next-best-action.ts": /careerDiscoveryOpen\s*!==\s*false/,
  "src/lib/professional-identity/profile-destinations.ts": /careerDiscoveryOpen\s*===\s*false/,
};
/** Files that name the entrance without being an offer of it. */
const NOT_AN_OFFER: Record<string, string> = {
  "src/routes/security-career-assessment.tsx": "the route itself",
  "src/components/career-discovery/v31/PublicAssessmentFlow.tsx":
    "the route's own flow (leaves to / re-enters itself)",
  "src/routes/discovery.tsx": "a redirect to the canonical route",
  "src/lib/career-discovery/routes.ts": "the constants",
  "src/lib/career-discovery/v31/career-card.ts": "the share URL constant, not a link",
  "src/components/auth/UnifiedAuthPanel.tsx": "reads the return path of a claim",
  "src/components/site/candidate-app-nav.ts": "route ids that light the Karriär item, not a link",
};
{
  const rows: string[] = [];
  const bad: string[] = [];
  for (const f of SRC) {
    const c = stripped.get(f)!;
    if (!ENTRANCE.test(c)) continue;
    if (f in NOT_AN_OFFER) continue;
    if (/useCareerAnalysisOpen\(/.test(c)) {
      // The link must actually branch on the hook's answer.
      if (/(?:[aA]nalysisOpen|\bopen)\s*(?:===|!==)\s*(?:false|true)/.test(c))
        rows.push(`${f} (hook)`);
      else bad.push(`${f} reads the hook but never branches on it`);
    } else if (f in GATED_BY_PROP) {
      if (GATED_BY_PROP[f].test(c)) rows.push(`${f} (prop)`);
      else bad.push(`${f} lost its gate (${GATED_BY_PROP[f]})`);
    } else {
      bad.push(`${f} links into the entrance with no gate`);
    }
  }
  ok(rows.length >= 12, `2.5a the entrance links found and gated (${rows.length})`);
  ok(
    bad.length === 0,
    bad.length === 0
      ? "2.5b every link into /security-career-assessment is behind the one source"
      : `2.5b ${bad.join("; ")}`,
  );
  // The surfaces the earlier audit named, individually, so a rename cannot
  // quietly drop one from the walk above.
  for (const f of [
    "src/components/career-center/ProfessionTemplate.tsx",
    "src/components/career-center/CareerEntryCards.tsx",
    "src/components/career-center/PathFromSection.tsx",
    "src/components/career-center/PersonalDirection.tsx",
    "src/components/career-discovery/RetakeAnalysisLink.tsx",
    "src/components/jobs/AssessmentInvite.tsx",
    "src/routes/assessment.tsx",
    "src/routes/_authenticated.academy.index.tsx",
    "src/routes/_authenticated.my-career.reports.$runId.tsx",
    "src/routes/_authenticated.security-career-assessment.history.tsx",
    "src/routes/_authenticated.my-career.index.tsx",
  ]) {
    ok(/useCareerAnalysisOpen\(/.test(stripped.get(f)!), `2.6 ${f} reads the one hook`);
  }
}

// =========================================================================
group("3 · Cached sanely: no stale 'open' after a pause");
// =========================================================================
{
  const hook = read("src/components/career-discovery/use-career-analysis-open.ts");
  const m = /ANALYSIS_ACCESS_STALE_MS\s*=\s*([\d_]+)/.exec(hook);
  const stale = m ? Number(m[1].replace(/_/g, "")) : Infinity;
  ok(stale <= 60_000, `3.1 the hook trusts an answer for at most a minute (${stale} ms)`);
  ok(/staleTime:\s*ANALYSIS_ACCESS_STALE_MS/.test(hook), "3.2 and uses that bound");
  ok(!/refetchOnWindowFocus:\s*false/.test(hook), "3.3 and asks again when the tab regains focus");
  const fns = code(read("src/lib/career-discovery/v31-public.functions.ts"));
  ok(
    !/Cache-Control|setResponseHeader|\.setHeader\(/.test(fns),
    "3.4 the server reads carry no HTTP cache and no server cache: every call reads the database",
  );
  const sitemap = read("src/routes/sitemap[.]xml.ts");
  const age = /max-age=(\d+)/.exec(sitemap);
  ok(
    !!age && Number(age[1]) <= 600,
    `3.5 the sitemap is cached for at most ten minutes (${age?.[1]} s)`,
  );
  const flow = code(read("src/components/career-discovery/v31/PublicAssessmentFlow.tsx"));
  ok(
    /checkAvailability\(\{\}\)/.test(flow) && !/useQuery\([^)]*checkAvailability/.test(flow),
    "3.6 the entrance reads availability on every mount (no client cache): it closes the moment the control says paused",
  );
  ok(
    /previewPublicV31Run/.test(code(read("src/lib/career-discovery/v31-public.functions.ts"))) &&
      /readV31AccessState\(access\.error \? null : access\.data\) === "paused"/.test(
        read("src/lib/career-discovery/v31-public.functions.ts"),
      ),
    "3.7 the anonymous result build re-reads the control per call and refuses under paused",
  );
}

// =========================================================================
group("4 · The claim at signup: never lost, never told something false");
// =========================================================================
{
  const flow = code(read("src/components/career-discovery/v31/PublicAssessmentFlow.tsx"));
  const iClaim = flow.indexOf("resolveClaimEntry(");
  const iTester = flow.indexOf("checkTesterStatus({})");
  ok(
    iClaim > 0 && iTester > iClaim,
    "4.1 a claim token is resolved BEFORE the first signed-in gate read (a non-tester is never turned away from their own finished run)",
  );
  const iPersist = flow.indexOf("await persist(");
  const iClear = flow.indexOf("clearPendingClaim();", iPersist);
  const iBufClear = flow.indexOf("clearBuffer();", iPersist);
  ok(
    iPersist > 0 && iClear > iPersist && iBufClear > iPersist,
    "4.2 the staged claim and the buffer are cleared only after the confirmed write",
  );
  ok(
    (flow.match(/clearPendingClaim\(\)/g) ?? []).length === 1 &&
      (flow.match(/clearBuffer\(\)/g) ?? []).length === 1,
    "4.3 and nowhere else in the flow",
  );
  ok(
    /preAccess\.door === "closed"[\s\S]{0,260}closedKeepFor\(urlToken\)/.test(flow),
    "4.4 a claim opened under paused is told where its result is kept (the staged run is untouched)",
  );
  ok(
    /v31PublicErrorCode\(err\) === "not_available"[\s\S]{0,400}enterClosed\(access\)/.test(flow),
    "4.5 a save refused because the control moved is told as a closed state, not 'try again'",
  );
  ok(
    /retry:\s*\(failureCount, error\)\s*=>\s*v31PublicErrorCode\(error\) !== "not_available"/.test(
      flow,
    ),
    "4.6 and the result build does not retry a not_available refusal",
  );
  ok(
    /previewRefusedAt/.test(flow) && /readAccessNow\(\)/.test(flow),
    "4.7 a result refused mid-run is told as the closed state too",
  );
  ok(
    /notice !== "alreadyClaimed" && startOverOffered/.test(flow),
    "4.8 'take it again' is offered only where the door is open for this reader",
  );
  ok(
    /access\.door === "unknown"\) throw new Error/.test(flow),
    "4.9 an unanswered gate read takes the retryable 'could not check' screen, not a refusal",
  );
  const panel = read("src/components/career-discovery/v31/ClosedAnalysisPanel.tsx");
  ok(
    !/<button/.test(code(panel)) && /cd-closed-next/.test(panel),
    "4.10 the closed panel offers ways on and no retry button",
  );
  for (const [reason, needle] of [
    ["paused", 'reason === "paused"'],
    ["account", 'reason === "account"'],
    ["unavailable", "cd.public.unavailableTitle"],
  ] as const) {
    ok(panel.includes(needle), `4.11 the closed panel speaks for the '${reason}' reason`);
  }
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    for (const key of [
      "cd.public.paused.title",
      "cd.public.paused.body",
      "cd.public.account.title",
      "cd.public.account.body",
      "cd.public.keep.claim",
      "cd.public.keep.tab",
      "cd.public.next.jobs",
      "cd.public.next.passport",
    ]) {
      ok(typeof d[key] === "string" && d[key].length > 8, `4.12 [${lang}] ${key} is written`);
    }
    ok(
      dictionaries[lang]["cd.public.keep.claim"].includes("{date}"),
      `4.13 [${lang}] the kept-until sentence carries its date`,
    );
    ok(
      !/20\d\d/.test(`${d["cd.public.paused.body"]} ${d["cd.public.account.body"]}`),
      `4.14 [${lang}] and promises no reopening date`,
    );
  }
}

// =========================================================================
group("5 · Indexing follows the state; the saved report can be downloaded");
// =========================================================================
ok(
  analysisIndexable({ available: true, accessState: "public" }) === true,
  "5.1 public is indexable",
);
ok(
  analysisIndexable({ available: true, accessState: "internal_test" }) === false &&
    analysisIndexable({ available: true, accessState: "paused" }) === false &&
    analysisIndexable({ available: false, accessState: "public" }) === false &&
    analysisIndexable(null) === false &&
    analysisIndexable(undefined) === false &&
    analysisIndexable({ available: true }) === false,
  "5.2 internal_test, paused, an unavailable instrument, an unreadable state and a missing state are not",
);
ok(
  analysisRobots(true) === ANALYSIS_ROBOTS_INDEXABLE &&
    analysisRobots(false) === ANALYSIS_ROBOTS_BLOCKED &&
    /noindex/.test(ANALYSIS_ROBOTS_BLOCKED) &&
    !/noindex/.test(ANALYSIS_ROBOTS_INDEXABLE),
  "5.3 robots: public says index, everything else says noindex",
);
{
  const route = code(read("src/routes/security-career-assessment.tsx"));
  ok(
    /analysisRobots\(indexable\)/.test(route) && !/name:\s*"robots",\s*content:\s*"/.test(route),
    "5.4 the route derives robots from the state, never a literal",
  );
  ok(
    /ssr:\s*"data-only"/.test(route) && /loader:/.test(route),
    "5.5 the decision is read on the server (loader) and written into the first response's head",
  );
  ok(
    /typeof window !== "undefined"\)\s*return false/.test(route),
    "5.6 a client navigation never waits on the read",
  );
  ok(
    /catch\s*\{\s*return false;/.test(route) && /INDEXING_READ_TIMEOUT_MS/.test(route),
    "5.7 and a failed or hung read fails closed to noindex",
  );
  ok(
    /links:\s*indexable \?/.test(route),
    "5.8 the canonical link exists only while it is indexable",
  );
  const sitemap = code(read("src/routes/sitemap[.]xml.ts"));
  ok(
    /analysisListed = analysisIndexable\(answer\)/.test(sitemap) &&
      /\.\.\.\(analysisListed/.test(sitemap),
    "5.9 sitemap membership follows the same decision",
  );
  ok(/catch\s*\{\s*analysisListed = false;/.test(sitemap), "5.10 and a failed read leaves it out");
  const report = read("src/components/career-discovery/v31/V31ReportView.tsx");
  const bar = report.slice(
    report.indexOf('mode === "authenticated" && (\n        <div className="no-print mt-16'),
  );
  ok(
    bar.length > 0 &&
      /data-print-report/.test(bar.slice(0, 2500)) &&
      /window\.print\(\)/.test(bar.slice(0, 2500)) &&
      /cd\.public\.downloadResult/.test(bar.slice(0, 2500)),
    "5.11 the saved report's no-print action bar carries the same download control as the anonymous result",
  );
  const flow = read("src/components/career-discovery/v31/PublicAssessmentFlow.tsx");
  ok(
    /onDownloadResult/.test(flow) && /cd\.public\.downloadResult/.test(flow),
    "5.12 the anonymous result still has its own",
  );
}

// =========================================================================
group("6 · The owner's checklist is read-only, and the release note is complete");
// =========================================================================
{
  const sql = read("supabase/readiness/career-analysis-availability.sql");
  const noComments = sql.replace(/--.*$/gm, "");
  const noStrings = noComments.replace(/'[^']*'/g, "''");
  const statements = noStrings
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  ok(statements.length >= 8, `6.1 the checklist has its queries (${statements.length})`);
  ok(
    statements.every((s) => /^(select|with)\b/i.test(s)),
    "6.2 every statement is a SELECT",
  );
  ok(
    !/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|call|do|set|reset|copy|vacuum|comment|cd_set_access_state|cd_grant_internal_tester)\b/i.test(
      noStrings,
    ),
    "6.3 and none can write (no DML, DDL, grant, or the state setter)",
  );
  for (const needle of [
    "cd_access_policy",
    "cd_definition_versions",
    "cd_internal_testers",
    "review_status",
    "cd_sessions",
    "has_function_privilege",
  ]) {
    ok(sql.includes(needle), `6.4 the checklist reads ${needle}`);
  }
  const doc = read("docs/release/2026-10-03-career-analysis-availability.md");
  ok(/## The truth table/.test(doc), "6.5 the release note carries the truth table");
  for (const state of STATES) ok(doc.includes(state), `6.6 and names ${state}`);
  ok(
    doc.includes("SELECT public.cd_set_access_state('public'") &&
      doc.includes("cd_set_access_state('internal_test'") &&
      doc.includes("cd_set_access_state('paused'"),
    "6.7 the opening call and both rollbacks are written out exactly",
  );
  ok(
    /all seven review gates[\s\S]{0,120}`false`/i.test(doc) &&
      /owner's decision|decides by opening/i.test(doc),
    "6.8 it states that the review gates are false and that opening is the owner's decision",
  );
  ok(
    /rollback artifact/i.test(doc) && /refuses while/i.test(doc),
    "6.9 and that the rollback artifact refuses while public",
  );
  ok(
    /supabase\/readiness\/career-analysis-availability\.sql/.test(doc),
    "6.10 and points at the read-only checklist",
  );
  const rollback = read("supabase/rollback/20261222090000_cd_access_policy_rollback.sql");
  ok(
    /public/.test(rollback) && /RAISE EXCEPTION/.test(rollback),
    "6.11 the control's rollback artifact does refuse while public",
  );
}

// =========================================================================
group("7 · Wired: package script, CI, db-test, controls");
// =========================================================================
{
  const pkg = read("package.json");
  ok(
    pkg.includes('"career-analysis-availability:check"'),
    "7.1 package.json has career-analysis-availability:check",
  );
  ok(pkg.includes('"career-analysis-surfaces:check"'), "7.2 and career-analysis-surfaces:check");
  ok(
    pkg.includes('"negative-controls:career-analysis-availability"') &&
      /negative-controls:all"[^\n]*negative-controls:career-analysis-availability/.test(pkg),
    "7.3 the planted controls are in negative-controls:all",
  );
  const ci = read(".github/workflows/ci.yml");
  ok(
    ci.includes("career-analysis-availability:check") &&
      ci.includes("career-analysis-surfaces:check"),
    "7.4 CI's verify job runs both",
  );
  const db = read("scripts/db-test.sh");
  ok(
    db.includes("cd_availability_matrix_test.sql") &&
      ["NC1", "NC2", "NC3", "NC4"].every((n) => db.includes(`cdav_nc_expect_fail "${n} `)),
    "7.5 db-test.sh runs the SQL matrix with four planted controls",
  );
  ok(existsSync("e2e/career-analysis-availability.spec.ts"), "7.6 the browser spec exists");
}

function existsSync(p: string): boolean {
  try {
    statSync(join(ROOT, p));
    return true;
  } catch {
    return false;
  }
}

console.log("");
if (failures.length > 0) {
  console.error(`career-analysis-availability-check FAILED (${failures.length} of ${checks}).`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `career-analysis-availability-check: ${checks} assertions passed (${relative(ROOT, import.meta.path)}).`,
);
