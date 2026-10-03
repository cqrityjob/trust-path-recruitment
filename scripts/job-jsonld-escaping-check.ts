/**
 * Guard: employer-written ad text cannot break out of the page's JSON-LD
 * script element.
 *
 * Every public ad page puts a `JobPosting` JSON-LD block in its head from the
 * ad's own fields, and the router writes that string into the page as it is.
 * `JSON.stringify` leaves `<` alone, so a title such as
 * `x</script><img src=x onerror=…>` ended the script early and the rest ran as
 * page HTML for every visitor of the ad URL (stored XSS: any active member of
 * an approved organisation can publish). The block is now escaped; this
 * proves it with hostile input, that it still parses back to the same data,
 * and that no head script in the app is built from a bare JSON.stringify.
 *
 * Run: bun run job-jsonld-escaping:check
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  buildJobHeadMeta,
  buildJobPostingJsonLd,
  jsonLdScript,
} from "../src/lib/job-intelligence/seo";
import type { PublicJobSsrDetail } from "../src/lib/job-intelligence/public-queries.functions";

let failures = 0;
function ck(name: string, ok: boolean, detail?: unknown): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${String(detail)}`}`);
  if (!ok) failures += 1;
}

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const HOSTILE = `x</script><img src=x onerror=alert(document.domain)>&amp;${LS}${PS}"`;
const job = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "hostile",
  title_sv: HOSTILE,
  title_en: HOSTILE,
  description_sv: `<script>alert(1)</script>${HOSTILE}`,
  description_en: null,
  location_text: HOSTILE,
  city: HOSTILE,
  region: null,
  country: "SE",
  workplace_type: "onsite",
  employment_type: "full_time",
  published_at: "2026-10-01T00:00:00Z",
  expires_at: "2026-11-01T00:00:00Z",
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  employer: { name: HOSTILE, website: `https://e.example/?q=${HOSTILE}`, logo_url: null },
} as unknown as PublicJobSsrDetail;

console.log("the public ad head");
{
  const { scripts } = buildJobHeadMeta("hostile", job);
  const body = scripts[0]?.children ?? "";
  ck("an ld+json script is produced", scripts.length === 1 && scripts[0].type === "application/ld+json");
  ck("no `<` survives in the script body — nothing can close the element", !body.includes("<"), body.slice(0, 80));
  ck("no `>` or bare `&` survives either", !body.includes(">") && !/&(?!#)/.test(body));
  ck("no raw U+2028 / U+2029 survives", !(body.includes(LS) || body.includes(PS)));
  ck(
    "the escaped block still parses back to exactly the same data",
    JSON.stringify(JSON.parse(body)) === JSON.stringify(buildJobPostingJsonLd("hostile", job)),
  );
  ck(
    "the hostile title round-trips unchanged for a crawler",
    (JSON.parse(body) as { title: string }).title === HOSTILE,
  );
}

console.log("the helper");
{
  ck("jsonLdScript escapes < > &", jsonLdScript({ a: "<>&" }) === '{"a":"\\u003c\\u003e\\u0026"}');
}

console.log("no head script bypasses it");
{
  const ROOT = join(import.meta.dir, "..");
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  };
  const offenders: string[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // A head script whose body is a bare JSON.stringify, within three lines of an ld+json type.
      if (/children:\s*JSON\.stringify\(/.test(line)) {
        const near = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        if (/ld\+json/.test(near)) offenders.push(`${relative(ROOT, file)}:${i + 1}`);
      }
    });
  }
  ck("every ld+json head script is built with jsonLdScript()", offenders.length === 0, offenders.join(", "));
}

if (failures > 0) {
  console.error(`\njob-jsonld-escaping:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log("\njob-jsonld-escaping:check — ok");
