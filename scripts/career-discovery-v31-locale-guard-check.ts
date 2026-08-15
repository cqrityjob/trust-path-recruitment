// Regression guard for the Swedish-locale defect (Master Completion
// Mandate item 16): "frozen report sections were reading the live UI
// language rather than the report snapshot locale."
//
// ── WHY A STATIC CHECK, NOT A RENDERED-COMPONENT TEST ───────────────────
//
// This repository has no React component-testing framework (no vitest, no
// @testing-library, no jsdom) — every other *-check.ts script in this repo
// tests pure functions, not rendered DOM. Adding a whole new test framework
// to cover one regression is exactly the over-engineering the mandate's own
// anti-over-engineering list warns against for a single guard. Instead this
// asserts, by reading the actual source files, that the exact defect
// pattern cannot exist:
//
//   1. V31ReportView.tsx (the only place a ReportSnapshot's `locale` and
//      the live site-wide toggle both exist in the same scope) never wires
//      `lang` — the live toggle from useT() — into a child component's
//      `locale` prop. Frozen report content must follow `snapshot.locale`.
//   2. V31ReportView.tsx's `useT()` destructure never re-introduces `lang`
//      at all — its removal (with an explanatory comment) is itself part
//      of the fix; if `lang` comes back, so does the risk of it leaking
//      into a locale prop again.
//   3. The three components that render frozen content inside a locale
//      prop (ProfessionRecommendations, FeedbackForm, CareerCardCreator)
//      resolve their own internal microcopy via `translateFor(locale)` —
//      bound to the prop they were given — not `useT()`'s live-context `t`.
//
// This is deterministic and will fail loudly if the exact regression
// pattern is reintroduced by a future edit, in either direction (a
// component that starts reading `lang` again, or one that stops using
// `translateFor`).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function group(name: string): void {
  console.log(`\n${name}`);
}

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

// =========================================================================
group("1 · V31ReportView never wires the live language toggle into a locale prop");
// =========================================================================

const reportView = read("../src/components/career-discovery/v31/V31ReportView.tsx");

ok(
  !/locale=\{lang\b/.test(reportView),
  "1.1 no `locale={lang...}` anywhere in V31ReportView.tsx -- the exact defect pattern that let a Swedish snapshot render English professions/feedback/Career Card",
);
ok(
  /locale=\{snapshot\.locale\b/.test(reportView),
  "1.2 at least one locale prop is bound to snapshot.locale -- confirms the fix is actually wired, not just the bug's absence",
);
ok(
  !/const\s*\{\s*t,\s*lang\s*\}\s*=\s*useT\(\)/.test(reportView),
  "1.3 useT()'s destructure no longer pulls `lang` into scope -- removed so it cannot silently leak into a locale prop again",
);
ok(
  !/new Intl\.DateTimeFormat\(lang\b/.test(reportView),
  "1.4 the report date format also reads snapshot.locale, not the live toggle (the same bug in miniature)",
);

// =========================================================================
group("2 · Frozen-content components resolve their own microcopy from the locale PROP, not the live context");
// =========================================================================

const contentComponents: readonly { file: string; label: string }[] = [
  { file: "../src/components/career-discovery/v31/ProfessionRecommendations.tsx", label: "ProfessionRecommendations" },
  { file: "../src/components/career-discovery/v31/FeedbackForm.tsx", label: "FeedbackForm" },
  { file: "../src/components/career-discovery/v31/CareerCardCreator.tsx", label: "CareerCardCreator" },
];

for (const { file, label } of contentComponents) {
  const source = read(file);
  ok(
    /translateFor\(locale\)/.test(source),
    `2.${label} calls translateFor(locale) -- its own microcopy stays bound to the locale it was actually given`,
  );
  ok(
    !/const\s*\{\s*t\s*\}\s*=\s*useT\(\)/.test(source),
    `2.${label} does not destructure t from the live useT() context -- that was the second half of the original defect (correct content, but chrome/microcopy still following the live toggle)`,
  );
}

// =========================================================================
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-v31-locale-guard-check: all ${checks} checks passed.`);
