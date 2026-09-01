/**
 * Scenario E — a completed interview report does not move when live data does.
 *
 * The claim this PR has to hold is precise: the briefing reads the candidate's
 * CV, the advert and the released assessment LIVE, and a finished report must
 * not inherit that liveness. Change the advert tomorrow and last month's
 * report must still say what it said.
 *
 * Proving that through a browser would prove less: the report screen rendering
 * the same words is consistent with the payload having been rebuilt from
 * changed inputs and happening to look similar. What actually has to be true
 * is that the stored payload and its content hash are byte-identical after the
 * inputs it was built from have changed underneath it. So this runs against
 * the local database directly, mutates the live records the briefing reads,
 * and compares hashes.
 *
 * LOCAL ONLY. It writes to jobs and job_applications and rolls every change
 * back; it refuses to run against anything but the local development database.
 *
 *   bun run scripts/interview-context-bridge-history-check.ts
 */

// Bun's built-in Postgres client. No new dependency for a local-only guard,
// and the same driver the runtime already ships.
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

console.log("interview-context-bridge-history-check\n");

// Refuse to run anywhere that is not the local development database. The
// script mutates live recruitment rows, and although it rolls back, a rollback
// is not a defence against having run at all.
const guard = await db`select current_database() as db`;
if (!["postgres", "scp_ci_test"].includes(guard[0].db)) {
  console.error(
    `  REFUSED: this check runs only against the local database (got "${guard[0].db}")`,
  );
  process.exit(1);
}

// A case that is REPORTED, whose report is final, and which is linked to an
// application and a job — the only shape that can answer the question, because
// an unlinked case has no live inputs to change.
const cases = await db`
  SELECT c.id AS case_id, c.application_id, c.job_id, r.content_hash, r.payload
    FROM public.scp_interview_cases c
    JOIN public.scp_interview_reports r ON r.case_id = c.id
   WHERE r.status = 'final'
     AND c.application_id IS NOT NULL
     AND c.job_id IS NOT NULL
   ORDER BY r.finalised_at DESC
   LIMIT 1
`;

if (cases.length === 0) {
  console.error(
    "  REFUSED: no finalised report linked to an application exists locally.\n" +
      "           Run scripts/fixtures/interview-journey-fixture.sql and walk one interview to completion.",
  );
  process.exit(1);
}

const subject = cases[0];
console.log(`  using case ${subject.case_id}\n`);

const before = {
  hash: subject.content_hash,
  payload: JSON.stringify(subject.payload),
};

ok(before.hash !== null && before.hash !== "", "the report was stored with a content hash");
ok(before.payload !== "null", "the report was stored with a payload");

// ── Change everything the briefing reads live ──────────────────────────────
// `db.begin` commits when its callback returns and rolls back when it throws,
// so the rollback here is a DELIBERATE throw rather than an error path. The
// sentinel is matched by identity on the way out: swallowing every throw would
// also swallow a genuine failure inside the block and report success.
const ROLLBACK = Symbol("intentional rollback");

try {
  await db.begin(async (tx) => {
    await tx`
      UPDATE public.jobs
         SET requirements = '["EDITED AFTER THE REPORT WAS FINALISED"]'::jsonb,
             title_sv = title_sv || ' (edited)',
             formal_requirement_ids = ARRAY['EDITED'],
             driving_licence_required = NOT driving_licence_required
       WHERE id = ${subject.job_id}`;
    await tx`
      UPDATE public.job_applications
         SET cover_note = 'EDITED AFTER THE REPORT WAS FINALISED',
             status = 'reviewing'
       WHERE id = ${subject.application_id}`;

    // Prove the mutation actually landed, so a no-op UPDATE cannot masquerade
    // as a passing test. A check whose setup silently did nothing always
    // passes, and passes for the worst possible reason.
    const changed = await tx`
      SELECT count(*)::int AS n FROM public.jobs
       WHERE id = ${subject.job_id}
         AND requirements @> '["EDITED AFTER THE REPORT WAS FINALISED"]'::jsonb`;
    ok(changed[0].n === 1, "the live advert really did change underneath the report");

    const after = await tx`
      SELECT content_hash, payload FROM public.scp_interview_reports
       WHERE case_id = ${subject.case_id} AND status = 'final'`;

    ok(after[0].content_hash === before.hash, "the report's content hash is unchanged");
    ok(JSON.stringify(after[0].payload) === before.payload, "the report's payload is unchanged");

    // The immutability is not a happy accident of nothing having read it: the
    // report is a stored snapshot, and the briefing is a separate live read
    // that never writes. Confirm no report row was touched by the mutation.
    const touched = await tx`
      SELECT count(*)::int AS n FROM public.scp_interview_reports
       WHERE case_id = ${subject.case_id} AND status = 'final'
         AND content_hash IS DISTINCT FROM ${before.hash}`;
    ok(touched[0].n === 0, "no finalised report row was rewritten");

    throw ROLLBACK;
  });
} catch (err) {
  if (err !== ROLLBACK) throw err;
}

// And the rollback really restored it, so the next run starts where this did.
const restored = await db`
  SELECT content_hash FROM public.scp_interview_reports
   WHERE case_id = ${subject.case_id} AND status = 'final'`;
ok(restored[0].content_hash === before.hash, "the database was left as it was found");

await db.end();

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
