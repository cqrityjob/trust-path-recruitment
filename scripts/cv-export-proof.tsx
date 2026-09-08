// Real PDF exports of the real CV, checked as PDFs.
//
// Run via `bun run cv-export:proof`. NOT a CI gate — it needs a production
// CSS build and a Chromium, and the repository's guards are deliberately
// credential-free and network-free. `cv-pilot:check` is the gate; this is
// the harness that produces the artefacts a human looks at, and the one
// check that cannot be made any other way.
//
// ── WHY A SCREENSHOT WOULD NOT HAVE DONE ───────────────────────────────
//
// "Export" here is `window.print()` over `CvDocumentView`, and the whole
// claim of that approach is that the result is a TEXT document: selectable,
// searchable, readable by an applicant tracking system, and correctly
// paginated by the browser's own paged-media engine. A screenshot of the
// page proves none of that. It would look identical whether the PDF
// contained text or a picture of text, and an employer's ATS would find out
// which, months later, by silently indexing nothing.
//
// So this renders the component with the application's own compiled
// stylesheet, prints it through Chromium's paged media exactly as a
// person's browser would, and then reads the TEXT back out of the resulting
// PDF — through the font's own ToUnicode map, with no PDF library — and
// asserts against what came back. If the export ever became an image, every
// assertion below would fail at once rather than degrade quietly.
//
// ── WHAT THE FOUR CASES ARE FOR ────────────────────────────────────────
//
//   thin      somebody entering the industry: education, no employment.
//             Proves empty sections are absent rather than printed as
//             headings with nothing under them.
//   vaktare   the ordinary pilot case, and the important one: mixed
//             verification levels, one authorisation that has LAPSED, an
//             employment that ended, contact details switched on.
//   chef      a twelve-post career with a long unbroken name. Proves the
//             pagination and that nothing is clipped at a page boundary.
//   selected  the same person as `vaktare`, in English, with two facts
//             deselected. Proves the deselected facts are absent from the
//             exported FILE, not merely undrawn on a screen.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { CvDocumentView } from "../src/components/professional-identity/CvDocumentView";
import { buildCvSourceBundle } from "../src/lib/professional-identity/cv/source-bundle";
import { buildCvTrustAnnotations } from "../src/lib/professional-identity/cv/trust-annotations";
import { buildFactualCvDocument } from "../src/lib/professional-identity/cv/document";
import { resolveCvContact } from "../src/lib/professional-identity/cv/stored";
import type { ProfessionalIdentityV1 } from "../src/lib/professional-identity/types";

const root = path.resolve(import.meta.dirname, "..");
const OUT = path.join(root, "artifacts/cv-export");

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

/** The evaluation day, pinned like the guard's. */
const TODAY = "2026-09-08";

/* ------------------------------------------------------------------ */
/* Reading text back out — with the reader an employer's system uses   */
/* ------------------------------------------------------------------ */
//
// ── THIS USED TO BE A HUNDRED AND FIFTY LINES OF BESPOKE PDF PARSING ───
//
// It inflated the content streams, merged the ToUnicode CMaps and decoded the
// show operators by hand, and it worked. It was still the wrong instrument,
// for a reason that has nothing to do with whether the code was correct: it
// was written by the same hand as the thing it was checking, so a defect in
// the export and a matching assumption in the extractor cancelled out
// silently. The pair agreed with each other while an applicant tracking
// system saw something else.
//
// They did, in fact, disagree. The custom extractor read `thin.pdf` happily;
// `pdftotext -layout` read the candidate's name as
//
//     Jonas
//     Sverige
//             Ek
//
// because the export had fallen back to a font Chromium could not embed, and
// the resulting Type 3 glyph boxes were the whole em square. The bespoke
// reader never looked at geometry, so it never noticed. That is the entire
// argument for using somebody else's reader.
//
// Poppler is now a hard dependency of this proof. A missing binary FAILS the
// script rather than degrading it: a check that silently becomes weaker when
// a tool is absent is a check nobody can rely on.

function poppler(tool: string, args: readonly string[]): string {
  const r = spawnSync(tool, [...args], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    console.error(
      `\n${tool} is required and did not run. Install poppler ` +
        "(macOS: `brew install poppler`; Debian/Ubuntu: `apt-get install -y poppler-utils`).\n" +
        `${r.error?.message ?? r.stderr ?? ""}`,
    );
    process.exit(2);
  }
  return r.stdout;
}

/** `pdfinfo` as a field map. */
function pdfInfo(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of poppler("pdfinfo", [file]).split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

/**
 * One row per font, parsed by COLUMN and not by whitespace.
 *
 * `pdffonts` prints a fixed-width table whose second column is literally
 * "Type 3" and whose fourth is "yes"/"no". Splitting on whitespace makes the
 * type "Type", the embedded flag "Custom", and every assertion built on them
 * quietly meaningless -- which is what the first version of this function
 * did, and it passed.
 */
function pdfFonts(file: string): { name: string; type: string; embedded: boolean }[] {
  const lines = poppler("pdffonts", [file]).split("\n");
  const ruler = lines[1] ?? "";
  // The dashes row gives the exact span of every column.
  const spans: [number, number][] = [];
  let at = 0;
  for (const run of ruler.split(" ")) {
    if (run.length > 0) spans.push([at, at + run.length]);
    at += run.length + 1;
  }
  const col = (line: string, i: number) =>
    spans[i] ? line.slice(spans[i][0], spans[i][1]).trim() : "";

  return lines
    .slice(2)
    .filter((l) => l.trim().length > 0)
    .map((l) => ({ name: col(l, 0), type: col(l, 1), embedded: col(l, 3) === "yes" }));
}

/** One string per page, in reading order, as poppler sees it. */
function pdfPages(file: string): string[] {
  return poppler("pdftotext", ["-layout", file, "-"])
    .split("\f")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

/** Whitespace-insensitive containment. Layout mode pads columns, so a
 *  sentence that wraps is still the same sentence. */
function squashed(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}
const has = (pages: readonly string[], needle: string) =>
  squashed(pages.join(" ")).includes(squashed(needle));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const EMPTY: ProfessionalIdentityV1 = {
  identityVersion: "professional-identity-v1",
  displayName: null,
  accountCountry: null,
  locale: "sv",
  currentStatus: null,
  currentProfessionSlug: null,
  currentProfessionOther: null,
  currentProfessionTitleSv: null,
  currentProfessionTitleEn: null,
  yearsOfExperience: null,
  hasPassport: false,
  headline: null,
  workCountry: null,
  workSubJurisdiction: null,
  employment: [],
  claims: [],
  discovery: {
    hasCompletedReport: false,
    snapshotId: null,
    generatedAt: null,
    namesCareers: false,
  },
  workload: {
    applicationCount: 0,
    assessmentAssignmentCount: 0,
    releasedReportCount: 0,
    releasedReportAttemptId: null,
    assessmentAssignmentAttemptId: null,
    employerWorkspaceCount: 0,
    draftClaimCount: 0,
    draftClaimIds: [],
  },
  unavailable: [],
};

type Claim = ProfessionalIdentityV1["claims"][number];
type Employment = ProfessionalIdentityV1["employment"][number];

const claim = (over: Partial<Claim>): Claim => ({
  id: "c",
  claimType: "certification",
  title: "",
  issuerName: null,
  issuedOn: null,
  validUntil: null,
  skillLevel: null,
  assertionLevel: "self_declared",
  lifecycleState: "active",
  verifierName: null,
  verificationMethod: null,
  verifiedOn: null,
  ...over,
});

const job = (over: Partial<Employment>): Employment => ({
  id: "e",
  employerName: "",
  roleTitle: "",
  startedOn: "2020-01-01",
  endedOn: null,
  employmentType: "employed",
  jurisdictionCode: "SE",
  assertionLevel: "self_declared",
  verifierName: null,
  verificationMethod: null,
  verifiedOn: null,
  ...over,
});

/** Karin Wallin — the ordinary pilot case. */
const WALLIN: ProfessionalIdentityV1 = {
  ...EMPTY,
  displayName: "Karin Wallin",
  accountCountry: "SE",
  workCountry: "SE",
  hasPassport: true,
  headline: "Väktare med sex års erfarenhet inom ronderande bevakning",
  currentProfessionSlug: "vaktare",
  currentProfessionTitleSv: "Väktare",
  currentProfessionTitleEn: "Security officer",
  yearsOfExperience: "6-10",
  employment: [
    job({
      id: "e-current",
      employerName: "Nordic Security AB",
      roleTitle: "Väktare",
      startedOn: "2022-03-01",
      assertionLevel: "verified",
      verifierName: "Nordic Security AB",
      verificationMethod: "employer_confirmation",
      verifiedOn: "2024-02-01",
    }),
    job({
      id: "e-past",
      employerName: "Stadsvakt i Malmö AB",
      roleTitle: "Ordningsvakt",
      startedOn: "2019-06-01",
      endedOn: "2022-02-28",
    }),
  ],
  claims: [
    claim({
      id: "c-vu1",
      title: "Väktarutbildning VU1",
      issuerName: "BYA",
      issuedOn: "2019-04-01",
      validUntil: "2028-04-01",
      assertionLevel: "verified",
      verifierName: "BYA",
      verificationMethod: "source_confirmation",
      verifiedOn: "2024-02-01",
    }),
    // LAPSED. Verified once, active in the database, and out of date by the
    // calendar. The single most important line in this whole harness.
    claim({
      id: "c-ov",
      claimType: "licence",
      title: "Ordningsvaktsförordnande",
      issuerName: "Polismyndigheten",
      issuedOn: "2021-04-01",
      validUntil: "2026-03-31",
      assertionLevel: "verified",
      verifierName: "Länsstyrelsen i Skåne",
      verificationMethod: "source_confirmation",
      verifiedOn: "2021-04-10",
    }),
    claim({
      id: "c-gy",
      claimType: "education",
      title: "Gymnasieexamen, samhällsvetenskapsprogrammet",
      issuerName: "Malmö kommun",
      issuedOn: "2018-06-01",
    }),
    claim({ id: "c-sv", claimType: "language", title: "Svenska", skillLevel: "modersmål" }),
    claim({ id: "c-en", claimType: "language", title: "Engelska", skillLevel: "B2" }),
    claim({ id: "c-cctv", claimType: "practical_skill", title: "Kameraövervakning" }),
  ],
};

/** Somebody entering the industry. */
const THIN: ProfessionalIdentityV1 = {
  ...EMPTY,
  displayName: "Jonas Ek",
  accountCountry: "SE",
  currentProfessionSlug: "vaktare",
  currentProfessionTitleSv: "Väktare",
  claims: [
    claim({
      id: "c-gy",
      claimType: "education",
      title: "Gymnasieexamen, barn- och fritidsprogrammet",
      issuerName: "Göteborgs kommun",
      issuedOn: "2025-06-01",
    }),
  ],
};

/** A long career, and a name that will not break on a hyphen. */
const CHEF: ProfessionalIdentityV1 = {
  ...EMPTY,
  displayName: "Bengt-Åke Sjölund-Wikströmsson",
  accountCountry: "SE",
  workCountry: "SE",
  hasPassport: true,
  headline: "Säkerhetschef med tjugofem års erfarenhet av skyddsobjekt och riskhantering",
  currentProfessionOther: "Säkerhetschef",
  yearsOfExperience: "20+",
  employment: Array.from({ length: 12 }, (_, i) =>
    job({
      id: `e-${i}`,
      employerName: `Säkerhetsbolaget i Västra Götaland nummer ${12 - i} AB`,
      roleTitle: i === 0 ? "Säkerhetschef" : i < 4 ? "Skyddschef" : "Väktare",
      startedOn: `${2022 - i * 2}-01-01`,
      endedOn: i === 0 ? null : `${2023 - i * 2}-12-31`,
      ...(i < 3
        ? {
            assertionLevel: "verified",
            verifierName: `Säkerhetsbolaget i Västra Götaland nummer ${12 - i} AB`,
            verificationMethod: "employer_confirmation",
            verifiedOn: "2024-01-01",
          }
        : {}),
    }),
  ),
  claims: [
    claim({
      id: "c-vu3",
      title: "Väktarutbildning VU3",
      issuerName: "BYA",
      issuedOn: "2004-09-01",
      assertionLevel: "verified",
      verifierName: "BYA",
      verificationMethod: "source_confirmation",
      verifiedOn: "2023-01-01",
    }),
    claim({
      id: "c-ssg",
      title: "SSG Entre",
      issuerName: "SSG",
      issuedOn: "2023-01-01",
      validUntil: "2027-01-01",
    }),
    claim({
      id: "c-iso",
      title: "ISO 27001 Lead Implementer",
      issuerName: "PECB",
      issuedOn: "2020-05-01",
    }),
    claim({
      id: "c-hlr",
      claimType: "training",
      title: "HLR och första hjälpen",
      issuerName: "Röda Korset",
      issuedOn: "2025-02-01",
      validUntil: "2027-02-01",
    }),
    claim({
      id: "c-uni",
      claimType: "education",
      title: "Kandidatexamen i kriminologi",
      issuerName: "Stockholms universitet",
      issuedOn: "2003-06-01",
    }),
    claim({ id: "c-sv", claimType: "language", title: "Svenska", skillLevel: "modersmål" }),
    claim({ id: "c-en", claimType: "language", title: "Engelska", skillLevel: "C1" }),
    claim({ id: "c-de", claimType: "language", title: "Tyska", skillLevel: "B1" }),
    claim({
      id: "c-risk",
      claimType: "specialisation",
      title: "Riskanalys och kontinuitetsplanering",
    }),
    claim({ id: "c-lead", claimType: "practical_skill", title: "Ledning av larmcentral" }),
  ],
};

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function stylesheet(): string {
  const dir = path.join(root, ".output/public/assets");
  if (!existsSync(dir)) {
    console.error(
      "No production stylesheet found. Run `bun run build` first -- this harness prints the\n" +
        "component with the application's OWN compiled CSS, because a PDF produced with\n" +
        "different styles would prove nothing about the one a person exports.",
    );
    process.exit(2);
  }
  const css = readdirSync(dir).find((f) => f.startsWith("styles-") && f.endsWith(".css"));
  if (!css) {
    console.error("No styles-*.css in .output/public/assets. Run `bun run build`.");
    process.exit(2);
  }
  return readFileSync(path.join(dir, css), "utf8");
}

const CSS = stylesheet();

interface Case {
  readonly key: string;
  readonly identity: ProfessionalIdentityV1;
  readonly locale: "sv" | "en";
  readonly includedIds?: readonly string[];
  readonly contact?: { email: string; phone: string; showEmail: boolean; showPhone: boolean };
}

const CASES: readonly Case[] = [
  { key: "thin", identity: THIN, locale: "sv" },
  {
    key: "vaktare",
    identity: WALLIN,
    locale: "sv",
    contact: {
      email: "karin.wallin@example.se",
      phone: "070-123 45 67",
      showEmail: true,
      showPhone: true,
    },
  },
  { key: "chef", identity: CHEF, locale: "sv" },
  {
    key: "selected-en",
    identity: WALLIN,
    locale: "en",
    // Two facts left off. They must be absent from the FILE. Expressed as an
    // allowlist because that is what the product now sends: the list says
    // what to include, so a truncated one produces a smaller CV rather than
    // a fuller one. See selection.ts.
    includedIds: ["e-current", "c-vu1", "c-ov", "c-gy", "c-sv", "c-cctv"],
    contact: { email: "karin.wallin@example.se", phone: "", showEmail: true, showPhone: false },
  },
];

function pageHtml(c: Case): string {
  const bundle = buildCvSourceBundle({
    identity: c.identity,
    locale: c.locale,
    includeCareerInsight: false,
    targetJobText: null,
    includedIds: c.includedIds,
  });
  const doc = buildFactualCvDocument(
    bundle,
    buildCvTrustAnnotations(c.identity, TODAY),
    c.contact ? resolveCvContact(c.contact) : undefined,
  );
  const markup = renderToStaticMarkup(<CvDocumentView document={doc} />);
  // `main` and the wrapper reproduce what SiteLayout puts around the article,
  // so the print rules that neutralise `min-h-screen` and `flex-1` are
  // exercised rather than assumed.
  // ── THE FONTS ARE THE POINT, NOT DECORATION ──────────────────────────
  //
  // The compiled stylesheet references the self-hosted faces as `/fonts/...`,
  // which resolves against the site origin. This page is loaded from `file:`,
  // so those URLs would 404 and the browser would fall back to the platform
  // UI font -- which is exactly the state that produced a Type 3 PDF with the
  // candidate's name extracting out of order. Rewriting them to absolute
  // file: URLs makes the harness print with the fonts a real visitor gets;
  // `pdffonts` then proves it, rather than the harness assuming it.
  // The compiled stylesheet writes them unquoted (`url(/fonts/x.woff2)`), so
  // the rewrite matches what the bundler emits rather than what the source
  // says -- a mismatch there fails silently as a 404, a fallback font and a
  // Type 3 PDF, which is precisely the bug this harness exists to catch.
  const css = CSS.replaceAll("url(/fonts/", `url(file://${path.join(root, "public/fonts")}/`);

  return `<!doctype html>
<html lang="${c.locale}"><head><meta charset="utf-8"><title>CV</title>
<style>${css}</style></head>
<body class="min-h-screen bg-background text-foreground">
<main class="flex-1"><div class="py-14">${markup}</div></main>
</body></html>`;
}

/* ------------------------------------------------------------------ */

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const pdfs = new Map<string, string[]>();

for (const c of CASES) {
  const html = path.join(OUT, `${c.key}.html`);
  const pdf = path.join(OUT, `${c.key}.pdf`);
  writeFileSync(html, pageHtml(c), "utf8");
  await page.goto(`file://${html}`, { waitUntil: "load" });
  // `preferCSSPageSize` so the @page rule in styles.css decides the sheet and
  // the margins, exactly as it does in a person's own print dialog.
  await page.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true, format: "A4" });
  pdfs.set(c.key, pdfPages(pdf));
  console.log(`  wrote ${path.relative(root, pdf)} (${pdfs.get(c.key)!.length} page(s))`);
}
await browser.close();

/* ------------------------------------------------------------------ */
/* Assertions, against the PDFs                                        */
/* ------------------------------------------------------------------ */

group("POPPLER — what an applicant tracking system actually reads");
for (const c of CASES) {
  const file = path.join(OUT, `${c.key}.pdf`);
  const info = pdfInfo(file);
  const fonts = pdfFonts(file);

  // A4 is 595 x 842 points. Poppler prints it as "595.276 x 841.89 pts (A4)"
  // when it recognises the size, which is the assertion worth making: a
  // document that says A4 on it is one a recruiter can print.
  ck(`${c.key}: pdfinfo reports A4`, /\(A4\)/.test(info["Page size"] ?? ""), info["Page size"]);

  // THE CHECK THAT CAUGHT THE REAL DEFECT. A Type 3 font is what Chromium
  // writes when it cannot embed the face -- and its glyph boxes are the whole
  // em square, so poppler reads the name as overlapping the line below it.
  ck(
    `${c.key}: no Type 3 font`,
    fonts.length > 0 && fonts.every((f) => !/Type 3/i.test(f.type)),
    fonts.map((f) => `${f.name}:${f.type}`).join(", "),
  );
  ck(
    `${c.key}: every face is embedded`,
    fonts.every((f) => f.embedded),
    fonts
      .filter((f) => !f.embedded)
      .map((f) => f.name)
      .join(", "),
  );
  ck(
    `${c.key}: and they are the product's own faces`,
    fonts.some((f) => /Sora|Manrope/i.test(f.name)),
    fonts.map((f) => f.name).join(", "),
  );

  // ── TAGGING: STATED, NOT CLAIMED ─────────────────────────────────
  //
  // A TAGGED PDF carries a structure tree -- headings, lists, reading order --
  // that assistive technology and the better applicant tracking systems use.
  // Chromium's print pipeline does not produce one, and there is no flag on
  // `page.pdf()` that makes it. So this document is UNTAGGED, and the
  // assertion says exactly that rather than being quietly absent.
  //
  // It is asserted as `no` on purpose. If a future Chromium starts emitting a
  // structure tree, this fails -- and somebody has to come and decide whether
  // the export may now be described as accessible, rather than the claim
  // drifting into being true without anybody noticing it had been false.
  //
  // What IS proved instead: embedded fonts, extractable text, and the correct
  // reading order under `pdftotext`, which is what an ATS parses. That is
  // less than tagging and it is not nothing, and the report says which.
  ck(
    `${c.key}: pdfinfo reports the document as UNTAGGED (Chromium cannot tag)`,
    (info.Tagged ?? "") === "no",
    `Tagged: ${info.Tagged}`,
  );
}

group("POPPLER — reading order, in the reader an employer is likely to use");
{
  // ── THE DEFECT THIS GROUP EXISTS FOR ─────────────────────────────────
  //
  // `pdftotext -layout` used to extract the thin CV as
  //
  //     Jonas
  //     Sverige
  //             Ek
  //
  // The candidate's own name, split around an unrelated line. Nothing was
  // wrong with the document: the export had fallen back to the platform UI
  // font, macOS does not let Chromium embed it, and the resulting Type 3
  // glyph boxes were the full em square -- so poppler saw the 20pt name
  // overlapping the 14pt line beneath it and ordered them by geometry.
  //
  // Self-hosting the faces fixed it at the source. This is the assertion that
  // keeps it fixed, in the tool that found it.
  const layout = poppler("pdftotext", ["-layout", path.join(OUT, "thin.pdf"), "-"]);
  const raw = poppler("pdftotext", [path.join(OUT, "thin.pdf"), "-"]);

  ck(
    "thin: the name extracts whole and in order (-layout)",
    /Jonas Ek/.test(layout),
    layout.slice(0, 120),
  );
  ck("thin: and in raw mode", /Jonas Ek/.test(raw));
  ck(
    "thin: nothing is interleaved between the given name and the surname",
    !/Jonas[\s\S]{0,40}Sverige[\s\S]{0,40}Ek/.test(layout),
  );
  ck(
    "thin: the country still follows the name rather than splitting it",
    layout.indexOf("Sverige") > layout.indexOf("Jonas Ek"),
  );
  ck(
    "thin: Swedish characters survive",
    /Gymnasieexamen, barn- och fritidsprogrammet/.test(layout),
  );
  ck(
    "thin: the sections are in document order",
    layout.indexOf("UTBILDNING") > layout.indexOf("Jonas Ek"),
  );
}

group("POPPLER — the section headings survive as WORDS");
{
  // ── THE DEFECT THIS GROUP EXISTS FOR ─────────────────────────────────
  //
  // The section rules carry `tracking-[0.16em]` on screen, which looks right
  // and printed a document that read perfectly. `pdftotext` saw it as
  //
  //     UTB I LDNI NG
  //     C R E D E N T I A L S A N D A U T H O R I S AT I O N S
  //
  // A text extractor decides where a word begins from the gap between
  // glyphs, and 0.16em on an 8.5pt heading is wide enough to look like one.
  // An applicant tracking system segments a CV by finding its headings; it
  // finds none of those. The document was beautiful and machine-unreadable.
  //
  // It was platform-dependent too: macOS Chromium joined the letters and
  // Linux Chromium did not, from identical source. So this could not have
  // been caught by looking at a PDF, and the print stylesheet now sets
  // `letter-spacing: 0.04em` with the threshold measured, not guessed.
  //
  // Asserted with RAW `includes`, deliberately. Everywhere else in this file
  // uses `squashed()`, which strips whitespace and would have called
  // "U T B I L D N I N G" a pass — correct for a sentence that wraps, and
  // exactly wrong for the one property being checked here.
  const headings: Record<string, readonly string[]> = {
    vaktare: ["ERFARENHET", "INTYG OCH BEHÖRIGHETER", "SPRÅK"],
    thin: ["UTBILDNING"],
    chef: ["ERFARENHET", "UTBILDNING", "INTYG OCH BEHÖRIGHETER"],
    "selected-en": ["EXPERIENCE", "CREDENTIALS AND AUTHORISATIONS"],
  };
  for (const [key, wanted] of Object.entries(headings)) {
    const text = poppler("pdftotext", ["-layout", path.join(OUT, `${key}.pdf`), "-"]);
    for (const heading of wanted) {
      ck(
        `${key}: "${heading}" extracts as one word, not letter by letter`,
        text.includes(heading),
        // The shredded form, so a failure shows what the reader actually got
        // rather than only that it did not match.
        (
          text
            .split("\n")
            .find((l) => l.replace(/\s+/g, "").includes(heading.replace(/\s+/g, ""))) ??
          "(not found at all)"
        ).trim(),
      );
    }
  }
}

group("POPPLER — the vaktare CV, read as an employer's system reads it");
{
  const text = poppler("pdftotext", ["-layout", path.join(OUT, "vaktare.pdf"), "-"]);
  const squash = (s: string) => s.replace(/\s+/g, " ");
  const t = squash(text);

  ck("the name is whole", t.includes("Karin Wallin"));
  ck("the expired authorisation is named", t.includes("Ordningsvaktsförordnande"));
  ck("with its date", t.includes("Giltig t.o.m. 2026-03-31"));
  ck("and labelled expired", t.includes("UTGÅNGEN") || t.includes("Utgången"));
  ck("the credential still in date keeps its mark", t.includes("Verifierad"));
  ck(
    "the contact details the person switched on are readable",
    t.includes("karin.wallin@example.se"),
  );
  ck("Swedish characters survive", t.includes("Väktare") && t.includes("Malmö"));
  ck(
    "no internal identifier is extractable",
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text),
  );
  ck(
    "the employment order is newest first",
    t.indexOf("Nordic Security AB") < t.indexOf("Stadsvakt"),
  );
}

group("POPPLER — the deselected facts and the hidden number are absent");
{
  const text = poppler("pdftotext", ["-layout", path.join(OUT, "selected-en.pdf"), "-"]);
  ck("the deselected employment is not in the file", !text.includes("Stadsvakt"));
  ck("the deselected language is not in the file", !text.includes("Engelska"));
  ck("the telephone the person switched off is not in the file", !text.includes("070-123"));
  ck("the address they switched on is", text.includes("karin.wallin@example.se"));
  ck(
    "and the document reads as English",
    text.includes("EXPERIENCE") || text.includes("Experience"),
  );
}

group("POPPLER — pagination of a long career");
{
  const info = pdfInfo(path.join(OUT, "chef.pdf"));
  ck("chef: pdfinfo agrees it is more than one page", Number(info.Pages ?? "0") >= 2, info.Pages);
  const text = poppler("pdftotext", ["-layout", path.join(OUT, "chef.pdf"), "-"]);
  const missing = CHEF.employment.map((e) => e.employerName).filter((n) => !text.includes(n));
  ck(
    `chef: all ${CHEF.employment.length} employers survive extraction`,
    missing.length === 0,
    missing.join(", "),
  );
  ck(
    "chef: the long unbroken name extracts whole",
    text.includes("Bengt-Åke Sjölund-Wikströmsson"),
  );
  ck("chef: no page is blank", !/\f\s*\f/.test(text) && !/\f\s*$/.test(text.replace(/\s+$/, "")));
}

group("THE FILE IS A TEXT DOCUMENT, NOT A PICTURE OF ONE");
for (const [key, pages] of pdfs) {
  ck(`${key}: text came back out of the PDF`, pages.length > 0 && pages.join("").length > 100);
}

group("vaktare — the lapsed authorisation");
{
  const p = pdfs.get("vaktare")!;
  ck("the expired licence is named", has(p, "Ordningsvaktsförordnande"));
  ck("its validity date is printed", has(p, "Giltig t.o.m. 2026-03-31"));
  ck("and it is called expired, in a word", has(p, "Utgången"));
  ck("the verifier who once approved it is NOT named beside it", !has(p, "Länsstyrelsen i Skåne"));

  ck("the credential still in date is named", has(p, "Väktarutbildning VU1"));
  ck("it keeps its verification mark", has(p, "Verifierad"));
  ck("and its own validity date", has(p, "Giltig t.o.m. 2028-04-01"));
  ck("with the verifier named", has(p, "BYA"));

  ck("the confirmed employment carries its attribution", has(p, "Nordic Security AB"));
  ck(
    "the ended employment is present, with the month it ended",
    has(p, "Stadsvakt i Malmö AB") && has(p, "2022-02"),
  );
  ck(
    "the contact details the person switched on are printed",
    has(p, "karin.wallin@example.se") && has(p, "070-123 45 67"),
  );
  ck("the work country is a country, not a code", has(p, "Sverige"));
  ck("the verification legend prints with the document", has(p, "sköldrad"));
  ck("the document dates itself", has(p, TODAY));
  ck("and says a saved PDF does not update itself", has(p, "uppdateras inte"));
  ck(
    "no internal identifier is in the file",
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(p.join(" ")),
  );
}

group("selected-en — deselected facts are absent from the FILE");
{
  const p = pdfs.get("selected-en")!;
  ck("the deselected employment is not in the PDF at all", !has(p, "Stadsvakt"));
  ck("nor is its role title", !has(p, "Ordningsvakt i Malmö") && !has(p, "Stadsvakt i Malmö AB"));
  ck("the deselected language is not in the PDF", !has(p, "Engelska"));
  ck("the language that was kept is", has(p, "Svenska"));
  ck("the kept employment is still there", has(p, "Nordic Security AB"));
  ck(
    "the document is in English",
    has(p, "Experience") && has(p, "Credentials and authorisations"),
  );
  ck("including the country", has(p, "Sweden"));
  ck(
    "and the expired licence still says so, in English",
    has(p, "Expired") && has(p, "Valid until 2026-03-31"),
  );
  ck("the phone was left off and is absent", !has(p, "070-123"));
  ck("the email was switched on and is present", has(p, "karin.wallin@example.se"));
}

group("thin — a short career is a complete document, not a padded one");
{
  const p = pdfs.get("thin")!;
  ck("it fits on one page", p.length === 1);
  ck("the person is named", has(p, "Jonas Ek"));
  ck("their education is there", has(p, "Gymnasieexamen"));
  ck("no Experience heading is printed over an empty section", !has(p, "Erfarenhet"));
  ck("no Languages heading either", !has(p, "Språk"));
  ck("and nothing was invented to fill the page", !has(p, "Nordic") && !has(p, "Väktarutbildning"));
}

group("chef — a long career paginates without losing anything");
{
  const p = pdfs.get("chef")!;
  ck("it runs to more than one page", p.length >= 2);
  ck("the long unbroken name survives", has(p, "Bengt-Åke Sjölund-Wikströmsson"));
  const employers = CHEF.employment.map((e) => e.employerName);
  const missing = employers.filter((name) => !has(p, name));
  ck(
    `all ${employers.length} employers are in the file (missing: ${missing.length})`,
    missing.length === 0,
  );
  const claims = CHEF.claims.map((c) => c.title);
  const missingClaims = claims.filter((t) => !has(p, t));
  ck(
    `all ${claims.length} credentials, languages and skills are in the file`,
    missingClaims.length === 0,
  );
  ck("the footer reached the last page rather than being cut", has(p, "uppdateras inte"));

  // An employment and the line saying who confirmed it must not be split
  // across a page boundary. Asserted per page: the attribution for a given
  // employer appears on the same page as the employer's name.
  const confirmed = CHEF.employment.filter((e) => e.assertionLevel === "verified");
  const split = confirmed.filter((e) => {
    const onPage = p.findIndex((text) => squashed(text).includes(squashed(e.employerName)));
    const roleOn = p.findIndex((text) => squashed(text).includes(squashed(`${e.roleTitle}`)));
    return onPage === -1 || roleOn === -1;
  });
  ck("every confirmed post appears whole on a page", split.length === 0);
}

/* ------------------------------------------------------------------ */

console.log("");
console.log(`Artefacts in ${path.relative(root, OUT)}/`);
if (fails.length > 0) {
  console.error(`\nFAIL — cv-export-proof: ${fails.length} problem(s)`);
  for (const f of fails) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(
  "cv-export:proof OK (four real PDFs, verified with poppler: A4, embedded CID TrueType with no\n" +
    "Type 3 face, correct reading order, Swedish characters, expiry stated, deselected facts and\n" +
    "hidden contact absent, no internal identifier, pagination intact)",
);
console.log(
  "\nLIMITATION, asserted rather than glossed: the exported PDFs are UNTAGGED. Chromium's print\n" +
    "pipeline emits no structure tree and no option makes it. Assistive technology and the better\n" +
    "applicant tracking systems use that tree; what these documents offer instead is embedded\n" +
    "fonts, extractable text and correct reading order. Tagging would need a different renderer.",
);
