// The public test deployment and the Worker evidence job, asserted.
//
// Run: bun run og-public-test:check
//
// Three findings on the first version of .github/workflows/og-public-test.yml
// are what this guard exists for, and each is pinned so it cannot come back:
//
//   1. ISOLATION. A test build whose server was pointed at a stand-in while
//      the client still carried the real project's address and key (inlined at
//      build time from the tracked .env). Now: the build step sets the
//      synthetic address, key and ref for both tiers, the built output is
//      checked before any deploy, and the check itself is exercised here on
//      planted outputs (dummy values only) to prove it notices.
//   2. SHELL INJECTION. `${{ inputs.share }}` interpolated into a `run:` block
//      on a runner holding a Cloudflare credential. Now: no workflow expression
//      inside any run block, closed-choice inputs, and a validator that takes
//      its inputs from the environment only, is run here with hostile dummy
//      values (command substitutions, an unknown id) and must refuse them
//      without executing anything (a sentinel file must not appear).
//   3. UNRELIABLE EVIDENCE. A stand-in Worker that kept "revoked" in a module
//      Map, which is per isolate and gone on restart. Now: the public stand-in
//      is stateless, the fixtures are deterministic per id, and the workflow
//      has no state buttons; the shell allowlist equals the fixture ids.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_IDS, SYNTHETIC_SUPABASE_KEY, SYNTHETIC_SUPABASE_REF } from "./og-worker-fixture";

let assertions = 0;
const errors: string[] = [];
function expect(ok: boolean, message: string): void {
  assertions += 1;
  if (!ok) errors.push(message);
}

const PUBLIC = ".github/workflows/og-public-test.yml";
const EVIDENCE = ".github/workflows/og-worker-evidence.yml";
const VALIDATE = "scripts/og-public-test-validate.sh";
const STUB = "scripts/og-test-stub-worker.ts";
const ISOLATION = "scripts/og-build-isolation-check.ts";
const SHOTS = "scripts/og-worker-shots.ts";

/** The file without its full-line comments: what runs, not what is said. */
const code = (text: string) =>
  text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

const publicWf = readFileSync(PUBLIC, "utf8");
const evidenceWf = readFileSync(EVIDENCE, "utf8");
const validate = readFileSync(VALIDATE, "utf8");
const stub = readFileSync(STUB, "utf8");
const shots = readFileSync(SHOTS, "utf8");

/** Every `run:` block's shell text, by line scanning: a `run: |` block is the
 *  more-indented lines that follow; a one-line `run: x` is x. */
function runBlocks(yaml: string): string[] {
  const lines = yaml.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(\s*)run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    if (m[2] === "|" || m[2] === ">" || m[2] === "|-") {
      const body: string[] = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const l = lines[j];
        if (l.trim() === "") {
          body.push(l);
          continue;
        }
        const ind = l.length - l.trimStart().length;
        if (ind <= indent) break;
        body.push(l);
      }
      out.push(body.join("\n"));
    } else out.push(m[2]);
  }
  return out;
}

// ── 2. no expression reaches a shell ───────────────────────────────────
for (const [name, wf] of [
  ["og-public-test.yml", publicWf],
  ["og-worker-evidence.yml", evidenceWf],
] as const) {
  const blocks = runBlocks(wf);
  expect(blocks.length > 0, `${name}: run blocks were found`);
  for (const b of blocks) {
    expect(
      !b.includes("${{"),
      `${name}: no workflow expression inside a run block (found: ${b.trim().split("\n")[0].slice(0, 80)})`,
    );
  }
}
{
  // The raw inputs are referenced exactly where they may be: the job's name
  // and the validator's environment. Nothing else reads them.
  const refs = publicWf.match(/\$\{\{\s*inputs\.[a-z]+\s*\}\}/g) ?? [];
  expect(
    refs.length === 3,
    `the raw inputs are referenced only by the job name and the validator's env (found ${refs.length} references)`,
  );
  expect(
    /OG_ACTION: \$\{\{ inputs\.action \}\}/.test(publicWf) &&
      /OG_SHARE: \$\{\{ inputs\.share \}\}/.test(publicWf),
    "the inputs reach the validator through the environment",
  );
  expect(
    /id: inputs\s*\n\s*env:[\s\S]*?run: bash scripts\/og-public-test-validate\.sh/.test(publicWf),
    "the validator runs as its own step, before any credential is used",
  );
  const validateAt = publicWf.indexOf("og-public-test-validate.sh");
  const firstSecretAt = publicWf.indexOf("secrets.CLOUDFLARE_API_TOKEN");
  expect(
    validateAt > 0 && firstSecretAt > validateAt,
    "no step before the validator holds a Cloudflare credential",
  );
  expect(
    /if: steps\.inputs\.outputs\.action == 'deploy'/.test(publicWf) &&
      /if: steps\.inputs\.outputs\.action == 'teardown'/.test(publicWf),
    "later steps branch on the VALIDATED action",
  );
  expect(
    /SHARE: \$\{\{ steps\.inputs\.outputs\.share \}\}/.test(publicWf),
    "the smoke read takes the VALIDATED share, through the environment",
  );
  expect(/jq -n --arg/.test(publicWf), "JSON in the workflow is built with jq --arg");
  // Closed-choice inputs.
  const share = /share:\n(?:\s+.+\n)+?\s+type: (\w+)\n\s+options:\n((?:\s+- \S+\n)+)/.exec(
    publicWf,
  );
  expect(share?.[1] === "choice", "the share input is a closed choice, not free text");
  const options = (share?.[2] ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*- /, "").trim())
    .filter(Boolean);
  expect(
    options.length === FIXTURE_IDS.length && options.every((o) => FIXTURE_IDS.includes(o)),
    "the share choices are exactly the fixture ids",
  );
  const action = /action:\n(?:\s+.+\n)+?\s+type: (\w+)\n\s+options: \[([^\]]+)\]/.exec(publicWf);
  expect(
    action?.[1] === "choice" && action[2].replace(/\s/g, "") === "deploy,teardown",
    "the action input is a closed choice of deploy and teardown",
  );
}

// ── 2b. the validator refuses hostile values without executing them ────
{
  const allow = /ALLOWED_SHARES="([^"]+)"/.exec(validate)?.[1]?.split(/\s+/).filter(Boolean) ?? [];
  expect(
    allow.length === FIXTURE_IDS.length &&
      allow.every((a) => FIXTURE_IDS.includes(a)) &&
      FIXTURE_IDS.every((f) => allow.includes(f)),
    "the shell allowlist equals the fixture ids (no drift either way)",
  );
  expect(
    /ALLOWED_ACTIONS="deploy teardown"/.test(validate),
    "the shell allowlist of actions is deploy and teardown",
  );
  const validateCode = code(validate);
  expect(
    !/\becho\b.*\$(share|action|OG_)/.test(validateCode) &&
      !/\beval\b|\$\(\s*"?\$/.test(validateCode),
    "the validator never evaluates or echoes a raw input",
  );

  const dir = mkdtempSync(join(tmpdir(), "og-validate-"));
  const sentinel = join(dir, "executed");
  const run = (action: string, share: string) => {
    const r = spawnSync("bash", [VALIDATE], {
      env: {
        PATH: process.env.PATH ?? "",
        OG_ACTION: action,
        OG_SHARE: share,
        GITHUB_OUTPUT: join(dir, "out"),
      },
      encoding: "utf8",
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  try {
    const hostile = [
      `$(touch ${sentinel})`,
      "`touch " + sentinel + "`",
      `; touch ${sentinel}`,
      `AbCdEfGhIjKlMnOpQrStUvWx; touch ${sentinel}`,
      "AbCdEfGhIjKlMnOpQrStUvWy", // well-formed, unknown
      "",
      "AbCdEfGhIjKlMnOpQrStUvWx\n", // trailing newline
    ];
    for (const h of hostile) {
      const r = run("deploy", h);
      expect(
        r.status !== 0 && r.out.includes("REFUSED share"),
        `a hostile share value is refused (${JSON.stringify(h.replace(sentinel, "<sentinel>")).slice(0, 60)})`,
      );
    }
    for (const h of [`$(touch ${sentinel})`, "deploy; touch " + sentinel, "revoke", "Deploy", ""]) {
      const r = run(h, FIXTURE_IDS[0]);
      expect(
        r.status !== 0 && r.out.includes("REFUSED action"),
        `a hostile action value is refused (${JSON.stringify(h.replace(sentinel, "<sentinel>")).slice(0, 60)})`,
      );
    }
    expect(
      !existsSync(sentinel),
      "no hostile value was executed (the sentinel file does not exist)",
    );
    for (const id of FIXTURE_IDS) {
      expect(run("deploy", id).status === 0, `a known synthetic id is accepted (${id})`);
    }
    expect(run("teardown", FIXTURE_IDS[0]).status === 0, "teardown is accepted");
    const out = readFileSync(join(dir, "out"), "utf8");
    expect(
      /^action=deploy$/m.test(out) && /^share=AbCdEfGhIjKlMnOpQrStUvWx$/m.test(out),
      "the validated values are what later steps read",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 1. isolation: the build sets the synthetic project for both tiers ──
for (const [name, wf, url] of [
  ["og-public-test.yml", publicWf, "${{ env.STUB_URL }}"],
  ["og-worker-evidence.yml", evidenceWf, "http://127.0.0.1:54399"],
] as const) {
  const build = /- name: Build the application[\s\S]*?run: bun run build/.exec(wf)?.[0] ?? "";
  expect(build.length > 0, `${name}: the build step was found`);
  for (const v of ["VITE_SUPABASE_URL", "SUPABASE_URL"]) {
    expect(
      new RegExp(`\\n\\s+${v}: ${url.replace(/[${}.|]/g, "\\$&")}\\n`).test(build),
      `${name}: the build sets ${v} to the stand-in`,
    );
  }
  for (const v of ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"]) {
    expect(
      new RegExp(
        `\\n\\s+${v}: (\\$\\{\\{ env\\.SYNTHETIC_KEY \\}\\}|${SYNTHETIC_SUPABASE_KEY})\\n`,
      ).test(build),
      `${name}: the build sets ${v} to the synthetic key`,
    );
  }
  for (const v of ["VITE_SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_ID"]) {
    expect(
      new RegExp(
        `\\n\\s+${v}: (\\$\\{\\{ env\\.SYNTHETIC_REF \\}\\}|${SYNTHETIC_SUPABASE_REF})\\n`,
      ).test(build),
      `${name}: the build sets ${v} to the synthetic ref`,
    );
  }
  const buildAt = wf.indexOf("run: bun run build");
  const checkAt = wf.indexOf("run: bun run og-build-isolation:check");
  expect(checkAt > buildAt && buildAt > 0, `${name}: the isolation check runs after the build`);
  if (name === "og-public-test.yml") {
    const deployAt = wf.indexOf('deploy --name "$APP_WORKER"');
    expect(
      checkAt > 0 && deployAt > checkAt,
      "og-public-test.yml: no isolation check between build and deploy would let a real-project build deploy",
    );
    expect(
      /SYNTHETIC_KEY: sb_publishable_synthetic_test_only_not_a_key/.test(wf) &&
        /SYNTHETIC_REF: synthetictestrefzzzz/.test(wf),
      "the workflow's synthetic constants equal the fixture's",
    );
    expect(
      /--var "SUPABASE_PUBLISHABLE_KEY:\$\{SYNTHETIC_KEY\}"/.test(wf),
      "the deployed Worker's key is the synthetic one",
    );
  }
}
expect(
  /og-build-isolation:check/.test(evidenceWf),
  "og-worker-evidence.yml: the isolation check runs on every PR build",
);
expect(
  /page\.on\("request"/.test(shots) && /leftTheTestOrigin|off-origin|outside the test/.test(shots),
  "the browser evidence records every request and fails on one that leaves the test origin",
);

// ── 1b. the isolation check notices, on planted outputs (dummy values) ──
{
  const dir = mkdtempSync(join(tmpdir(), "og-isolation-"));
  try {
    const realKey = "sb_publishable_dummy_real_key_for_this_check_only";
    const realRef = "dummyrealrefaaaaaaaa";
    const realUrl = `https://${realRef}.supabase.co`;
    const synthUrl = "https://stub.example.workers.dev";
    const repo = join(dir, "repo");
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(
      join(repo, ".env"),
      `VITE_SUPABASE_PROJECT_ID=${realRef}\nVITE_SUPABASE_PUBLISHABLE_KEY=${realKey}\nVITE_SUPABASE_URL=${realUrl}\n`,
    );
    // One source literal, like the legacy gateway fallback.
    writeFileSync(join(repo, "src", "origin.ts"), `export const FALLBACK = "${realUrl}";\n`);
    const build = (client: string, server: string) => {
      const out = join(dir, "out");
      rmSync(out, { recursive: true, force: true });
      mkdirSync(join(out, "public", "assets"), { recursive: true });
      mkdirSync(join(out, "server"), { recursive: true });
      writeFileSync(join(out, "public", "assets", "app.js"), client);
      writeFileSync(join(out, "server", "index.mjs"), server);
      const r = spawnSync(
        "bun",
        ["run", ISOLATION, "--root", out, "--url", synthUrl, "--repo", repo],
        { encoding: "utf8" },
      );
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };
    const good = `createClient("${synthUrl}","${SYNTHETIC_SUPABASE_KEY}");const FALLBACK="${realUrl}";`;
    const clean = build(good, `const FALLBACK="${realUrl}";`);
    expect(
      clean.status === 0,
      `a clean synthetic build passes the isolation check (${clean.out.trim().split("\n").pop()})`,
    );
    const keyed = build(`${good}createClient("${synthUrl}","${realKey}");`, "x");
    expect(
      keyed.status !== 0 && keyed.out.includes("real publishable key"),
      "the isolation check notices the real key in the client",
    );
    const serverKeyed = build(good, `const k="${realKey}";`);
    expect(
      serverKeyed.status !== 0 && serverKeyed.out.includes("real publishable key"),
      "the isolation check notices the real key in the server bundle",
    );
    const inlined = build(
      `createClient("${realUrl}","${SYNTHETIC_SUPABASE_KEY}");const FALLBACK="${realUrl}";`,
      "x",
    );
    expect(
      inlined.status !== 0 && inlined.out.includes("inlined as configuration"),
      "the isolation check notices the real address inlined beside the fallback literal",
    );
    const ignored = build(
      `createClient("${realUrl}","x");const FALLBACK="${realUrl}";`.replace(
        `"${realUrl}","x"`,
        `"https://other.example","x"`,
      ),
      "x",
    );
    expect(
      ignored.status !== 0 && ignored.out.includes("override was not honoured"),
      "the isolation check notices a build that ignored the override",
    );
    expect(
      !keyed.out.includes(realKey) && !inlined.out.includes(realKey),
      "the isolation check never prints the key it searched for",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 3. the public stand-in is stateless; no state buttons remain ───────
{
  expect(
    !/new Map|states|__state|__calls|__reset|ADMIN_TOKEN|authorization/i.test(stub),
    "the public stand-in keeps state nowhere and has no admin path",
  );
  expect(
    /fixtureAnswer/.test(stub) && /rpcResponse/.test(stub),
    "the public stand-in answers from the shared deterministic fixtures",
  );
  expect(
    !/__state|OG_TEST_ADMIN_TOKEN|secret put|action == '(revoke|expire|error|restore)'|STATE=/.test(
      code(publicWf),
    ),
    "the public workflow has no state buttons and no admin secret",
  );
  const fixture = readFileSync("scripts/og-worker-fixture.ts", "utf8");
  expect(
    /REVOKED_ID/.test(fixture) && /EXPIRED_ID/.test(fixture) && /READ_ERROR_ID/.test(fixture),
    "the fixtures include an always-revoked, an always-expired and an always-failing id",
  );
  expect(
    /scripts\/og-worker-fixture\.ts/.test(publicWf) && /always answers the same way/.test(publicWf),
    "the workflow says what the fixtures prove and what they do not",
  );
}

if (errors.length > 0) {
  console.error(`og-public-test-workflow-check FAILED (${errors.length} of ${assertions}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`og-public-test-workflow-check: ${assertions} assertions passed`);
