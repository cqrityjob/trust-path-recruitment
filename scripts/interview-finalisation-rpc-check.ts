/**
 * The security boundary: a member calling scp_iv_finalise_report directly.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM THE UI GUARD ───────────────────────
 *
 * Hiding a button is a courtesy to an honest user. It stops nobody. The rule
 * that actually holds is in the database, and the only way to know it holds is
 * to call the function as a member and watch it refuse.
 *
 * The UI guard next door proves the screen no longer lies. This proves the
 * screen was never what was protecting anything — so that if someone later
 * decides the button should be shown to everyone again, or a request is
 * crafted by hand, the answer is still no.
 *
 * ── WHAT "REFUSED" HAS TO MEAN ─────────────────────────────────────────
 *
 * Not merely "an error happened". A member could be refused for the wrong
 * reason -- a missing case, a blocker, a typo in the function name -- and a
 * test that accepts any failure would pass while the role check was deleted.
 *
 * So it asserts the SPECIFIC refusal (SCP_IV_FINALISE_ROLE, errcode 42501),
 * and separately asserts that the same call as an owner gets PAST the role
 * check. Without that second half this file would pass just as happily if the
 * function rejected everybody.
 *
 * LOCAL ONLY. It runs inside a transaction that is always rolled back, and
 * refuses to run against anything but the local development database.
 *
 *   bun run scripts/interview-finalisation-rpc-check.ts
 */

import { SQL } from "bun";

const CONNECTION =
  process.env.SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

let failures = 0;
let passes = 0;

function ok(cond: boolean, label: string): void {
  if (cond) {
    passes += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

const db = new SQL(CONNECTION);

console.log("interview-finalisation-rpc-check\n");

const guard = await db`select current_database() as db`;
if (!["postgres", "scp_ci_test"].includes(guard[0].db)) {
  console.error(
    `  REFUSED: this check runs only against the local database (got "${guard[0].db}")`,
  );
  process.exit(1);
}

/** Runs the finalise call as a given user with the `authenticated` role,
 *  exactly as PostgREST would, and returns the error it raised (or null).
 *
 *  Each probe sits in its OWN SAVEPOINT. The refusal we are looking for is a
 *  RAISE EXCEPTION, which aborts the enclosing transaction — so without one,
 *  the very first (and expected) refusal would make every statement after it
 *  fail with "current transaction is aborted", and the discriminating owner
 *  probe below could never run. */
let probe = 0;
async function callAs(
  tx: SQL,
  userId: string,
  caseId: string,
): Promise<{ message: string; code: string } | null> {
  const name = `probe_${(probe += 1)}`;
  await tx.unsafe(`SAVEPOINT ${name}`);
  try {
    await tx`SELECT set_config('request.jwt.claims',
      json_build_object('sub', ${userId}::text, 'role', 'authenticated')::text, true)`;
    await tx.unsafe(`SET LOCAL ROLE authenticated`);
    await tx`SELECT public.scp_iv_finalise_report(${caseId}::uuid)`;
    return null;
  } catch (err) {
    // Bun's driver puts its own tag in `code` (ERR_POSTGRES_SERVER_ERROR) and
    // the actual SQLSTATE in `errno`. The SQLSTATE is the part that carries
    // meaning: 42501 is insufficient_privilege, and asserting it is what
    // separates "refused because of who you are" from "failed somehow".
    const e = err as { message?: string; code?: string; errno?: string };
    return { message: String(e.message ?? ""), code: String(e.errno ?? e.code ?? "") };
  } finally {
    // Rolls back the role, the claim and any write the call managed before it
    // raised, leaving the transaction usable for the next probe.
    await tx.unsafe(`ROLLBACK TO SAVEPOINT ${name}`);
  }
}

// A case belonging to an employer that has both an owner and an ordinary
// member, so both halves of the claim can be made about the same row.
const subjects = await db`
  SELECT c.id AS case_id, c.employer_id,
         (SELECT m.user_id FROM public.employer_memberships m
           WHERE m.employer_id = c.employer_id AND m.status = 'active'
             AND m.role IN ('owner','admin') LIMIT 1) AS privileged,
         (SELECT m.user_id FROM public.employer_memberships m
           WHERE m.employer_id = c.employer_id AND m.status = 'active'
             AND m.role = 'member' LIMIT 1) AS ordinary
    FROM public.scp_interview_cases c
   WHERE c.status <> 'cancelled'
   ORDER BY c.created_at DESC
`;

const subject = subjects.find(
  (r: { privileged: string | null; ordinary: string | null }) => r.privileged && r.ordinary,
);

if (!subject) {
  console.error(
    "  REFUSED: no local interview case belongs to an employer with BOTH an\n" +
      "           owner/admin and an ordinary member. Run\n" +
      "           scripts/fixtures/interview-context-bridge-fixture.sql.",
  );
  process.exit(1);
}

console.log(`  using case ${subject.case_id}\n`);

const ROLLBACK = Symbol("intentional rollback");
try {
  await db.begin(async (tx) => {
    // ── E · the ordinary member is refused, by name ──────────────────
    const memberErr = await callAs(tx, subject.ordinary, subject.case_id);

    ok(memberErr !== null, "E · a member calling the RPC directly is refused");
    ok(
      (memberErr?.message ?? "").includes("SCP_IV_FINALISE_ROLE"),
      `E · refused for the ROLE reason specifically (got: ${memberErr?.message.slice(0, 90)})`,
    );
    ok(
      (memberErr?.message ?? "").includes("requires an employer owner or admin"),
      "E · and says why, in the words the product uses",
    );
    ok(
      memberErr?.code === "42501",
      `E · with insufficient_privilege (42501), not a generic failure (got ${memberErr?.code})`,
    );

    // ── The discriminator ────────────────────────────────────────────
    //
    // An owner must get PAST the role check. Whether they then succeed or hit
    // a blocker is not this file's business -- what matters is that the
    // refusal above is about the ROLE and not about the function refusing
    // everybody, which is the way this test could pass while proving nothing.
    const ownerErr = await callAs(tx, subject.privileged, subject.case_id);
    ok(
      !(ownerErr?.message ?? "").includes("SCP_IV_FINALISE_ROLE"),
      `· an owner/admin is NOT stopped by the role check (got: ${ownerErr?.message.slice(0, 90) ?? "no error"})`,
    );

    // ── A member is not refused for some other reason first ──────────
    //
    // The role check must come before the blockers check, or a member could
    // learn a case's readiness by probing the finalise call.
    ok(
      !(memberErr?.message ?? "").includes("SCP_IV_REPORT_BLOCKED"),
      "E · the member is stopped by role before anything about the case is revealed",
    );

    throw ROLLBACK;
  });
} catch (err) {
  if (err !== ROLLBACK) throw err;
}

// Nothing was finalised by any of the above.
const stillOpen = await db`
  SELECT count(*)::int AS n FROM public.scp_interview_reports
   WHERE case_id = ${subject.case_id} AND status = 'final'`;
console.log(`\n  (final reports for this case after rollback: ${stillOpen[0].n})`);

await db.end();

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
