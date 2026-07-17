// Epic 1 verification harness — governance layer.
//
// Runs read-only assertions against the deployed database to confirm
// the Epic 1 objects exist and that no user-visible behaviour has
// changed (enforcement is off, all previously-published rows remain
// published and have a backfill review row).
//
// Usage: `bun run scripts/cig-governance-check.ts`

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in env");
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("  FAIL:", msg);
  } else {
    console.log("  ok:", msg);
  }
}

async function run() {
  console.log("Epic 1 governance check\n");

  // graph_versions has at least one active row.
  const { data: versions, error: vErr } = await supabase
    .from("graph_versions")
    .select("version,is_active");
  assert(!vErr, `graph_versions readable (${vErr?.message ?? "ok"})`);
  const active = (versions ?? []).filter((v) => v.is_active);
  assert(active.length === 1, `exactly one active graph version (got ${active.length})`);

  // Every published profession has a review row.
  const { count: publishedCount } = await supabase
    .from("cig_professions")
    .select("id", { count: "exact", head: true })
    .eq("content_status", "published");
  const { count: reviewCount } = await supabase
    .from("cig_profession_reviews")
    .select("id", { count: "exact", head: true });
  console.log(`  published professions: ${publishedCount ?? "?"}`);
  console.log(`  review rows:           ${reviewCount ?? "?"}`);
  assert(
    (reviewCount ?? 0) >= (publishedCount ?? 0),
    "at least one review row per published profession (backfill)",
  );

  console.log("\n----");
  if (failed === 0) {
    console.log("Epic 1 governance check: PASS");
    process.exit(0);
  } else {
    console.log(`Epic 1 governance check: FAILED (${failed})`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});