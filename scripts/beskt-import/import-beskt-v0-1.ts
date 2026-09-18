/**
 * Import BESKT v0.1 as a governed DRAFT, through the governed authoring RPCs,
 * signed in as an editor.
 *
 *   bun run scripts/beskt-import/import-beskt-v0-1.ts --method rekrytering [--synthetic] [--submit]
 *   bun run scripts/beskt-import/import-beskt-v0-1.ts --method sakerhet    [--synthetic]
 *   bun run scripts/beskt-import/import-beskt-v0-1.ts --method rekrytering --dry-run
 *
 * Environment:
 *   BESKT_SUPABASE_URL, BESKT_SUPABASE_ANON_KEY   the project to write to
 *   BESKT_EDITOR_EMAIL, BESKT_EDITOR_PASSWORD      the EDITOR signing in
 *   BESKT_IMPORT_HOSTED=yes                        required for a non-loopback URL
 *
 * What it does, and what it deliberately does not:
 *
 *   - Every row is written by beskt_create_method / beskt_create_method_version
 *     / beskt_author_* as the signed-in editor. The database attributes the
 *     authorship to that person; nothing is inserted around the governed path.
 *   - It ends at a DRAFT and prints the validator's own findings. It submits
 *     for review only with --submit. It never records a review, never
 *     publishes and never grants a pilot: those are five reviewers', a
 *     publisher's and a platform admin's decisions.
 *   - --synthetic marks everything as a synthetic test version (names,
 *     summary, lawful-basis text) and is refused against anything but
 *     loopback. Without it, the exposure profile's lawful-basis reference is
 *     left EMPTY: the validator then blocks submission until the owner's
 *     lawful-basis decision is recorded. It is never invented here.
 *   - --dry-run prints the plan and writes nothing.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ACTIVATION_REQUIREMENTS,
  ANCHORS,
  OBSERVATION_FIELDS,
  OCCURRENCE,
  PROMPTS,
  QUESTIONS,
  SECTIONS,
  SOURCE,
  SOURCE_VERSION,
  type Mode,
  type QuestionDef,
} from "../../src/lib/beskt/import/beskt-v0-1.content";
import { buildPlan, type MethodKey } from "../../src/lib/beskt/import/plan";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const methodKey = value("--method") as MethodKey | undefined;
if (methodKey !== "rekrytering" && methodKey !== "sakerhet") {
  console.error("--method rekrytering | sakerhet is required");
  process.exit(2);
}
const synthetic = flag("--synthetic");
const submit = flag("--submit");
const dryRun = flag("--dry-run");

const plan = buildPlan(methodKey, { synthetic });

console.log(`BESKT v0.1 import — method "${plan.method.slug}" (${plan.version.mode})`);
console.log(
  `  ${plan.profiles.length} exposure profile(s), ${plan.sections.length} sections, ` +
    `${plan.items.length} items, ${plan.rules.length} routing rules, ${plan.prompts.length} prompts, ` +
    `${plan.anchors.length} evidence anchors, ${plan.fields.length} observation fields, ` +
    `${plan.activation.length} activation requirement(s)`,
);
if (dryRun) {
  console.log("--dry-run: nothing written.");
  process.exit(0);
}

const url = process.env.BESKT_SUPABASE_URL ?? "";
const key = process.env.BESKT_SUPABASE_ANON_KEY ?? "";
const email = process.env.BESKT_EDITOR_EMAIL ?? "";
const password = process.env.BESKT_EDITOR_PASSWORD ?? "";
const loopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
if (!url || !key || !email || !password) {
  console.error(
    "BESKT_SUPABASE_URL, BESKT_SUPABASE_ANON_KEY, BESKT_EDITOR_EMAIL and BESKT_EDITOR_PASSWORD are required.",
  );
  process.exit(2);
}
if (synthetic && !loopback) {
  console.error("REFUSED: --synthetic writes test content and runs only against loopback.");
  process.exit(2);
}
if (!loopback && process.env.BESKT_IMPORT_HOSTED !== "yes") {
  console.error(
    "REFUSED: a non-loopback project needs BESKT_IMPORT_HOSTED=yes, set by the editor who is signing in.",
  );
  process.exit(2);
}

const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

async function rpc<T = Record<string, unknown>>(
  fn: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(fn, params);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function main(): Promise<void> {
  const signIn = await db.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`sign-in: ${signIn.error.message}`);
  console.log(`  signed in as ${email}`);

  const method = await rpc<{ pack_id: string }>("beskt_create_method", {
    _operation_id: crypto.randomUUID(),
    _slug: plan.method.slug,
    _name_sv: plan.method.nameSv,
    _purpose_sv: plan.method.purposeSv,
    _name_en: plan.method.nameEn,
  });
  const version = await rpc<{ method_version_id: string; revision: number }>(
    "beskt_create_method_version",
    {
      _operation_id: crypto.randomUUID(),
      _pack_id: method.pack_id,
      _mode: plan.version.mode,
      _source_reference: SOURCE,
      _source_document_version: SOURCE_VERSION,
      _content_provenance: "source_stated",
      _summary_sv: plan.version.summarySv,
      _summary_en: plan.version.summaryEn,
    },
  );
  const versionId = version.method_version_id;
  let revision = version.revision;
  console.log(`  draft ${versionId} created at revision ${revision}`);

  const author = async (fn: string, param: string, row: Record<string, unknown>) => {
    const r = await rpc<{ revision: number }>(fn, {
      _operation_id: crypto.randomUUID(),
      _method_version_id: versionId,
      _expected_revision: revision,
      [param]: row,
    });
    revision = r.revision;
  };

  for (const p of plan.profiles) await author("beskt_author_exposure_profile", "_profile", p);
  for (const s of plan.sections) await author("beskt_author_section", "_section", s);
  for (const i of plan.items) await author("beskt_author_item", "_item", i);
  for (const r of plan.rules) await author("beskt_author_routing_rule", "_rule", r);
  for (const p of plan.prompts) {
    const row = { ...p };
    if (row.evaluation_template_key) {
      // The Evaluation step IS the governed template, word for word.
      row.wording_sv = await rpc<string>("beskt_evaluation_template", {
        _key: row.evaluation_template_key,
        _locale: "sv",
      });
      row.wording_en = await rpc<string>("beskt_evaluation_template", {
        _key: row.evaluation_template_key,
        _locale: "en",
      });
    }
    await author("beskt_author_prompt", "_prompt", row);
  }
  for (const a of plan.anchors) await author("beskt_author_evidence_anchor", "_anchor", a);
  for (const f of plan.fields) await author("beskt_author_observation_field", "_field", f);
  for (const a of plan.activation)
    await author("beskt_author_activation_requirement", "_requirement", a);
  console.log(`  authored; the draft is at revision ${revision}`);

  const findings = await rpc<Array<{ code: string; severity: string; message: string }>>(
    "beskt_method_validate",
    { _method_version_id: versionId, _require_reviews: false },
  );
  const blocking = (findings ?? []).filter((f) => f.severity === "blocking");
  console.log(`  validator: ${blocking.length} blocking finding(s)`);
  for (const f of blocking) console.log(`    - ${f.code}: ${f.message}`);

  if (submit) {
    if (blocking.length > 0)
      throw new Error("not submitted: the validator still has blocking findings");
    await rpc("beskt_submit_for_review", {
      _operation_id: crypto.randomUUID(),
      _method_version_id: versionId,
      _expected_revision: revision,
    });
    console.log("  submitted for review — the five gates now decide");
  }
  console.log(`METHOD_VERSION_ID=${versionId}`);
}

// Kept visible for the report: which parts of the specification this run
// carries at all, by key, so a reader can check nothing silently dropped out.
export const IMPORTED = {
  QUESTIONS,
  PROMPTS,
  ANCHORS,
  OBSERVATION_FIELDS,
  ACTIVATION_REQUIREMENTS,
  SECTIONS,
  OCCURRENCE,
};
export type { Mode, QuestionDef };

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
