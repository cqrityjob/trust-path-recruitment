/**
 * Negative controls for the JSON-LD escaping guard.
 *
 * Planted: the escaping removed from the ad page's head script, `<` no longer
 * escaped, and the homepage building its script from a bare JSON.stringify.
 *
 * Run: bun run negative-controls:job-jsonld-escaping
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "job-jsonld-escaping:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "JL-NC-AD-NOT-ESCAPED",
    defect: "the ad page's JSON-LD is written with a bare JSON.stringify again",
    file: "src/lib/job-intelligence/seo.ts",
    find: "        children: jsonLdScript(buildJobPostingJsonLd(slug, job)),",
    replace: "        children: JSON.stringify(buildJobPostingJsonLd(slug, job)),",
    guard: GUARD,
    expect: "no `<` survives in the script body",
  },
  {
    id: "JL-NC-LT-NOT-ESCAPED",
    defect: "the helper stops escaping `<`, so a hostile title closes the script element",
    file: "src/lib/job-intelligence/seo.ts",
    find: '    .replace(/</g, "\\\\u003c")\n',
    replace: "",
    guard: GUARD,
    expect: "no `<` survives in the script body",
  },
  {
    id: "JL-NC-HOME-BYPASS",
    defect: "the homepage builds its JSON-LD from a bare JSON.stringify",
    file: "src/routes/index.tsx",
    find: "        children: jsonLdScript({",
    replace: "        children: JSON.stringify({",
    guard: GUARD,
    expect: "every ld+json head script is built with jsonLdScript()",
  },
];

runControls("job-jsonld-escaping", MUTATIONS);
