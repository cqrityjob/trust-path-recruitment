// "Utforska nu" on the Career Discovery recommendation — regression guard.
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// The recommendation card ("Din rekommenderade yrkesinriktning") carried an
// accent chip reading "Utforska nu" next to the occupation's name. It was a
// <span>: the product's most prominent call to action, on its most
// important result, did nothing when pressed. Owner report, with a
// screenshot of the Polis card: "Utforska nu knappen behöver länkas till
// sida med information. Nu funkar den inte. Den är inte klickbar."
//
// ── WHAT IS ASSERTED ───────────────────────────────────────────────────
//
//  1. The resolver (exploreDestinationFor) gives EVERY approved first-wave
//     profession a destination, deterministically, and that destination is
//     either a PUBLISHED Career Center guide or the card's own details
//     panel — never an unpublished guide's "not published yet" state and
//     never the /jobs/profession page (gated behind VITE_JOBS_ENABLED and
//     carrying no occupation information; see profession-links.ts).
//  2. Rendered: for all fourteen professions, in Swedish and English, as
//     the primary card and as an alternative card, the explore control is a
//     real anchor or a real button — focusable, 44px tall, named for the
//     occupation — and the old inert <span>Utforska nu</span> is gone.
//  3. An anchor's href points at a guide that clears the publishability
//     rule, and the route file that serves it exists.
//  4. A button controls a panel that exists in the markup, and is used ONLY
//     when no guide is published (the last resort is not taken early).
//  5. Polis specifically — the card in the owner's screenshot — has a
//     working destination.
//
// Fixtures are the real first-wave catalogue mirror, not a hand-authored
// list, so a newly approved profession is covered the day it is added.
//
// Run: bun run career-discovery-explore-link:check

import { existsSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";
import type {
  ProfessionCatalogEntry,
  ProfessionStage,
  RankedProfession,
} from "../src/lib/career-discovery/v31/professions";
import { STAGE_LABEL } from "../src/lib/career-discovery/v31/profession-explanations";
import { dictionaries } from "../src/i18n/dictionaries";
import { getPublishedProfession } from "../src/lib/career-center/publishability";
import {
  careerCenterProfessionSlug,
  exploreDestinationFor,
} from "../src/lib/career-center/profession-links";

// <Link> throws outside a RouterProvider. Under renderToStaticMarkup it is
// replaced with a plain anchor carrying the resolved href, so the href is
// what gets asserted. Everything else the module exports is kept.
const actualRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  Link: ({
    to,
    params,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    return React.createElement("a", { href, ...rest }, children);
  },
}));

const { I18nProvider } = await import("../src/i18n/context");
const { RecommendedProfessions } =
  await import("../src/components/career-discovery/v31/RecommendedProfessions");

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

type Locale = "sv" | "en";
const LOCALES: readonly Locale[] = ["sv", "en"];
const dict = { sv: dictionaries.sv, en: dictionaries.en } as Record<Locale, Record<string, string>>;

const APPROVED = FIRST_WAVE_CATALOG.filter((p) => p.professionId <= "SP014");

function rankedEntry(
  p: ProfessionCatalogEntry,
  rank: number,
  stage: ProfessionStage,
): RankedProfession {
  return {
    rank,
    confidence: rank === 1 ? "strong" : "indicative",
    match: {
      professionId: p.professionId,
      cigProfessionSlug: p.cigProfessionSlug,
      careerAreaId: p.careerAreaId,
      titleSv: p.titleSv,
      titleEn: p.titleEn,
      fitTier: "moderate",
      stage,
      regulated: p.regulated,
      inclusionRationaleSv: p.inclusionRationaleSv,
      inclusionRationaleEn: p.inclusionRationaleEn,
      limitationNoteSv: p.limitationNoteSv,
      limitationNoteEn: p.limitationNoteEn,
      alignedDimensions: [],
      coverage: 0,
      contextCorroborated: false,
    },
  };
}

function render(ranked: readonly RankedProfession[], locale: Locale): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <RecommendedProfessions ranked={ranked} locale={locale} />
    </I18nProvider>,
  );
}

/** The explore control for one profession, parsed out of the markup. */
function exploreControl(html: string, professionId: string) {
  const re = new RegExp(`<(a|button|span)\\b([^>]*)data-explore-link="${professionId}"([^>]*)>`);
  const m = re.exec(html);
  if (!m) return null;
  const attrs = `${m[2]}${m[3]}`;
  const attr = (name: string): string | null => {
    const a = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
    return a ? a[1] : null;
  };
  return {
    tag: m[1],
    href: attr("href"),
    ariaLabel: attr("aria-label"),
    ariaExpanded: attr("aria-expanded"),
    ariaControls: attr("aria-controls"),
    kind: attr("data-explore-kind"),
    className: attr("class") ?? "",
    type: attr("type"),
  };
}

const ROUTE_FILE = path.resolve(import.meta.dir, "../src/routes/career-center.$profession.tsx");

// =========================================================================
group("0 · Fixture premise");
// =========================================================================
ck(
  "0.1 the first-wave catalogue mirror carries the 14 approved professions",
  APPROVED.length === 14,
);
ck(
  "0.2 Polis (SP005) is among them",
  APPROVED.some((p) => p.professionId === "SP005"),
);
ck("0.3 the Career Center guide route exists on disk", existsSync(ROUTE_FILE), ROUTE_FILE);

// =========================================================================
group("1 · One deterministic destination per approved profession");
// =========================================================================
const table: string[] = [];
for (const p of APPROVED) {
  const dest = exploreDestinationFor(p);
  const again = exploreDestinationFor(p);
  ck(
    `1.1 ${p.professionId} ${p.titleSv}: resolves deterministically`,
    JSON.stringify(dest) === JSON.stringify(again),
  );
  if (dest.kind === "career_center") {
    const guide = getPublishedProfession(dest.slug);
    ck(`1.2 ${p.professionId}: /career-center/${dest.slug} is a PUBLISHED guide`, Boolean(guide));
    ck(
      `1.3 ${p.professionId}: href matches the route`,
      dest.href === `/career-center/${dest.slug}`,
    );
    table.push(`${p.professionId}  ${p.titleSv.padEnd(26)} -> guide   /career-center/${dest.slug}`);
  } else {
    // The last resort is taken only when no published guide exists for the
    // profession's CIG slug — the same rule every other link out of the
    // report follows.
    ck(
      `1.4 ${p.professionId}: the in-card panel is used only because no guide is published`,
      careerCenterProfessionSlug(p.cigProfessionSlug) === null,
    );
    ck(
      `1.5 ${p.professionId}: the panel has a CIG slug to read live content for`,
      dest.cigSlug === p.cigProfessionSlug && dest.cigSlug !== null,
    );
    table.push(`${p.professionId}  ${p.titleSv.padEnd(26)} -> panel   CIG:${dest.cigSlug}`);
  }
}
console.log("\n  Destination table:\n  " + table.join("\n  "));

// The jobs page is never a destination: it is gated behind VITE_JOBS_ENABLED
// and renders no occupation information (see profession-links.ts).
ck(
  "1.6 no destination is the /jobs/profession page",
  APPROVED.every((p) => {
    const d = exploreDestinationFor(p);
    return d.kind !== "career_center" || !d.href.startsWith("/jobs");
  }),
);
// Unpublished placeholders (Polis, SOC-analytiker, Säkerhetsutredare) must
// never be linked into the "not published yet" state.
for (const cig of ["polis", "soc-analytiker", "sakerhetsutredare"]) {
  const d = exploreDestinationFor({ cigProfessionSlug: cig });
  ck(`1.7 ${cig}: an unpublished guide is never the destination`, d.kind === "inline_details");
}
ck(
  "1.8 a published guide wins over the panel (vaktare -> security-officer)",
  (() => {
    const d = exploreDestinationFor({ cigProfessionSlug: "vaktare" });
    return d.kind === "career_center" && d.slug === "security-officer";
  })(),
);

// =========================================================================
group("2 · Rendered: every card's explore control is real, in both locales");
// =========================================================================
const STAGES: readonly ProfessionStage[] = [
  "explore_now",
  "possible_next_step",
  "longer_term",
  "career_pivot",
];

for (const locale of LOCALES) {
  const exploreCareer = dict[locale]["careerDiscovery.report.v31.exploreCareer"];
  for (const p of APPROVED) {
    const title = locale === "sv" ? p.titleSv : p.titleEn;
    const dest = exploreDestinationFor(p);
    for (const stage of STAGES) {
      // Rendered as the primary card AND as an alternative card, since the
      // two branches of RecommendationCard differ.
      const others = APPROVED.filter((o) => o.professionId !== p.professionId).slice(0, 2);
      const variants = {
        primary: render(
          [
            rankedEntry(p, 1, stage),
            rankedEntry(others[0], 2, "longer_term"),
            rankedEntry(others[1], 3, "longer_term"),
          ],
          locale,
        ),
        alternative: render(
          [
            rankedEntry(others[0], 1, "explore_now"),
            rankedEntry(p, 2, stage),
            rankedEntry(others[1], 3, "longer_term"),
          ],
          locale,
        ),
      };
      for (const [variant, html] of Object.entries(variants)) {
        const label = `[${locale}] ${p.professionId} ${stage} ${variant}`;
        const c = exploreControl(html, p.professionId);
        ck(`2.1 ${label}: an explore control is rendered`, c !== null);
        if (!c) continue;
        ck(
          `2.2 ${label}: it is an anchor or a button, not a span`,
          c.tag === "a" || c.tag === "button",
          `tag=${c.tag}`,
        );
        ck(`2.3 ${label}: 44px target`, c.className.includes("min-h-11"));
        ck(
          `2.4 ${label}: accessible name carries the occupation`,
          Boolean(c.ariaLabel && c.ariaLabel.includes(title)),
          c.ariaLabel ?? "no aria-label",
        );
        const expectedLabel =
          stage === "explore_now" ? STAGE_LABEL.explore_now[locale] : exploreCareer;
        ck(
          `2.5 ${label}: the visible label is "${expectedLabel}"`,
          Boolean(c.ariaLabel && c.ariaLabel.startsWith(expectedLabel)) &&
            html.includes(`>${expectedLabel}<`),
        );
        if (dest.kind === "career_center") {
          ck(
            `2.6 ${label}: anchor with the guide href`,
            c.tag === "a" && c.href === dest.href,
            `tag=${c.tag} href=${c.href}`,
          );
          ck(
            `2.7 ${label}: the href's guide is published`,
            Boolean(c.href && getPublishedProfession(c.href.replace("/career-center/", ""))),
          );
        } else {
          ck(
            `2.8 ${label}: a real button controlling a panel`,
            c.tag === "button" &&
              c.type === "button" &&
              c.ariaExpanded === "false" &&
              Boolean(c.ariaControls),
          );
          ck(
            `2.9 ${label}: the controlled panel exists in the card`,
            Boolean(c.ariaControls) &&
              html.includes(`id="${c.ariaControls}"`) &&
              html.includes(`data-explore-panel="${p.professionId}"`),
          );
        }
        // The stage badge stays for the non-explore stages: the chip is an
        // action, the badge is a classification, and the card must still
        // say which it is.
        if (stage !== "explore_now") {
          ck(
            `2.10 ${label}: the stage badge is still shown`,
            html.includes(`>${STAGE_LABEL[stage][locale]}<`),
          );
        }
      }
    }
  }
}

// =========================================================================
group("3 · The inert chip is gone");
// =========================================================================
for (const locale of LOCALES) {
  const html = render(
    [
      rankedEntry(APPROVED[4], 1, "explore_now"),
      rankedEntry(APPROVED[0], 2, "explore_now"),
      rankedEntry(APPROVED[1], 3, "explore_now"),
    ],
    locale,
  );
  const inert = new RegExp(`<span[^>]*>${STAGE_LABEL.explore_now[locale]}</span>`);
  ck(
    `3.1 [${locale}] "${STAGE_LABEL.explore_now[locale]}" is never a bare <span>`,
    !inert.test(html),
  );
  ck(`3.2 [${locale}] no card links into the jobs page`, !html.includes("/jobs/profession/"));
}

// =========================================================================
group("4 · Polis — the card in the owner's screenshot");
// =========================================================================
{
  const polis = APPROVED.find((p) => p.professionId === "SP005")!;
  const dest = exploreDestinationFor(polis);
  ck("4.1 Polis has a destination", dest.kind === "inline_details" && dest.cigSlug === "polis");
  ck(
    "4.2 Polis is not linked to its unpublished placeholder guide",
    getPublishedProfession("police-officer") === undefined && dest.kind !== "career_center",
  );
  for (const locale of LOCALES) {
    const html = render([rankedEntry(polis, 1, "explore_now")], locale);
    const c = exploreControl(html, "SP005");
    ck(
      `4.3 [${locale}] Polis "${STAGE_LABEL.explore_now[locale]}" is a real button`,
      c?.tag === "button" && c.ariaExpanded === "false",
    );
    ck(
      `4.4 [${locale}] named for the occupation`,
      Boolean(c?.ariaLabel?.includes(locale === "sv" ? "Polis" : polis.titleEn)),
    );
  }
}

// =========================================================================
group("5 · Both locales carry the strings the control renders");
// =========================================================================
for (const key of [
  "careerDiscovery.report.v31.exploreCareer",
  "careerDiscovery.report.v31.professionDetailLoading",
  "careerDiscovery.report.v31.professionDetailError",
  "careerDiscovery.report.v31.requirementsTitle",
  "careerDiscovery.report.v31.requirementsEmpty",
  "careerDiscovery.report.v31.educationTitle",
]) {
  ck(
    `5.1 ${key} in sv and en`,
    Boolean(dict.sv[key]) && Boolean(dict.en[key]) && dict.sv[key] !== dict.en[key],
  );
}

console.log("");
if (fails.length > 0) {
  console.error(`career-discovery-explore-link-check: ${fails.length} assertion(s) failed.`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("career-discovery-explore-link-check: all assertions passed.");
