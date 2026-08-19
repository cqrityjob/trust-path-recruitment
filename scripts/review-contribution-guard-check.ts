/**
 * The client must never submit a competency contribution.
 *
 * ── WHY THIS IS A BUILD GUARD AND NOT A CODE REVIEW NOTE ────────────────
 *
 * `ReviewQueue.tsx` shipped `contribution: 0.5` as a literal, `completeReview`
 * re-declared it as `z.number().default(0.5)`, and `scp_complete_human_review`
 * accepted it as `_contribution numeric DEFAULT 0.5`. Thirteen of the eighteen
 * Security Guard items route to human review, so a constant was written as the
 * evidence for most of a run — identically whether the reviewer upheld the
 * reading or overturned it. Nothing failed. Nothing looked wrong. It was three
 * plausible lines in three different files.
 *
 * 20260823090000 removed the parameter from the database function, so a call
 * that passes one now fails loudly. This guard closes the other direction: it
 * fails the build if a contribution field reappears on the client side, before
 * anybody discovers it by reading a competence record that says 0.500.
 *
 * The contribution is derived server-side from the item's own governed scoring,
 * or for a constructed response from the rubric levels the reviewer selected.
 * Not here, and not in a browser.
 *
 * Run: bun run review-contribution:check
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ROOTS = ["src/components/academy", "src/lib/security-competency", "src/routes"];

/** `contribution:` or `_contribution` anywhere in an object literal or an RPC
 *  argument list. Deliberately broad: the point is that the concept does not
 *  belong on this side of the boundary at all, not that one spelling of it is
 *  banned. */
const BANNED = [/\bcontribution\s*:/, /\b_contribution\b/];

/** The evidence contribution is a scoring concept. These are not. */
const ALLOWED_CONTEXT = /contribution(s)?["'`\]]|\/\/|\*|contributions\b/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const offenders: string[] = [];
let scanned = 0;

for (const r of ROOTS) {
  for (const file of walk(join(ROOT, r))) {
    scanned += 1;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      // A comment explaining why the field is gone is the opposite of a
      // regression, and this file is full of them on purpose.
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      if (BANNED.some((re) => re.test(line)) && !ALLOWED_CONTEXT.test(trimmed)) {
        offenders.push(`${relative(ROOT, file)}:${i + 1}  ${trimmed}`);
      }
    });
  }
}

console.log(`review-contribution:check — scanned ${scanned} file(s) under ${ROOTS.join(", ")}`);

// ── The SQL side of the same invariant ──────────────────────────────────
//
// The forbidden thing is CLIENT CONTROL of the number. 20260823090000 kept the
// old five-argument signature alive for one deploy window; 20260824090000
// removed it once the new build was live, because a stale tab calling it could
// not express 'no_concern' and would silently record `low` on a correct answer.
//
// So the check flipped: the deprecated overload must now be ABSENT, and the
// governed one must still declare no contribution parameter. Its body may
// mention `_contribution` — that is the local variable holding the value it
// DERIVES, which is the whole point.
const MAINT = join(
  ROOT,
  "supabase/migrations/20260824090000_scp_review_concurrency_and_legacy_removal.sql",
);
const sqlProblems: string[] = [];

if (existsSync(MAINT)) {
  const sql = readFileSync(MAINT, "utf8");
  if (
    !sql.includes(
      "DROP FUNCTION IF EXISTS public.scp_complete_human_review(uuid, text, text, numeric, text)",
    )
  ) {
    sqlProblems.push("the maintenance migration no longer drops the deprecated overload");
  }
  if (!sql.includes("FOR UPDATE OF hr")) {
    sqlProblems.push("the review lookup no longer locks the review row (F1 regression)");
  }
  if (!sql.includes("AND review_status = 'pending'")) {
    sqlProblems.push("the completion UPDATE is no longer guarded by pending (F1 regression)");
  }
  console.log(
    `review-contribution:check — checked the maintenance migration in ${relative(ROOT, MAINT)}`,
  );
} else {
  sqlProblems.push("the F1/F2 maintenance migration is missing");
}

if (offenders.length || sqlProblems.length) {
  console.error("\nFAIL: a competency contribution is under client control.");
  console.error(
    "The number is derived server-side in scp_complete_human_review from the\n" +
      "item's governed scoring, or from the reviewer's rubric levels. A client\n" +
      "that supplies one is writing a value nobody measured. A deprecated\n" +
      "argument that is accepted and thrown away is fine; one that is read is not.\n",
  );
  for (const o of offenders) console.error("  - " + o);
  for (const p of sqlProblems) console.error("  - " + p);
  process.exit(1);
}

console.log("review-contribution:check: PASS (no client-controlled contribution)");
