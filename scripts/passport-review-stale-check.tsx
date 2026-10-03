// Security Passport — a decision names the version its decider saw, and a
// stale page says so in words the decider can act on.
//
// Run via `bun run passport-review-stale:check`.
// Planted controls: `bun run negative-controls:passport-review-stale`.
//
// 20270125090000 made `sp_verifier_decide` refuse a decision whose named
// `submitted_at` is not the request's current one (SP_REVIEW_STALE). It also
// refuses a call that names no version on a request the candidate answered by
// editing. The database half is proven by
// supabase/tests/sp_decision_bound_to_reviewed_content_test.sql; SR7 walks the
// review page's own read model.
//
// This guard covers the application half, which the database cannot see:
//
//   1  the refusal is classified and has copy that tells the decider what
//      happened and what to do, in both languages, without database words;
//   2  the server function requires the version and calls the reviewed entry
//      point, and nothing in src/ still calls the bare decision;
//   3  the CQrityjob reviewer workspace sends the version its loaded detail
//      carries, refuses to send a decision without one, and reloads the
//      detail on SP_REVIEW_STALE so the new content is what is shown;
//   4  the employer attestation page does the same from its queue item.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  classifyDecisionError,
  decisionErrorCodeFrom,
  DECISION_ERROR_PREFIX,
} from "../src/lib/security-passport/decision-errors";
import { passportT } from "../src/lib/security-passport/i18n";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
/** Comments explain the anti-patterns at length; assert on code only. */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const MIG = "supabase/migrations/20270125090000_sp_decision_bound_to_reviewed_content.sql";
const FNS = "src/lib/security-passport/verification.functions.ts";
const REVIEW = "src/routes/_authenticated.passport-review.tsx";
const EMPLOYER =
  "src/routes/_authenticated.employer.$employerSlug.employment-verifications.$requestId.tsx";

/* ================================================================== */
group("GROUP 1 — SP_REVIEW_STALE is understood and explained");
/* ================================================================== */
{
  // The real messages the database raises, read from the migration, so a
  // reworded refusal cannot silently fall through to "try again".
  const raised = [...read(MIG).matchAll(/RAISE EXCEPTION '(SP_REVIEW_STALE:[^']*)'/g)].map(
    (m) => m[1],
  );
  ck("1.1 the migration raises SP_REVIEW_STALE in three places", raised.length === 3);
  ck(
    "1.2 every raised SP_REVIEW_STALE message classifies as review_stale",
    raised.length > 0 &&
      raised.every((m) => classifyDecisionError(`ERROR: ${m}`) === "review_stale"),
  );
  ck(
    "1.3 the browser reads review_stale back off the thrown error",
    decisionErrorCodeFrom(new Error(`${DECISION_ERROR_PREFIX}review_stale`)) === "review_stale",
  );
  const sv = passportT("vq.decline.review_stale", "sv");
  const en = passportT("vq.decline.review_stale", "en");
  ck(
    "1.4 the Swedish copy says the candidate changed the entry and asks for a new decision",
    /ändrat/.test(sv) && /besluta igen/.test(sv) && sv !== passportT("vq.decline.unknown", "sv"),
  );
  ck(
    "1.5 the English copy says the candidate changed the entry and asks for a new decision",
    /changed/.test(en) && /decide again/.test(en) && en !== passportT("vq.decline.unknown", "en"),
  );
  ck(
    "1.6 neither copy carries database words",
    ![sv, en].some((t) => /SP_|submitted_at|sp_verifier|answered_at|RPC|SQL/i.test(t)),
  );
}

/* ================================================================== */
group("GROUP 2 — the server function names the version");
/* ================================================================== */
{
  const fns = code(FNS);
  ck(
    "2.1 the decision input requires reviewedSubmittedAt",
    /reviewedSubmittedAt:\s*z\.string\(\)\.min\(1\)/.test(fns),
  );
  ck(
    "2.2 the decision calls sp_verifier_decide_reviewed with the version",
    /rpc\("sp_verifier_decide_reviewed",\s*\{[^}]*_reviewed_submitted_at:\s*data\.reviewedSubmittedAt/.test(
      fns,
    ),
  );
  ck(
    "2.3 nothing in the decision path still calls the bare sp_verifier_decide",
    !/rpc\(\s*"sp_verifier_decide"/.test(fns) &&
      !/rpc\(\s*"sp_verifier_decide"/.test(code(REVIEW)) &&
      !/rpc\(\s*"sp_verifier_decide"/.test(code(EMPLOYER)),
  );
  ck(
    "2.4 both read models hand the page the request's submitted_at",
    /submittedAt:\s*String\(raw\.submitted_at/.test(fns) &&
      /submittedAt:\s*String\(r\.submitted_at\)/.test(fns),
  );
}

/* ================================================================== */
group("GROUP 3 — the CQrityjob reviewer workspace");
/* ================================================================== */
{
  const src = code(REVIEW);
  ck(
    "3.1 the decision sends the version of the detail this page loaded",
    /reviewedSubmittedAt:\s*detail\.submittedAt/.test(src),
  );
  ck(
    "3.2 no decision is sent without the loaded detail of THIS request",
    /if\s*\(\s*!detail\s*\|\|\s*detail\.id\s*!==\s*selected\s*\|\|\s*!detail\.submittedAt\s*\)/.test(
      src,
    ),
  );
  ck(
    "3.3 review_stale has its own copy in DECLINE_KEY",
    /review_stale:\s*"vq\.decline\.review_stale"/.test(src),
  );
  const at = src.indexOf('code === "review_stale"');
  const branch = at === -1 ? "" : src.slice(at, at + 400);
  ck(
    "3.4 on SP_REVIEW_STALE the detail is reloaded and shown",
    /loadDetail\(\{\s*data:\s*\{\s*requestId:\s*selected\s*\}\s*\}\)/.test(branch) &&
      /setDetail\(/.test(branch),
  );
}

/* ================================================================== */
group("GROUP 4 — the employer attestation page");
/* ================================================================== */
{
  const src = code(EMPLOYER);
  ck(
    "4.1 the decision sends the version of the queue item this page shows",
    /const reviewedSubmittedAt = item\.submittedAt;/.test(src) &&
      /^\s*reviewedSubmittedAt,\s*$/m.test(src),
  );
  ck(
    "4.2 no decision is sent without a loaded version",
    /if\s*\(\s*!item\?\.submittedAt\s*\)/.test(src),
  );
  ck(
    "4.3 review_stale has its own copy in DECLINE_KEY",
    /review_stale:\s*"vq\.decline\.review_stale"/.test(src),
  );
  ck(
    "4.4 on SP_REVIEW_STALE the queue is refetched so the new version is shown",
    /if\s*\(code === "review_stale"\)\s*void query\.refetch\(\);/.test(src),
  );
}

console.log("");
if (fails.length) {
  console.error(`passport-review-stale: ${fails.length} failure(s)`);
  for (const f of fails) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log("passport-review-stale: all checks passed");
