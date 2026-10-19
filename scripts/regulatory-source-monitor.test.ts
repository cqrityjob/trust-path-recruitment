// The regulatory source monitor against a local server and a throwaway
// migrations directory: what it reads as registered, what it calls drift, and
// what it refuses to write.
//
// Run: bun test scripts/regulatory-source-monitor.test.ts

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyMigration,
  check,
  missingTerms,
  normalise,
  registeredSources,
  run,
  splitStatements,
  type Source,
} from "./regulatory-source-monitor";

const ROOT = join(import.meta.dir, "..");

/* ------------------------------------------------------------------ */
/* The real registry                                                   */
/* ------------------------------------------------------------------ */

describe("the registry is every migration, replayed", () => {
  const sources = registeredSources(join(ROOT, "supabase/migrations"));
  const keys = sources.map((s) => s.sourceKey);

  test("reads the sources registered after the foundation seed", () => {
    // Registered by later migrations and missed while only the first seed
    // block was read.
    for (const k of [
      "ae_moi_private_security",
      "in_nqr_register",
      "in_ncvet_home",
      "in_mepsc_security_standards",
      "in_mha_psara",
    ]) {
      expect(keys).toContain(k);
    }
  });

  test("matches the thirty rows the migrations leave in sp_regulatory_sources", () => {
    expect(sources.length).toBe(30);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("a double hyphen inside a URL literal is not read as a comment", () => {
    const url = sources.find((s) => s.sourceKey === "se_imy_rattslig_grund")?.url;
    expect(url).toBe(
      "https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/arbetsliv/tillaten-behandling--vilka-krav-galler/rattslig-grund/",
    );
    for (const s of sources) expect(s.url).toMatch(/^https:\/\/\S+$/);
  });

  test("every relied-upon term names a registered source", () => {
    const relied = JSON.parse(
      readFileSync(join(ROOT, "supabase/regulatory-source-relied-terms.json"), "utf8"),
    ).terms as Record<string, string[]>;
    for (const k of Object.keys(relied)) expect(keys).toContain(k);
  });
});

describe("a later migration moves, supersedes or removes a source", () => {
  const seed = `
    INSERT INTO public.sp_regulatory_sources (source_key, url) SELECT v.k, v.u FROM (VALUES
      ('a_one', 'A', 'Title; with a semicolon', 'https://a.example/1', 'x'),
      ('a_two', 'A', 'It''s quoted', 'https://a.example/2', 'x')
    ) AS v(k, j, t, u, s)
    ON CONFLICT (source_key) DO NOTHING;`;
  const replay = (...later: string[]) => {
    const r = new Map<string, Source>();
    applyMigration(r, "001.sql", seed);
    later.forEach((sql, i) => applyMigration(r, `00${i + 2}.sql`, sql));
    return r;
  };

  test("a semicolon or doubled quote inside a literal does not split the statement", () => {
    expect(splitStatements(seed).filter((s) => s.trim()).length).toBe(1);
    expect([...replay().keys()]).toEqual(["a_one", "a_two"]);
  });

  test("UPDATE … SET url follows the move without editing the seed", () => {
    const r = replay(
      `UPDATE public.sp_regulatory_sources SET url = 'https://a.example/moved', checked_on = NULL WHERE source_key = 'a_one';`,
    );
    expect(r.get("a_one")?.url).toBe("https://a.example/moved");
    expect(r.get("a_one")?.migration).toBe("002.sql");
  });

  test("a superseded or deleted source is no longer checked", () => {
    const r = replay(
      `UPDATE public.sp_regulatory_sources SET superseded_on = DATE '2026-10-19' WHERE source_key = 'a_one';`,
      `DELETE FROM public.sp_regulatory_sources WHERE source_key = 'a_two';`,
    );
    expect(r.size).toBe(0);
  });

  test("a single-row SELECT insert is read; a re-insert under DO NOTHING keeps the first row", () => {
    const r = replay(
      `INSERT INTO public.sp_regulatory_sources (source_key, url) SELECT 'a_three', 'AE', NULL, a.id, 'T', 'https://a.example/3', 'x' FROM a;`,
      `INSERT INTO public.sp_regulatory_sources (source_key, url) VALUES ('a_one', 'A', 'T', 'https://elsewhere.example/', 'x') ON CONFLICT (source_key) DO NOTHING;`,
    );
    expect(r.get("a_three")?.url).toBe("https://a.example/3");
    expect(r.get("a_one")?.url).toBe("https://a.example/1");
  });

  test("an unrelated column update and comments mentioning the table change nothing", () => {
    const r = replay(
      `-- UPDATE public.sp_regulatory_sources SET url = 'https://no.example/' WHERE source_key = 'a_one';
       UPDATE public.sp_regulatory_sources SET market_pack_code = 'X' WHERE source_key = 'a_two';
       REVOKE INSERT, UPDATE, DELETE ON public.sp_regulatory_sources FROM authenticated;
       CREATE TRIGGER t BEFORE UPDATE ON public.sp_regulatory_sources FOR EACH ROW EXECUTE FUNCTION f();`,
    );
    expect(r.get("a_one")?.url).toBe("https://a.example/1");
  });

  test("an UPDATE that moves a URL must target exactly one source_key, or it fails", () => {
    const move = (where: string) =>
      replay(`UPDATE public.sp_regulatory_sources SET url = 'https://x.example/'${where};`);
    // No WHERE would move every source; OR, IN, AND and a joined FROM would
    // move a set the monitor cannot know. None may be silently half-applied.
    for (const where of [
      "",
      " WHERE source_key = 'a_one' OR source_key = 'a_two'",
      " WHERE source_key IN ('a_one', 'a_two')",
      " WHERE source_key = 'a_one' AND market_pack_code IS NULL",
      " FROM other o WHERE source_key = 'a_one'",
      " WHERE source_key = 'a_one' RETURNING id",
    ]) {
      expect(() => move(where), where).toThrow(/exactly one source_key/);
    }
    expect(() => replay(`UPDATE public.sp_regulatory_sources SET superseded_on = now();`)).toThrow(
      /exactly one source_key/,
    );
    expect(() =>
      replay(
        `UPDATE public.sp_regulatory_sources SET url = CASE WHEN true THEN 'https://x.example/' END WHERE source_key = 'a_one';`,
      ),
    ).toThrow(/single https literal/);
    // A sub-select in another column does not hide the URL move behind it.
    const r = replay(
      `UPDATE public.sp_regulatory_sources SET market_pack_code = (SELECT c FROM t WHERE k = 1), url = 'https://y.example/' WHERE source_key = 'a_one';`,
    );
    expect(r.get("a_one")?.url).toBe("https://y.example/");
    // The supported form still applies.
    expect(move(" WHERE source_key = 'a_two'").get("a_two")?.url).toBe("https://x.example/");
  });

  test("writes it cannot follow are hard errors, not a shorter run", () => {
    expect(() =>
      replay(
        `UPDATE public.sp_regulatory_sources SET url = 'https://x.example/' WHERE jurisdiction_code = 'A';`,
      ),
    ).toThrow(/exactly one source_key/);
    expect(() =>
      replay(
        `DO $$ BEGIN UPDATE public.sp_regulatory_sources SET url = 'https://x.example/' WHERE source_key = 'a_one'; END $$;`,
      ),
    ).toThrow(/cannot follow/);
    expect(() => replay(`INSERT INTO public.sp_regulatory_sources SELECT * FROM staging;`)).toThrow(
      /no row this parser can read/,
    );
    expect(() =>
      replay(
        `INSERT INTO public.sp_regulatory_sources (source_key, url) VALUES ('a_one', 'A', 'T', 'https://a.example/9', 'x');`,
      ),
    ).toThrow(/registered twice/);
  });
});

/* ------------------------------------------------------------------ */
/* Against a real HTTP server                                          */
/* ------------------------------------------------------------------ */

const page = (body: string) =>
  `<html><head><script>var nonce="${Math.random()}"</script></head><body><main>${body}</main></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let base = "";
const state = {
  stableBody: "Godkännande av personal hos bevakningsföretag. Väktare och skyddsvakt.",
};
const seen: { ua: string | null }[] = [];

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      seen.push({ ua: req.headers.get("user-agent") });
      if (path === "/stable")
        return new Response(page(state.stableBody), { headers: { "content-type": "text/html" } });
      if (path === "/") return new Response(page("Start"));
      if (path === "/forbidden") return new Response("no", { status: 403 });
      if (path === "/slow") {
        await Bun.sleep(1_000);
        return new Response(page("late"));
      }
      if (path === "/moved") return Response.redirect(`${base}/landing`, 301);
      if (path === "/landing") return new Response(page("Startsida"));
      return new Response("missing", { status: 404 });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));

describe("fetching", () => {
  test("a script nonce does not change the fingerprint; a word does", async () => {
    const a = await check({ url: `${base}/stable` });
    const b = await check({ url: `${base}/stable` });
    expect(a.availability).toBe("available");
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(normalise(page("x"))).toBe("x");
  });

  test("a refusal, a timeout and a dead host each say why", async () => {
    expect((await check({ url: `${base}/forbidden` })).reason).toBe("http_403");
    expect((await check({ url: `${base}/slow` }, fetch, 100)).reason).toBe("timeout");
    const dead = await check({ url: "http://127.0.0.1:1/" });
    expect(dead.availability).toBe("unreachable");
    expect(dead.reason).toStartWith("network:");
  });

  test("a timeout says whether the site itself answers", async () => {
    const root = fixtureRepo({ watched: `${base}/stable`, slowpage: `${base}/slow` }, null);
    await run({ root, update: false, timeoutMs: 300, log: () => {} });
    const report = readFileSync(join(root, "regulatory-source-report.md"), "utf8");
    // First run: no baseline, so the source is "new"; the reason still shows.
    expect(report).toContain("(timeout; site root: answers)");
  });

  test("relied-upon terms match through HTML entities; the fingerprint is unchanged by the decoding", async () => {
    const encoded = page(
      "Krav p&aring; r&auml;ttslig grund och konsekvensbed&#246;mning (&#xE5;tg&auml;rd)",
    );
    const r = await check(
      { url: "https://x.example/" },
      (async () =>
        new Response(encoded, {
          headers: { "content-type": "text/html" },
        })) as unknown as typeof fetch,
    );
    expect(r.availability).toBe("available");
    expect(missingTerms(r.text ?? "", ["rättslig grund", "konsekvensbedömning", "åtgärd"])).toEqual(
      [],
    );
    // The fingerprint still hashes the same normalisation as before, so an
    // accepted baseline does not turn into a false "changed".
    expect(r.fingerprint).toBe(
      new Bun.CryptoHasher("sha256").update(normalise(encoded)).digest("hex"),
    );
  });

  test("a redirect is recorded with where it landed", async () => {
    const r = await check({ url: `${base}/moved` });
    expect(r.availability).toBe("available");
    expect(r.finalUrl).toBe(`${base}/landing`);
  });

  test("it identifies itself and never poses as a browser", async () => {
    seen.length = 0;
    await check({ url: `${base}/stable` });
    expect(seen[0].ua).toStartWith("CQrityjob-regulatory-source-monitor/");
  });
});

/* ------------------------------------------------------------------ */
/* A whole run in a throwaway repository                               */
/* ------------------------------------------------------------------ */

function fixtureRepo(keys: Record<string, string>, baseline: Record<string, unknown> | null) {
  const root = mkdtempSync(join(tmpdir(), "reg-monitor-"));
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });
  // 20 filler sources keep the parser's floor honest; they all answer.
  const filler = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`filler_${i}`, `${base}/stable`]),
  );
  const all = { ...filler, ...keys };
  const rows = Object.entries(all)
    .map(([k, u]) => `('${k}', 'X', 'X', NULL, 'T', '${u}', 'x')`)
    .join(",\n");
  writeFileSync(
    join(root, "supabase/migrations/001_seed.sql"),
    `INSERT INTO public.sp_regulatory_sources (source_key, url) SELECT * FROM (VALUES\n${rows}\n) v ON CONFLICT (source_key) DO NOTHING;`,
  );
  writeFileSync(
    join(root, "supabase/regulatory-source-relied-terms.json"),
    JSON.stringify({ terms: { watched: ["godkännande av personal"] } }),
  );
  if (baseline)
    writeFileSync(join(root, "supabase/regulatory-source-baseline.json"), JSON.stringify(baseline));
  return root;
}

async function acceptedBaseline(keys: Record<string, string>) {
  const root = fixtureRepo(keys, null);
  expect(await run({ root, update: false, log: () => {} })).toBe(0); // first run establishes
  return JSON.parse(readFileSync(join(root, "supabase/regulatory-source-baseline.json"), "utf8"));
}

describe("a scheduled run reports and changes nothing", () => {
  const keys = () => ({ watched: `${base}/stable`, refusing: `${base}/forbidden` });

  test("an unchanged registry is a clean run, and the known refusal stays visible", async () => {
    const accepted = await acceptedBaseline(keys());
    const root = fixtureRepo(keys(), accepted);
    expect(await run({ root, update: false, log: () => {} })).toBe(0);
    const report = readFileSync(join(root, "regulatory-source-report.md"), "utf8");
    expect(report).toContain("## Known unreachable");
    expect(report).toContain("`refusing`");
    expect(report).toContain("(http_403)");
  });

  test("a real content change is drift, and the baseline is not touched", async () => {
    const accepted = await acceptedBaseline(keys());
    const root = fixtureRepo(keys(), accepted);
    const before = readFileSync(join(root, "supabase/regulatory-source-baseline.json"), "utf8");
    const original = state.stableBody;
    state.stableBody = "Bevakningsföretag. Väktare och skyddsvakt. Nya regler från 1 juli.";
    try {
      expect(await run({ root, update: false, log: () => {} })).toBe(1);
    } finally {
      state.stableBody = original;
    }
    const report = readFileSync(join(root, "regulatory-source-report.md"), "utf8");
    expect(report).toContain("## Changed since the last baseline");
    expect(report).toContain("## Relied-upon terms missing");
    expect(report).toContain("“godkännande av personal”");
    expect(readFileSync(join(root, "supabase/regulatory-source-baseline.json"), "utf8")).toBe(
      before,
    );
  });

  test("a source that newly fails is drift, with its reason", async () => {
    const accepted = await acceptedBaseline(keys());
    const root = fixtureRepo(
      { ...keys(), watched: `${base}/forbidden` },
      {
        ...accepted,
        sources: {
          ...accepted.sources,
          watched: { ...accepted.sources.watched, url: `${base}/forbidden` },
        },
      },
    );
    expect(await run({ root, update: false, log: () => {} })).toBe(1);
    const report = readFileSync(join(root, "regulatory-source-report.md"), "utf8");
    expect(report).toMatch(/## Newly unreachable\n\n- `watched` — \S+ \(http_403\)/);
  });

  test("a known limitation that answers once stays recorded until a human accepts it", async () => {
    const accepted = await acceptedBaseline(keys());
    const root = fixtureRepo(
      { ...keys(), refusing: `${base}/stable` },
      {
        ...accepted,
        sources: {
          ...accepted.sources,
          refusing: { ...accepted.sources.refusing, url: `${base}/stable` },
        },
      },
    );
    expect(await run({ root, update: false, log: () => {} })).toBe(1);
    const report = readFileSync(join(root, "regulatory-source-report.md"), "utf8");
    expect(report).toContain("## Reachable again");
    const baseline = JSON.parse(
      readFileSync(join(root, "supabase/regulatory-source-baseline.json"), "utf8"),
    );
    expect(baseline.sources.refusing.availability).toBe("unreachable");
  });

  test("a source registered after the baseline is reported and counts until accepted", async () => {
    const accepted = await acceptedBaseline(keys());
    const root = fixtureRepo({ ...keys(), later: `${base}/stable` }, accepted);
    expect(await run({ root, update: false, log: () => {} })).toBe(1);
    expect(readFileSync(join(root, "regulatory-source-report.md"), "utf8")).toContain("`later`");
  });
});

describe("the weekly workflow cannot accept a baseline or change a rule", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/regulatory-sources.yml"), "utf8");
  const commands = wf
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");

  test("it never passes --update, commits, pushes or touches the database", () => {
    expect(commands).not.toContain("--update");
    expect(commands).not.toMatch(/git\s+(commit|push)/);
    expect(commands).not.toMatch(/supabase\s+(db|migration)|psql|SUPABASE_SERVICE_ROLE/i);
  });

  test("it holds read-only contents permission", () => {
    expect(commands).toMatch(/permissions:\s*\n\s*contents:\s*read\s*\n\s*issues:\s*write/);
    expect(commands).not.toMatch(/contents:\s*write/);
  });
});
