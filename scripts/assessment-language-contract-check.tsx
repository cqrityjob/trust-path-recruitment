// Assessment language contract — the assigned language reaches the candidate.
//
// Run via `bun run assessment-language-contract:check`.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────
//
// The employer chooses Swedish or English when assigning a Väktare assessment
// and the choice is stored on assessment_assignments.language. The candidate
// runner never read it: it took the site toggle (localStorage "cqrityjob.lang",
// SSR default "sv"), so an English assignment opened in Swedish in a fresh
// browser, and the released report -- which freezes the ASSIGNED language into
// its context -- then named a language the run never used.
//
// ── THE CONTRACT ────────────────────────────────────────────────────────
//
//   ASSIGNED = INITIAL RUNNER = ACTUAL DELIVERY = REPORT CONTEXT
//
// Enforced by three pieces, each asserted below:
//   1. resolveAttemptLanguage() -- the assignment wins; the site language is
//      only the fallback for an attempt whose assignment states none (T1–T3
//      RUN it).
//   2. LanguageScope -- the whole run renders under the resolved language,
//      whatever the site provider says (T3 RENDERS it: a scoped subtree under
//      a provider that starts at "sv" comes out in English).
//   3. the runner reads the language from getAcademyAttemptState, which reads
//      it from the assignment row, and every item/block load and every shell
//      inside the run carries that language -- and the report panel names the
//      same value (T5, read from source).
//
// T4 -- same item identities and scoring in both languages -- is a database
// fact and is proven by supabase/tests/scp_language_contract_test.sql. It is
// not repeated here.
//
// This file makes no claim about psychometric equivalence of the two texts;
// the en-GB Väktare texts are recorded as adaptation_reviewed since PR-V3 (a content
// review, not SME approval) and the language review requirement stays outstanding.

import { readFileSync } from "node:fs";
import React from "react";
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider, LanguageScope, useT } from "../src/i18n/context";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  normaliseAssignedLanguage,
  resolveAttemptLanguage,
} from "../src/lib/security-competency/attempt-language";

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const RUNNER = "src/routes/_authenticated.academy.$attemptId.tsx";
const DELIVERY = "src/lib/security-competency/academy-delivery.functions.ts";
const SHELL = "src/components/career-discovery/v31/shell/AssessmentShell.tsx";
const CONTEXT = "src/i18n/context.tsx";
const REPORT_PANEL = "src/components/academy/ReportContextPanel.tsx";

// ═══════════════════════════════════════════════════════════════════════
console.log("\nT1–T3. The resolver: assignment first, site preference only as fallback");
{
  // A fresh browser: nothing stored, the site provider starts at "sv".
  const FRESH_BROWSER_SITE_LANG = "sv" as const;
  check(
    "T1 EN assignment + fresh browser → EN",
    resolveAttemptLanguage("en", FRESH_BROWSER_SITE_LANG) === "en",
  );
  check(
    "T2 SV assignment + fresh browser → SV",
    resolveAttemptLanguage("sv", FRESH_BROWSER_SITE_LANG) === "sv",
  );
  check(
    "T3a a stored EN site preference does not override an SV assignment",
    resolveAttemptLanguage("sv", "en") === "sv",
  );
  check(
    "T3b a stored SV site preference does not override an EN assignment",
    resolveAttemptLanguage("en", "sv") === "en",
  );
  check(
    "T3c an assignment with no language falls back to the site preference (sv)",
    resolveAttemptLanguage(null, "sv") === "sv",
  );
  check(
    "T3d an assignment with no language falls back to the site preference (en)",
    resolveAttemptLanguage(null, "en") === "en",
  );
  check(
    "T3e anything but 'sv' | 'en' from the wire is treated as not stated",
    normaliseAssignedLanguage("sv") === "sv" &&
      normaliseAssignedLanguage("en") === "en" &&
      normaliseAssignedLanguage("en-GB") === null &&
      normaliseAssignedLanguage(undefined) === null &&
      normaliseAssignedLanguage(null) === null &&
      normaliseAssignedLanguage(42) === null,
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nT3 (rendered). A scoped run ignores the site provider's language");
{
  function Probe() {
    const { t, tp, lang } = useT();
    return (
      <p>
        [{lang}] {t("academy.intro.title")} — {t("academy.language.deliveredIn")}{" "}
        {t(`academy.language.name.${lang}`)} — 5 {tp("academy.intro.parts", 5)} · 1{" "}
        {tp("academy.intro.tasks", 1)}
      </p>
    );
  }
  // The provider starts at "sv" on the server — the fresh-browser case.
  const scopedEn = text(
    renderToStaticMarkup(
      <I18nProvider>
        <LanguageScope lang="en">
          <Probe />
        </LanguageScope>
      </I18nProvider>,
    ),
  );
  const scopedSv = text(
    renderToStaticMarkup(
      <I18nProvider>
        <LanguageScope lang="sv">
          <Probe />
        </LanguageScope>
      </I18nProvider>,
    ),
  );
  const unscoped = text(
    renderToStaticMarkup(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    ),
  );
  check(
    "T3f under a Swedish site provider, an EN-scoped run renders English copy",
    scopedEn.includes("[en]") &&
      scopedEn.includes(en["academy.intro.title"]) &&
      scopedEn.includes(en["academy.language.deliveredIn"]) &&
      scopedEn.includes("English"),
    scopedEn,
  );
  check(
    "T3g an SV-scoped run renders Swedish copy",
    scopedSv.includes("[sv]") &&
      scopedSv.includes(sv["academy.intro.title"]) &&
      scopedSv.includes("Svenska"),
    scopedSv,
  );
  check(
    "T3h the unscoped provider itself is still Swedish (the fallback is real)",
    unscoped.includes("[sv]") && unscoped.includes(sv["academy.intro.title"]),
    unscoped,
  );
  check(
    "T3i plural forms follow the scope: 'parts' / 'task' in English",
    scopedEn.includes("5 parts") && scopedEn.includes("1 task") && !scopedEn.includes("1 tasks"),
    scopedEn,
  );
  check(
    "T3j plural forms follow the scope: 'delar' / 'uppgift' in Swedish",
    scopedSv.includes("5 delar") &&
      scopedSv.includes("1 uppgift") &&
      !scopedSv.includes("1 uppgifter"),
    scopedSv,
  );
  const html = renderToStaticMarkup(
    <I18nProvider>
      <LanguageScope lang="en">
        <Probe />
      </LanguageScope>
    </I18nProvider>,
  );
  check(
    'T3k the scoped subtree carries lang="en" for assistive technology',
    /<div lang="en"/.test(html),
    html,
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nContract wiring: the runner reads the assignment, not the toggle");
{
  const runner = stripComments(read(RUNNER));
  const delivery = stripComments(read(DELIVERY));
  const ctx = stripComments(read(CONTEXT));
  const shell = stripComments(read(SHELL));

  check(
    "W1 the runner no longer derives the run language from the site toggle",
    !/uiLang/.test(runner) && !/lang\s*=\s*uiLang/.test(runner),
  );
  check(
    "W2 the route resolves the language through resolveAttemptLanguage(...)",
    /resolveAttemptLanguage\(\s*resolved\.state\?\.language\s*\?\?\s*null,\s*siteLang\s*\)/.test(
      runner,
    ),
  );
  check(
    "W3 the language is resolved BEFORE items and blocks are loaded",
    runner.indexOf("<LanguageScope lang={deliveryLang}>") <
      runner.indexOf("function AcademyAttemptRunner("),
  );
  check(
    "W4 the whole run renders inside LanguageScope",
    /<LanguageScope lang=\{deliveryLang\}>\s*<AcademyAttemptRunner/.test(runner),
  );
  check(
    "W5 items and blocks are loaded under the scoped language",
    /loadItems\(\{ data: \{ attemptId, locale: lang \} \}\)/.test(runner) &&
      /loadBlocks\(\{ data: \{ attemptId, locale: lang \} \}\)/.test(runner),
  );
  const shellsInRunner =
    runner
      .slice(runner.indexOf("function AcademyAttemptRunner("))
      .match(/<AssessmentShell\b[^>]*>/g) ?? [];
  check(
    "W6 every shell inside the run shows the delivery language, not the toggle",
    shellsInRunner.length >= 8 && shellsInRunner.every((s) => /deliveryLanguage=\{lang\}/.test(s)),
    shellsInRunner.join(" | "),
  );
  check(
    "W7 getAcademyAttemptState reads the assignment's language under the candidate's own RLS",
    /from\("scp_attempts"\)/.test(delivery) &&
      /assessment_assignments\(language\)/.test(delivery) &&
      /normaliseAssignedLanguage\(/.test(delivery),
  );
  check(
    "W8 the server maps sv → sv-SE and en → en-GB for scp_get_attempt_items",
    /LANGUAGE = \{ sv: "sv-SE", en: "en-GB" \}/.test(delivery) &&
      /_language: LANGUAGE\[data\.locale\]/.test(delivery),
  );
  check(
    "W9 LanguageScope is a fixed-locale provider that does not read the toggle",
    /export function LanguageScope\(/.test(ctx) &&
      /dictionaries\[lang\]\[key\]/.test(ctx.slice(ctx.indexOf("export function LanguageScope("))),
  );
  check(
    "W10 the shell offers no language switcher when a delivery language is set",
    /deliveryLanguage \? \(/.test(shell) && /\) : \(\s*<LanguageSwitcher \/>/.test(shell),
  );
  check(
    "W11 the switcher is untouched for the public Career Discovery run (no prop → switcher)",
    /deliveryLanguage\?: Lang;/.test(shell),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nT5. The report names the same value the run was delivered under");
{
  const panel = stripComments(read(REPORT_PANEL));
  check(
    "T5a the employer report renders context.language through the language names",
    /c\.language === "sv"/.test(panel) &&
      /academy\.language\.name\.sv/.test(panel) &&
      /academy\.language\.name\.en/.test(panel),
  );
  // The value the report freezes is assessment_assignments.language (see
  // scp_release_attempt_report: SELECT aa.language ... INTO _lang). The
  // runner now delivers under that same column, so the two cannot disagree.
  const release = read(
    "supabase/migrations/20260830093000_scp_candidate_brief_and_interview_guide.sql",
  );
  check(
    "T5b scp_release_attempt_report freezes assessment_assignments.language into the context",
    /SELECT aa\.language,[\s\S]{0,200}FROM public\.assessment_assignments aa WHERE aa\.id = _a\.assignment_id/.test(
      release,
    ) && /'language', _lang/.test(release),
  );
  for (const k of [
    "academy.language.name.sv",
    "academy.language.name.en",
    "academy.language.deliveredIn",
    "academy.language.lockedNote",
    "academy.report.language",
  ]) {
    check(`T5c ${k} exists in both languages`, Boolean(sv[k]) && Boolean(en[k]) && sv[k] !== en[k]);
  }
  check(
    "T5d the locked note says the employer chose the language and it cannot be switched mid-run",
    /arbetsgivaren/i.test(sv["academy.language.lockedNote"]) &&
      /inte bytas/i.test(sv["academy.language.lockedNote"]) &&
      /employer/i.test(en["academy.language.lockedNote"]) &&
      /cannot be changed/i.test(en["academy.language.lockedNote"]),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nT6 (rendered). The run's header states the language and offers no switch");
{
  // AssessmentShell renders a TanStack Link, which is empty under
  // renderToStaticMarkup without a router. Mocked to a plain anchor so the
  // header can be read as markup -- the same pattern the other render guards
  // in this directory use.
  await mock.module("@tanstack/react-router", () => ({
    Link: ({ to, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement("a", { href: String(to ?? ""), ...rest }, children),
    createFileRoute: () => () => ({}),
  }));
  const { AssessmentShell: Shell } =
    await import("../src/components/career-discovery/v31/shell/AssessmentShell");

  const shellHtml = (deliveryLanguage?: "sv" | "en") =>
    renderToStaticMarkup(
      <I18nProvider>
        <LanguageScope lang={deliveryLanguage ?? "sv"}>
          <Shell deliveryLanguage={deliveryLanguage}>
            <p>run</p>
          </Shell>
        </LanguageScope>
      </I18nProvider>,
    );

  const enRun = shellHtml("en");
  const svRun = shellHtml("sv");
  const publicRun = shellHtml(undefined);

  check(
    "T6a an English run names its language in the header",
    enRun.includes(en["academy.language.name.en"]),
    enRun.slice(0, 400),
  );
  check(
    "T6b a Swedish run names its language in the header",
    svRun.includes(sv["academy.language.name.sv"]),
  );
  check(
    "T6c the run offers NO language switch (a toggle that changed nothing would be worse than none)",
    !new RegExp(`aria-label="${sv["lang.switch"]}"`).test(svRun) &&
      !new RegExp(`aria-label="${en["lang.switch"]}"`).test(enRun) &&
      !/aria-pressed=/.test(enRun),
  );
  check(
    "T6d the badge carries a full sentence for assistive technology, not two letters",
    /sr-only/.test(enRun) && enRun.includes(en["academy.language.deliveredIn"]),
  );
  check(
    "T6e the public Career Discovery run keeps its switcher untouched",
    new RegExp(`aria-label="${sv["lang.switch"]}"`).test(publicRun) &&
      /aria-pressed=/.test(publicRun),
  );
  // Touch target and layout properties of the header control, read from the
  // markup rather than asserted about a screenshot.
  check(
    "T6f the badge is a shrink-0 pill that cannot collapse at 320px",
    /rounded-full border border-border[^"]*px-3/.test(enRun) && /h-8/.test(enRun),
  );
}

console.log("");
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} language-contract assertion(s) failed, ${passed} passed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`ok: ${passed} language-contract assertions passed`);
