// Regression guard for the report route's contract routing.
//
// The release-blocking defect this covers: a v3.1 snapshot was cast to the
// v3.0 DiscoveryReport type and handed to the v3.0 renderer, which read
// `report.dna.axes` on an object with no `dna` and threw during render. The
// router surfaced that as the generic "This page didn't load".
//
// These checks run against a REAL snapshot built by the v3.1 engine — not a
// hand-written fixture — so they fail if the stored shape and the renderer's
// expectations ever drift apart again.

import { buildSnapshot } from "../src/lib/career-discovery/v31/snapshot";
import { CORE_ITEMS } from "../src/lib/career-discovery/v31/core-items";
import type { Answer } from "../src/lib/career-discovery/v31/scoring";
import { classifyStoredReport } from "../src/lib/career-discovery/active-report.classify";

let checks = 0;
let failures = 0;
function ok(cond: boolean, label: string) {
  checks += 1;
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

const AT = "2026-07-31T05:55:13.296Z";

// Every core item answered, mid-scale — a complete, ordinary run.
const answers: Answer[] = CORE_ITEMS.map((item) => ({
  itemId: item.id,
  optionId: item.options[Math.min(2, item.options.length - 1)].id,
}));

const snapshot = buildSnapshot({ answers, locale: "sv", completedAt: AT });
const stored = JSON.parse(JSON.stringify(snapshot)) as unknown;

// --- 1. Classification --------------------------------------------------

const v31 = classifyStoredReport("2026-scd-v3.1.0", stored);
ok(v31.contract === "v3.1", "1.1 a real v3.1 snapshot classifies as v3.1");

const mislabelled = classifyStoredReport("2026-scd-v3.0.0", stored);
ok(
  mislabelled.contract === "malformed",
  "1.2 a v3.1 payload declared as v3.0 is malformed, never routed to the v3.0 renderer",
);

const v30ish = classifyStoredReport("2026-scd-v3.0.0", { topAreas: [], dna: { axes: [] } });
ok(v30ish.contract === "v3.0", "1.3 a v3.0 payload still classifies as v3.0");

ok(
  classifyStoredReport("2027-scd-v9.9.9", stored).contract === "unsupported",
  "1.4 an unknown definition version is unsupported, not guessed",
);
ok(
  classifyStoredReport(null, stored).contract === "malformed",
  "1.5 a snapshot with no definition version is malformed",
);

// --- 2. Fields the v3.1 renderer reads ----------------------------------
//
// Mirrors V31ReportView exactly. If the snapshot stops carrying one of these,
// the renderer would show a blank section — so it fails here first.

const a = snapshot.outputA;
const b = snapshot.outputB;

ok(typeof snapshot.completedAt === "string", "2.1 completedAt is present for the report date");
ok(typeof b.leading?.name === "string" && b.leading.name.length > 0, "2.2 leading pattern name");
ok(Object.keys(b.headings ?? {}).length >= 7, "2.3 all seven section headings are stored");

for (const q of [
  "howYouWork",
  "givesEnergy",
  "takesEnergy",
  "superpower",
  "growthEdge",
  "whyTheseCareers",
  "whereItLeads",
]) {
  const text = (b.leading.answers as Record<string, string>)[q];
  ok(typeof text === "string" && text.length > 0, `2.4 leading story answer "${q}" is stored text`);
  ok(typeof b.headings[q] === "string", `2.5 heading "${q}" is stored text`);
}

ok(Array.isArray(b.supporting), "2.6 supporting patterns are an array");
ok(Array.isArray(a.areas) && a.areas.length > 0, "2.7 ranked career areas are stored");
ok(
  a.areas.every(
    (x) =>
      typeof x.id === "string" &&
      typeof x.name === "string" &&
      typeof x.description === "string" &&
      typeof x.rank === "number" &&
      Array.isArray(x.alignedWith),
  ),
  "2.8 every stored area carries id, name, description, rank and alignedWith",
);
ok(snapshot.professions?.available === false, "2.9 the professions layer declares its absence");
ok(typeof a.balanced === "boolean", "2.10 the balanced flag is stored");
ok(typeof a.areaEvidenceSufficient === "boolean", "2.11 the evidence-sufficiency flag is stored");

// --- 3. No live lookups needed ------------------------------------------
//
// The renderer must be able to display the report with no access to the
// current content modules. A stored report therefore carries text, not ids.

ok(
  b.areas.every((x) => typeof x.name === "string" && typeof x.description === "string"),
  "3.1 Output B area content is rendered text, not ids to look up",
);
ok(
  a.areas.every((x) => x.alignedWith.every((n) => !/^CID\d+$/.test(n))),
  "3.2 alignedWith holds dimension NAMES, so the report renders without the dimension module",
);

// --- 4. Locale is frozen at completion ----------------------------------

const en = buildSnapshot({ answers, locale: "en", completedAt: AT });
ok(en.outputB.locale === "en" && snapshot.outputB.locale === "sv", "4.1 locale is stored");
ok(
  en.outputB.leading.answers.howYouWork !== b.leading.answers.howYouWork,
  "4.2 the two locales genuinely store different report text",
);

// --- 5. Determinism — one completion, one report ------------------------

ok(
  JSON.stringify(buildSnapshot({ answers, locale: "sv", completedAt: AT })) ===
    JSON.stringify(snapshot),
  "5.1 re-running completion with the same answers yields an identical snapshot",
);

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-report-render-check: all ${checks} checks passed.`);