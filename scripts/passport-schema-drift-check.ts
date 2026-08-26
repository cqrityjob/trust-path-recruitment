// Security Passport — the read model must survive a database that has not
// caught up with the code.
//
// Run via `bun run passport-schema-drift:check`.
//
// ── THE REGRESSION ─────────────────────────────────────────────────────
//
// The pilot entitlement shipped its migration UNAPPLIED, deliberately and on
// instruction. The application deploys the moment `main` moves, so the code
// began calling `sp_market_access()` and selecting `pilot_state` against a
// production database that had neither. PostgREST failed every call.
//
// The damage was far wider than the pilot feature:
//
//   * /passport/information lost the work-country panel AND every credential
//     control, because both hung off one Promise.all with the market read;
//   * /passport rendered nothing but a loading line, because the same
//     Promise.all also carried the Passport snapshot itself.
//
// Holders with entirely intact records saw an empty product.
//
// ── WHY A GUARD AND NOT JUST A FIX ─────────────────────────────────────
//
// `release-parity-check --release` already predicted this, in these words:
// "Deploying this reproduces the job-publishing outage: the application asks
// the database for something that is not there." It was right, and it did not
// help, because it is a RELEASE gate and the deploy happens at MERGE.
//
// This runs in ordinary CI. It asserts the properties that make the
// deploy/migrate gap survivable rather than fatal:
//
//   1. the degraded answer is correct AND fails closed;
//   2. an optional read cannot take a load-bearing one down with it;
//   3. the type-level workaround that gap once needed stays deleted.
//
// ── HOSTED HAS SINCE CAUGHT UP, AND THIS STILL RUNS ────────────────────
//
// pilot_state and sp_market_access are applied; release parity reports zero
// unapplied migrations. That retires the TYPE workaround, not the guard.
// Shipping a migration ahead of its application is the normal workflow here,
// so the next feature sits in the same gap -- and 1 and 2 are what decide
// whether that is a quiet degradation or an empty product.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isMissingPilotLayer,
  resolveMarketAccess,
} from "../src/lib/security-passport/market-access";

const root = path.resolve(import.meta.dirname, "..");
const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** Source with comments stripped: a comment that NAMES a banned pattern in
 *  order to explain it must not fail the check it documents. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

console.log("passport-schema-drift-check\n");

/* ══════════════════════════════════════════════════════════════════════
   1. THE DEGRADED ANSWER IS CORRECT, AND FAILS CLOSED
   ══════════════════════════════════════════════════════════════════════ */
console.log("1 -- a database with no pilot layer degrades to the pre-pilot rule");
{
  // Sweden: publicly active. Must stay reachable with no pilot layer at all —
  // this is the case whose failure emptied the product.
  ck(
    "an ACTIVE pack is production even with no pilot layer",
    resolveMarketAccess({ packIsActive: true, rpcAccess: null, pilotLayerMissing: true }) ===
      "production",
  );

  // THE DIRECTION THAT MATTERS. Absent schema must never open a market.
  ck(
    "an INACTIVE pack is closed when the pilot layer is missing",
    resolveMarketAccess({ packIsActive: false, rpcAccess: null, pilotLayerMissing: true }) ===
      "closed",
  );
  ck(
    "and a stale 'pilot' answer cannot leak through the degraded branch",
    resolveMarketAccess({ packIsActive: false, rpcAccess: "pilot", pilotLayerMissing: true }) ===
      "closed",
  );

  // With the layer present the database's answer is passed through untouched.
  for (const a of ["production", "pilot"] as const) {
    ck(
      `with the pilot layer present, "${a}" is passed through`,
      resolveMarketAccess({
        packIsActive: a === "production",
        rpcAccess: a,
        pilotLayerMissing: false,
      }) === a,
    );
  }
  ck(
    "an unrecognised answer is closed, never assumed open",
    resolveMarketAccess({
      packIsActive: true,
      rpcAccess: "something-else",
      pilotLayerMissing: false,
    }) === "closed",
  );
  ck(
    "a null answer is closed",
    resolveMarketAccess({ packIsActive: true, rpcAccess: null, pilotLayerMissing: false }) ===
      "closed",
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2. ONLY A MISSING FUNCTION IS TOLERATED
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n2 -- every other failure still throws");
{
  ck("PostgREST's unknown-RPC code is recognised", isMissingPilotLayer({ code: "PGRST202" }));
  ck("Postgres' undefined-function code is recognised", isMissingPilotLayer({ code: "42883" }));

  // A permission error reported as "no pilot markets" would be a quiet lie
  // about the holder's own entitlement, and they could not tell.
  ck("a permission error is NOT tolerated", !isMissingPilotLayer({ code: "42501" }));
  ck("an undefined COLUMN is NOT tolerated", !isMissingPilotLayer({ code: "42703" }));
  ck("a connection failure is NOT tolerated", !isMissingPilotLayer({ code: "08006" }));
  ck("an error with no code is NOT tolerated", !isMissingPilotLayer({}));
  ck("null is NOT tolerated", !isMissingPilotLayer(null));

  // Matched on code, never on message text: the database speaks Swedish here.
  const src = read("src/lib/security-passport/market-access.ts");
  ck("the match is on error CODE, not on message text", !/\.message\b/.test(code(src)));
}

/* ══════════════════════════════════════════════════════════════════════
   3. THE READ MODEL ASKS FOR NOTHING UNCONDITIONALLY ABSENT
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n3 -- the market read model requests no column that may not exist");
{
  const src = code(read("src/lib/security-passport/credentials.functions.ts"));

  // Selecting a column PostgREST does not know fails the whole request, and
  // there is no error code to tolerate: the row never arrives. So the pack
  // read must not name pilot_state at all -- sp_market_access() owns the
  // decision and the client does not need the raw column.
  // EVERY market-pack read, not the first one. There are two in this file and
  // an .exec() matched only `listSelectableMarkets`, which never mentions
  // pilot_state -- so the assertion passed while the defect sat two hundred
  // lines below it. A guard that cannot fail is worse than no guard, because
  // it is believed.
  const packSelects = [...src.matchAll(/\.from\("sp_market_packs"\)\s*\.select\(([^)]*)\)/g)];
  ck("every market-pack read is found", packSelects.length >= 2);
  for (const [i, m] of packSelects.entries()) {
    ck(`market-pack read #${i + 1} does NOT select pilot_state`, !m[1].includes("pilot_state"));
  }

  // The types read MAY filter on pilot_state, but only on the branch that is
  // unreachable unless the RPC succeeded -- which proves the column exists.
  ck(
    "the pilot type filter is reachable only after a successful RPC",
    /access === "production"[\s\S]{0,200}pilot_state/.test(src),
  );

  // ── THE TYPE-LEVEL WORKAROUND MUST STAY GONE ─────────────────────
  //
  // While hosted was behind, these calls were routed through a cast so the
  // build survived a types.ts regenerated from a database that had never heard
  // of them. Hosted has caught up and the generated types describe them, so the
  // cast is now strictly harmful: it would hide a renamed function or a changed
  // argument from the compiler in exchange for nothing.
  //
  // Asserted rather than merely deleted, because dead compatibility code is
  // exactly the kind of thing that gets copied back the next time something is
  // "temporarily" ahead of hosted. The answer to that is runtime tolerance,
  // which is what the rest of this file guards.
  ck(
    "the pilot RPC is typed against the generated schema",
    /supabase\.rpc\(\s*"sp_market_access"/.test(src),
  );
  for (const dead of ["aheadOfHostedSchema", "pilotStateFilter"]) {
    ck(`the ${dead} type escape is gone from the read model`, !src.includes(dead));
    ck(
      `and gone from market-access.ts`,
      !code(read("src/lib/security-passport/market-access.ts")).includes(dead),
    );
  }

  ck(
    "the RPC failure is routed through the tolerance helper",
    /isMissingPilotLayer\(accessError\)/.test(src),
  );
  ck(
    "and a non-tolerated failure still throws",
    /!isMissingPilotLayer\(accessError\)\)\s*throw/.test(src),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4. AN OPTIONAL READ CANNOT TAKE A LOAD-BEARING ONE WITH IT
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n4 -- the catalogue is not load-bearing for the pages that show it");
{
  // This is what turned a feature-scoped failure into a blank product. The
  // assertion is structural: whatever else these routes do, the market read
  // must not sit inside the Promise.all that gates the page's own data.
  const routes: readonly { file: string; mustNotShareWith: string }[] = [
    {
      file: "src/routes/_authenticated.passport.index.tsx",
      mustNotShareWith: "load({ data: undefined })",
    },
    {
      file: "src/routes/_authenticated.passport.information.tsx",
      mustNotShareWith: "loadProfile({ data: undefined })",
    },
  ];

  for (const r of routes) {
    const src = code(read(r.file));
    const name = r.file.split("/").pop();

    for (const all of src.match(/Promise\.all\(\[[\s\S]*?\]\)/g) ?? []) {
      ck(
        `${name}: no Promise.all carries both the page's own read and the catalogue`,
        !(all.includes("loadAvailability") && all.includes(r.mustNotShareWith)),
      );
    }

    // And the market read has a catch of its own, so its failure is survivable
    // rather than merely relocated.
    ck(
      `${name}: the catalogue read has its own try/catch`,
      /try\s*\{[^}]*loadAvailability[\s\S]{0,400}?\}\s*catch/.test(src),
    );
  }
}

console.log(
  fails.length === 0
    ? `\npassport-schema-drift-check: all assertions passed.`
    : `\npassport-schema-drift-check FAILED (${fails.length}):\n  - ${fails.join("\n  - ")}`,
);
process.exit(fails.length === 0 ? 0 : 1);
