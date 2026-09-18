/**
 * TEST ENVIRONMENT ONLY — take an imported BESKT draft to published and admit
 * one synthetic employer, using the SYNTHETIC governance people the local
 * fixture created (`beskt-journey-*@local.test`).
 *
 *   bun run scripts/beskt-import/synthetic-release.ts <method_version_id> [employer_slug]
 *
 * Every step goes through the governed RPC as a separate synthetic person, so
 * the database's own rules run: five different reviewers each decide only
 * their own gate, the publisher is not the author, and only a platform admin
 * grants a pilot. Every rationale says it is a synthetic test review.
 *
 * This is NOT a review of the method and must never be described as one. It
 * refuses to run against anything but loopback, and every account it uses
 * exists only in the disposable local database.
 */

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const url = process.env.BESKT_SUPABASE_URL ?? "";
const key = process.env.BESKT_SUPABASE_ANON_KEY ?? "";
const dbUrl = process.env.BCP_DATABASE_URL ?? "";
const PASSWORD = "LocalJourney!2026";
const versionId = process.argv[2] ?? "";
const employerSlug = process.argv[3] ?? "beskt-journey-ab";

const loopback = (u: string) => /^[a-z]+:\/\/([^@/]*@)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(u);
if (!loopback(url) || !loopback(dbUrl)) {
  console.error("REFUSED: the synthetic release runs only against a loopback test environment.");
  process.exit(2);
}
if (!/^[0-9a-f-]{36}$/.test(versionId)) {
  console.error("usage: synthetic-release.ts <method_version_id> [employer_slug]");
  process.exit(2);
}

const RATIONALE =
  "SYNTETISK TESTGRANSKNING i lokal testmiljö – inte en verklig granskning av metoden. / SYNTHETIC TEST REVIEW in a local test environment – not a real review of the method.";

function sql(q: string): string {
  return execFileSync("psql", [dbUrl, "-Atc", q], { encoding: "utf8" }).trim();
}
const revision = () =>
  Number(sql(`SELECT revision FROM public.beskt_method_versions WHERE id = '${versionId}'`));

async function as(email: string, fn: string, params: Record<string, unknown>): Promise<void> {
  if (!email.endsWith("@local.test")) throw new Error("only synthetic @local.test accounts");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const s = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (s.error) throw new Error(`${email}: ${s.error.message}`);
  const { error } = await db.rpc(fn, { _operation_id: crypto.randomUUID(), ...params });
  if (error) throw new Error(`${email} ${fn}: ${error.message}`);
  console.log(`  ${email.padEnd(40)} ${fn}`);
}

const GATES: Array<[string, string]> = [
  ["beskt-journey-reviewer1@local.test", "personnel_security"],
  ["beskt-journey-reviewer2@local.test", "senior_hr"],
  ["beskt-journey-reviewer3@local.test", "recruitment"],
  ["beskt-journey-reviewer4@local.test", "employment_privacy_legal"],
  ["beskt-journey-reviewer5@local.test", "data_protection"],
];

async function main(): Promise<void> {
  const status = sql(
    `SELECT content_status FROM public.beskt_method_versions WHERE id = '${versionId}'`,
  );
  if (status === "draft") {
    await as("beskt-journey-editor@local.test", "beskt_submit_for_review", {
      _method_version_id: versionId,
      _expected_revision: revision(),
    });
  }
  for (const [email, gate] of GATES) {
    await as(email, "beskt_record_review", {
      _method_version_id: versionId,
      _expected_revision: revision(),
      _gate: gate,
      _decision: "approved",
      _rationale: RATIONALE,
    });
  }
  await as("beskt-journey-publisher@local.test", "beskt_publish_version", {
    _method_version_id: versionId,
    _expected_revision: revision(),
    _reason: "SYNTETISK TESTPUBLICERING i lokal testmiljö.",
  });
  const employerId = sql(`SELECT id FROM public.employers WHERE slug = '${employerSlug}'`);
  const expires = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  await as("beskt-journey-admin@local.test", "bcp_grant_pilot", {
    _employer_id: employerId,
    _method_version_id: versionId,
    _source_reference: "SYNTETISKT pilotmedgivande för lokal testmiljö.",
    _expires_on: expires,
  });
  console.log(
    `published and admitted ${employerSlug} until ${expires}: ${sql(`SELECT content_status FROM public.beskt_method_versions WHERE id = '${versionId}'`)}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
