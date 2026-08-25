// Anonymous result -> account claim — regression.
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// A candidate completed Career Discovery anonymously, created an account to
// save the result, confirmed their email, signed in — and the result was
// gone. Nothing failed loudly: the finished run lived in sessionStorage
// (per-TAB), and the confirmation email's link opens in a different tab. The
// result was destroyed by the act of creating the account whose only purpose
// was to keep it.
//
// ── WHAT IS ASSERTED ───────────────────────────────────────────────────
//
// The staged claim is the mechanism that carries a finished run across that
// hop, so the properties that matter are the ones that make it safe:
//
//   * it survives a new tab (localStorage, not sessionStorage);
//   * it is claimable exactly once, and only with its own token;
//   * ANOTHER PERSON signing in on the same browser claims nothing;
//   * the claimed run is byte-identical to the one the candidate saw — no
//     answer, no completion time and no career context drifts;
//   * it expires, and an expired record is destroyed rather than read;
//   * an incomplete run, or one from a different instrument version, is
//     never claimable at all.
//
// Runs headless against a stubbed browser store: the module under test is
// pure client-side storage logic, and the assertions are about exactly that.

// ── Browser stub, installed before the module under test is imported ─────
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = { localStorage, sessionStorage };

const {
  clearPendingClaim,
  hasPendingClaim,
  isComplete,
  markComplete,
  readPendingClaim,
  recordAnswer,
  sessionItemIds,
  stageClaim,
  startBuffer,
} = await import("../src/lib/career-discovery/v31-public-buffer");
const { CORE_ITEMS } = await import("../src/lib/career-discovery/v31/core-items");
const { OPTION_SET_BY_QUESTION } = await import(
  "../src/lib/career-discovery/v31/option-matrix"
);
const { CONTENT_VERSION, DEFINITION_VERSION } = await import(
  "../src/lib/career-discovery/v31/version"
);
const { isPersonalItemId, personalItem } = await import(
  "../src/lib/career-discovery/v31/personal-layer"
);

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

const CORE_BY_ID = new Map(CORE_ITEMS.map((i) => [i.id, i] as const));

/** A complete anonymous run, answered deterministically. */
function completedBuffer(seed: number) {
  let buffer = startBuffer("sv", "2026-08-25T09:00:00.000Z");
  // Answering C1 decides which adaptive items exist, so the id list is
  // re-derived after every answer rather than taken once.
  for (let guard = 0; guard < 64; guard += 1) {
    const ids = sessionItemIds(
      (buffer.answers.find((a) => a.itemId === "CTX_CURRENT_STATUS") as { value?: string })?.value
        ? ((buffer.answers.find((a) => a.itemId === "CTX_CURRENT_STATUS") as { value: string })
            .value as never)
        : null,
    );
    const next = ids.find((id) => !buffer.answers.some((a) => a.itemId === id));
    if (!next) break;
    if (isPersonalItemId(next)) {
      const item = personalItem(next);
      const options = item?.options ?? [];
      const pick = options[seed % Math.max(1, options.length)];
      buffer = recordAnswer(buffer, { itemId: next, format: "personal", value: pick.value });
    } else {
      const item = CORE_BY_ID.get(next);
      if (!item) break;
      if (item.format === "scale") {
        buffer = recordAnswer(buffer, {
          itemId: next,
          format: "scale",
          value: ((seed + next.length) % 10) + 1,
        });
      } else {
        // Options live in the option matrix, not on the item — a scale item
        // has none at all, which is why the format decides where to look.
        const options = OPTION_SET_BY_QUESTION[item.id]?.options ?? [];
        if (options.length === 0) break;
        buffer = recordAnswer(buffer, {
          itemId: next,
          format: "single_choice",
          optionId: options[seed % options.length].id,
        });
      }
    }
  }
  return markComplete(buffer, "2026-08-25T09:20:00.000Z");
}

const CONTEXT = { currentProfessionStatus: "prefer_not_to_say", experienceBand: null };

// =========================================================================
group("1 · A finished run is claimable, exactly once, with its own token");
// =========================================================================

localStorage.clear();
const finished = completedBuffer(3);
ok(isComplete(finished), "1.0 the fixture run is actually complete");

const token = stageClaim(finished, CONTEXT);
ok(typeof token === "string" && token.length > 0, "1.1 staging returns a token");
ok(hasPendingClaim(), "1.2 a pending claim exists");

const claimed = readPendingClaim(token);
ok(claimed !== null, "1.3 the right token claims it");
ok(
  JSON.stringify(claimed?.buffer.answers) === JSON.stringify(finished.answers),
  "1.4 every answer survives the hop unchanged",
);
ok(
  claimed?.buffer.completedAt === finished.completedAt,
  "1.5 the completion time is the one the candidate saw, not a new one",
);
ok(
  JSON.stringify(claimed?.careerContext) === JSON.stringify(CONTEXT),
  "1.6 the career context travels with it",
);
ok(claimed?.buffer.contentVersion === CONTENT_VERSION, "1.7 the instrument version travels with it");
ok(
  claimed?.buffer.definitionVersion === DEFINITION_VERSION,
  "1.8 the definition version travels with it",
);

clearPendingClaim();
ok(readPendingClaim(token) === null, "1.9 once claimed and cleared it cannot be claimed again");
ok(!hasPendingClaim(), "1.10 and nothing is left pending");

// =========================================================================
group("2 · Another person on the same browser claims nothing");
// =========================================================================
//
// This is the assertion that makes a browser-local mechanism safe. The token
// is minted when the candidate asks to save and travels only in the return
// URL handed to the auth flow -- which for email signup means it travels
// inside the confirmation link sent to their own address. Somebody else
// signing in at /candidate/login arrives with no token.

localStorage.clear();
const aliceToken = stageClaim(completedBuffer(5), CONTEXT);
ok(aliceToken !== null, "2.0 a result is staged");
ok(readPendingClaim(null) === null, "2.1 no token claims nothing");
ok(readPendingClaim("") === null, "2.2 an empty token claims nothing");
ok(
  readPendingClaim("11111111-2222-3333-4444-555555555555") === null,
  "2.3 a different token claims nothing",
);
ok(
  readPendingClaim(`${aliceToken}x`) === null,
  "2.4 a token that is merely close claims nothing",
);
ok(readPendingClaim(aliceToken) !== null, "2.5 the owner's own token still works");

// =========================================================================
group("3 · Expiry destroys rather than reveals");
// =========================================================================

localStorage.clear();
const expiringToken = stageClaim(completedBuffer(7), CONTEXT) as string;
const raw = JSON.parse(localStorage.getItem("cqj:discovery:v31:pending-claim:v1") as string);
localStorage.setItem(
  "cqj:discovery:v31:pending-claim:v1",
  JSON.stringify({ ...raw, expiresAt: new Date(Date.now() - 1000).toISOString() }),
);
ok(readPendingClaim(expiringToken) === null, "3.1 an expired claim is not readable");
ok(!hasPendingClaim(), "3.2 an expired claim is removed on the read that found it");

// =========================================================================
group("4 · Only a genuinely finished, current run is claimable");
// =========================================================================

localStorage.clear();
const halfDone = recordAnswer(startBuffer("sv", "2026-08-25T09:00:00.000Z"), {
  itemId: "CTX_CURRENT_STATUS",
  format: "personal",
  value: "working_in_security",
});
ok(!isComplete(halfDone), "4.0 the fixture run is genuinely incomplete");
ok(stageClaim(halfDone, CONTEXT) === null, "4.1 an unfinished run cannot be staged");
ok(!hasPendingClaim(), "4.2 and nothing is left behind by the attempt");

localStorage.clear();
const staleToken = stageClaim(completedBuffer(11), CONTEXT) as string;
const staleRaw = JSON.parse(localStorage.getItem("cqj:discovery:v31:pending-claim:v1") as string);
localStorage.setItem(
  "cqj:discovery:v31:pending-claim:v1",
  JSON.stringify({
    ...staleRaw,
    buffer: { ...staleRaw.buffer, contentVersion: "v0.0-not-a-version" },
  }),
);
ok(
  readPendingClaim(staleToken) === null,
  "4.3 a run recorded against a different instrument version is never replayed",
);

// =========================================================================
group("5 · One pending claim per browser");
// =========================================================================

localStorage.clear();
const firstToken = stageClaim(completedBuffer(13), CONTEXT) as string;
const secondToken = stageClaim(completedBuffer(17), CONTEXT) as string;
ok(firstToken !== secondToken, "5.1 each staging mints its own token");
ok(readPendingClaim(firstToken) === null, "5.2 the superseded claim is no longer claimable");
ok(readPendingClaim(secondToken) !== null, "5.3 the newest finished run is the one that is kept");

console.log(
  failures === 0
    ? `\ncareer-discovery-claim-check: all ${checks} checks passed.`
    : `\nFAIL  ${checks - failures}/${checks} claim checks`,
);
process.exit(failures === 0 ? 0 : 1);
