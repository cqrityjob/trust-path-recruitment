// Anonymous result -> account -> saved result. The conversion contract.
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// Independent pilot testing walked the journey the public product
// advertises: start Career Discovery without an account, answer all
// twenty-eight questions, read the result, press "create an account and save
// it", sign up, confirm the email, come back.
//
// The candidate came back to "the assessment isn't open yet".
//
// Two gates had been collapsed into one. `cd_internal_testers` decides
// whether a SIGNED-IN person may run the assessment while the Career
// Intelligence layer is mid-build — a release-phase cohort control, and a
// reasonable one. It was also the only check on the SAVE path, and the flow
// resolved it before it resolved the claim, so a legitimate finished run was
// refused and then never looked at. Anonymous use permitted, authenticated
// save forbidden, for the same person and the same twenty-eight answers.
//
// ── WHAT IS ASSERTED ───────────────────────────────────────────────────
//
// The properties the fix turns on, tested as behaviour wherever they can be
// (the gate is a pure function, the run's identity is a pure function) and
// as structure only where the surrounding code cannot be run headless.
//
// Companion to scripts/career-discovery-claim-check.ts, which covers the
// browser-storage half of the same journey.

import { readFileSync } from "node:fs";

import {
  resolveSaveGate,
  v31PublicErrorCode,
  V31PublicError,
} from "../src/lib/career-discovery/v31-public.functions";
import { deriveClaimSessionId } from "../src/lib/career-discovery/v31-claim-id";
import { safeReturnPath } from "../src/lib/auth/safe-redirect";
import { dictionaries } from "../src/i18n/dictionaries";

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function group(name: string): void {
  console.log(`\n${name}`);
}

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

// =========================================================================
group("1 · Product availability is not result ownership");
// =========================================================================
//
// The truth table, stated once. Every other assertion in this file is about
// making sure the product actually asks this function.

ok(
  resolveSaveGate({ isInternalTester: true, isPlatformAdmin: false, isAnonymousClaim: false }) ===
    "allow_test_group",
  "1.1 an internal tester saves a run they started signed in — unchanged",
);
ok(
  resolveSaveGate({ isInternalTester: false, isPlatformAdmin: true, isAnonymousClaim: false }) ===
    "allow_test_group",
  "1.2 a platform admin saves a run they started signed in — unchanged",
);
ok(
  resolveSaveGate({ isInternalTester: false, isPlatformAdmin: false, isAnonymousClaim: false }) ===
    "deny",
  "1.3 the allowlist STILL closes the authenticated in-product run",
);
// The one line that fixes the pilot blocker.
ok(
  resolveSaveGate({ isInternalTester: false, isPlatformAdmin: false, isAnonymousClaim: true }) ===
    "allow_claim",
  "1.4 and it does NOT block claiming a result finished anonymously",
);
ok(
  resolveSaveGate({ isInternalTester: true, isPlatformAdmin: false, isAnonymousClaim: true }) ===
    "allow_test_group",
  "1.5 a tester claiming is still a tester — no path loses its own reason",
);

// The allowlist is still read. A fix that simply deleted it would pass 1.4
// and quietly open the authenticated entrance, which is not what was decided.
const serverFns = read("src/lib/career-discovery/v31-public.functions.ts");
ok(
  serverFns.includes('rpc("cd_is_internal_tester"'),
  "1.6 the allowlist is still consulted, not removed",
);
ok(
  serverFns.includes("resolveSaveGate({"),
  "1.7 and the save path decides through resolveSaveGate rather than inline",
);
// Availability -- the owner's actual kill switch -- still applies to
// everybody, claim included: it is enforced by the database on the session
// insert and surfaced as not_available.
ok(
  serverFns.includes("CD_VERSION_NOT_ADMINISTRABLE"),
  "1.8 the global lifecycle gate is untouched and still refuses a closed product",
);

// =========================================================================
group("2 · One anonymous run is one owned result");
// =========================================================================
//
// Claiming used to mint a fresh session uuid on every call, so a
// double-click, a second tab finishing the same sign-in, a retry after a
// timeout that had actually succeeded, or a reload of the claim URL produced
// a SECOND session and a SECOND report for one run. Deriving the id from the
// claim token makes the primary key itself the idempotency check.

const idA = await deriveClaimSessionId("11111111-2222-3333-4444-555555555555");
const idB = await deriveClaimSessionId("11111111-2222-3333-4444-555555555555");
const idC = await deriveClaimSessionId("11111111-2222-3333-4444-555555555556");

ok(idA === idB, "2.1 the same token always names the same session");
ok(idA !== idC, "2.2 a different token names a different session");
ok(
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(idA),
  "2.3 and it is a well-formed uuid the column will accept",
);
ok(!idA.includes("11111111-2222"), "2.4 the id is not the token — the derivation is one-way");
{
  const ids = new Set<string>();
  for (let i = 0; i < 500; i += 1) ids.add(await deriveClaimSessionId(`token-${i}`));
  ok(ids.size === 500, "2.5 five hundred tokens produce five hundred distinct ids");
}

ok(
  /\.\.\.\(claimSessionId \? \{ id: claimSessionId \} : \{\}\)/.test(serverFns),
  "2.6 the derived id is supplied on the claim path",
);
ok(
  !/user_id: ctx\.userId,[\s\S]{0,80}anon_session_token/.test(serverFns),
  "2.7 and a claimed session is owned by a real user_id, never an anonymous token",
);
ok(
  serverFns.includes('sessionError?.code === "23505"'),
  "2.8 a repeat claim is recognised as a collision, not reported as a failure",
);
ok(
  serverFns.includes('throw new V31PublicError("already_claimed")'),
  "2.9 a run owned by another account is refused as its own state",
);
// The theft defence is RLS, not an ownership comparison in application code.
ok(
  /from\("cd_sessions"\)\s*\n\s*\.select\("id"\)\s*\n\s*\.eq\("id", claimSessionId\)/.test(
    serverFns,
  ),
  "2.10 whose run it is is answered by an RLS-scoped read, not by trusting the caller",
);
ok(
  serverFns.includes("ignoreDuplicates: true"),
  "2.11 a half-written previous attempt is resumed rather than duplicated",
);

// =========================================================================
group("3 · A refusal reaches the candidate as itself");
// =========================================================================
//
// A server function's rejection arrives at the browser serialised, not as
// the class that was thrown. Without this, "another account already saved
// this result" looked exactly like a dropped connection, and the candidate
// was invited to retry something that will refuse identically forever.

ok(
  v31PublicErrorCode(new V31PublicError("already_claimed")) === "already_claimed",
  "3.1 the thrown class is read directly",
);
ok(
  v31PublicErrorCode({ message: "already_claimed" }) === "already_claimed",
  "3.2 and so is the serialised form the browser actually receives",
);
ok(
  v31PublicErrorCode({ body: { message: "not_available" } }) === "not_available",
  "3.3 including one wrapped by the transport",
);
ok(
  v31PublicErrorCode(new Error("Failed to fetch")) === null,
  "3.4 a network failure is not a code",
);
ok(
  v31PublicErrorCode({ message: "the run was already_claimed by someone" }) === null,
  "3.5 EXACT matches only — a sentence containing a code is not that code",
);
ok(v31PublicErrorCode(undefined) === null, "3.6 nothing is not a code");

// =========================================================================
group("4 · The claim is resolved BEFORE the allowlist");
// =========================================================================
//
// The ordering IS the pilot fix. Asserted positionally because that is what
// went wrong: both checks existed, both were correct, and the wrong one ran
// first — so a finished run was refused by a question that was never about
// it, and then never looked at.

const flow = read("src/components/career-discovery/v31/PublicAssessmentFlow.tsx");
const claimAt = flow.indexOf("resolveClaimEntry(urlToken)");
const testerAt = flow.indexOf("await checkTesterStatus({})");
ok(claimAt > 0, "4.1 the boot effect resolves the claim token");
ok(testerAt > 0, "4.2 and still asks the allowlist question");
ok(claimAt < testerAt, "4.3 the claim is resolved FIRST — the whole defect, in one ordering");
ok(
  flow.includes('setPhase("claim-notice")'),
  "4.4 a claim that cannot be honoured is answered as itself, not as 'not open yet'",
);
ok(
  flow.includes("claimToken: claimToken ?? undefined"),
  "4.5 the token travels to the save, which is what tells the two gates apart",
);
ok(
  flow.includes("rememberClaimedResult(claimToken, result.snapshotId)"),
  "4.6 and what the claim produced is remembered, so Back is not 'your result is gone'",
);
// A run is never recomputed into a different report by the act of being
// claimed: the buffered answers and the frozen completedAt are replayed
// unchanged, which is the property career-discovery-canonical-result-check
// asserts byte-for-byte.
ok(
  flow.includes("completedAt: previewQuery.data?.completedAt ?? buffer.completedAt"),
  "4.7 the claim saves the report the candidate already read, not a fresh one",
);

// =========================================================================
group("5 · The signed-in candidate is not told they have no account");
// =========================================================================

const intro = read("src/components/career-discovery/v31/shell/AssessmentIntro.tsx");
ok(
  intro.includes('signedIn ? t("cd.public.introSignedIn") : t("cd.public.introNoAccount")'),
  "5.1 the 'no account needed' promise is shown only to somebody without one",
);
ok(
  intro.includes('signedIn ? t("cd.public.factSavedShort")'),
  "5.2 and so is the fact card that repeats it",
);
ok(flow.includes("signedIn={signedIn}"), "5.3 the flow tells the intro which visitor it has");

// =========================================================================
group("6 · Swedish and English say the same things");
// =========================================================================

const NEW_KEYS = [
  "cd.public.introSignedIn",
  "cd.public.factSavedShort",
  "cd.public.factSavedBody",
  "cd.public.claim.expired.title",
  "cd.public.claim.expired.body",
  "cd.public.claim.invalid.title",
  "cd.public.claim.invalid.body",
  "cd.public.claim.stale.title",
  "cd.public.claim.stale.body",
  "cd.public.claim.notFound.title",
  "cd.public.claim.notFound.body",
  "cd.public.claim.alreadyClaimed.title",
  "cd.public.claim.alreadyClaimed.body",
  "cd.public.claim.toMyCareer",
  "cd.public.claim.signIn",
  "cd.public.claim.startOver",
  "cd.public.claim.savedTitle",
  "cd.public.claim.savedBody",
  "auth.discoveryClaim.waiting",
] as const;

for (const key of NEW_KEYS) {
  const sv = (dictionaries.sv as Record<string, string>)[key];
  const en = (dictionaries.en as Record<string, string>)[key];
  ok(typeof sv === "string" && sv.trim().length > 0, `6.a ${key} — Swedish`);
  ok(typeof en === "string" && en.trim().length > 0, `6.b ${key} — English`);
  ok(sv !== en, `6.c ${key} — actually translated, not the same string twice`);
}

// The four failure states must not collapse back into one sentence: each
// tells the candidate something different about where their result is.
{
  const bodies = new Set(
    (["expired", "invalid", "stale", "notFound", "alreadyClaimed"] as const).map(
      (s) => (dictionaries.sv as Record<string, string>)[`cd.public.claim.${s}.body`],
    ),
  );
  ok(bodies.size === 5, "6.1 five claim states, five distinct Swedish explanations");
}
// None of them tells somebody whose result exists to answer the questions
// again -- the one instruction that would destroy what they came back for.
ok(
  !/gör om|börja om/i.test(
    (dictionaries.sv as Record<string, string>)["cd.public.claim.alreadyClaimed.body"],
  ),
  "6.2 'already saved' never invites a retake",
);

// =========================================================================
group("7 · The claim never becomes an open redirect");
// =========================================================================
//
// The token travels in a `redirect` parameter handed to the auth flow, which
// means it travels through the one value on this journey an attacker can
// choose. Nothing here is new — safeReturnPath already owned this — but the
// claim URL is now the most-used return path in the product, so its exact
// shapes are asserted rather than assumed.

const FALLBACK = "/my-career";
ok(
  safeReturnPath("/security-career-assessment?claim=abc-123", FALLBACK) ===
    "/security-career-assessment?claim=abc-123",
  "7.1 the real claim return path is allowed through",
);
for (const hostile of [
  "//evil.test/security-career-assessment?claim=abc",
  "https://evil.test/security-career-assessment?claim=abc",
  "/\\evil.test?claim=abc",
  "\\\\evil.test?claim=abc",
  "javascript:alert(1)//security-career-assessment?claim=abc",
  "/login?redirect=/login?redirect=/security-career-assessment?claim=abc",
]) {
  ok(safeReturnPath(hostile, FALLBACK) === FALLBACK, `7.2 refused: ${hostile}`);
}

// The report route's own new parameter cannot carry a destination: it is
// coerced to a boolean, so a hand-edited URL can add a reassurance and
// nothing else.
const reportRoute = read(
  "src/routes/_authenticated.security-career-assessment.report.$snapshotId.tsx",
);
ok(
  reportRoute.includes("validateSearch") && reportRoute.includes("{ saved: true }"),
  "7.3 the report's 'saved' parameter is coerced to a boolean, never echoed",
);
ok(
  !/search\.saved\s*\}/.test(reportRoute.replace(/const \{ saved \} = Route\.useSearch\(\);/, "")),
  "7.4 and its raw value never reaches the page",
);

console.log(
  failures === 0
    ? `\ncareer-discovery-conversion-check: all ${checks} checks passed.`
    : `\nFAIL  ${checks - failures}/${checks} conversion checks`,
);
process.exit(failures === 0 ? 0 : 1);
