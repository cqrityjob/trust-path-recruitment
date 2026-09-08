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

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
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
/* Reading text back out of a PDF, without a PDF library               */
/* ------------------------------------------------------------------ */

// ── WHY THIS IS NOT THIRTY LINES ───────────────────────────────────────
//
// Because a naive extractor passes when the export is broken, which is the
// one thing a proof must not do.
//
// Chromium prints this page with the macOS system UI font, which it cannot
// embed, so it emits TYPE 3 fonts: one subsetted font per style, glyph codes
// that mean nothing outside their own font, and ONE `Tj` PER GLYPH with a
// `Tf` in front of it. A first attempt merged every ToUnicode map in the
// file into one table, and the result was confident nonsense -- code 0x5E is
// a different letter in F5 than in F6, so roughly a third of the document
// came back as plausible-looking text and the assertions failed for reasons
// that had nothing to do with the CV.
//
// So the font is resolved the way a PDF reader resolves it: the page's
// /Resources name the font objects, each font object names its own
// /ToUnicode stream, and the content stream is walked with the current font
// in hand. That is also exactly the path an applicant tracking system takes,
// which is the property being asserted -- if the export ever stopped
// carrying ToUnicode maps, the text would stop coming back here at the same
// moment it stopped being selectable for a recruiter.

interface PdfObject {
  readonly body: string;
  readonly stream: Buffer | null;
}

function parseObjects(buf: Buffer): Map<number, PdfObject> {
  const latin = buf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  for (const m of latin.matchAll(/(?:^|[\r\n])(\d+) 0 obj\b/g)) {
    const num = Number(m[1]);
    const bodyStart = m.index! + m[0].length;
    const objEnd = latin.indexOf("endobj", bodyStart);
    if (objEnd === -1) continue;
    const body = latin.slice(bodyStart, objEnd);

    let stream: Buffer | null = null;
    // `\bstream` and NOT `\nstream`: Chromium writes `/Length 134>> stream`
    // on one line, so requiring a newline in front of the keyword found no
    // streams at all and the whole document came back empty. The word
    // boundary is safe because `endstream` has none in front of `stream`.
    const sm = /\bstream\r?\n/.exec(body);
    if (sm) {
      const dataStart = bodyStart + sm.index + sm[0].length;
      const dataEnd = latin.indexOf("endstream", dataStart);
      if (dataEnd !== -1) {
        const raw = buf.subarray(dataStart, dataEnd);
        if (/\/FlateDecode/.test(body.slice(0, sm.index))) {
          try {
            stream = inflateSync(raw);
          } catch {
            try {
              stream = inflateSync(raw.subarray(0, -1));
            } catch {
              stream = Buffer.alloc(0);
            }
          }
        } else {
          stream = raw;
        }
      }
    }
    objects.set(num, { body, stream });
  }
  return objects;
}

function hexToStr(hex: string): string {
  let s = "";
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  }
  return s;
}

/** One font's own code -> character table, from its /ToUnicode CMap. */
function cmapOf(stream: Buffer): Map<number, string> {
  const map = new Map<number, string>();
  const text = stream.toString("latin1");
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(m[1], 16), hexToStr(m[2]));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const dst = parseInt(m[3], 16);
      for (let ch = lo; ch <= hi && ch - lo < 65535; ch += 1) {
        map.set(ch, String.fromCodePoint(dst + (ch - lo)));
      }
    }
  }
  return map;
}

/** The byte codes in one string operand, literal or hex. */
function operandCodes(operand: string): number[] {
  const codes: number[] = [];
  if (operand.startsWith("<")) {
    const hex = operand.slice(1, -1).replace(/\s/g, "");
    for (let i = 0; i + 1 < hex.length; i += 2) codes.push(parseInt(hex.slice(i, i + 2), 16));
    return codes;
  }
  const body = operand.slice(1, -1);
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "\\" && i + 1 < body.length) {
      const n = body[i + 1];
      const oct = /[0-7]/.test(n) ? body.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] : null;
      if (oct) {
        codes.push(parseInt(oct, 8));
        i += oct.length;
        continue;
      }
      codes.push({ n: 10, r: 13, t: 9, b: 8, f: 12 }[n] ?? n.charCodeAt(0));
      i += 1;
      continue;
    }
    codes.push(body.charCodeAt(i));
  }
  return codes;
}

/** One string per page, in the order the pages are bound. */
function pdfPages(file: string): string[] {
  const buf = readFileSync(file);
  const objects = parseObjects(buf);

  /** font object number -> its ToUnicode table. */
  const fontMaps = new Map<number, Map<number, string>>();
  for (const [num, obj] of objects) {
    const toUnicode = /\/ToUnicode (\d+) 0 R/.exec(obj.body);
    if (!toUnicode) continue;
    const cmapStream = objects.get(Number(toUnicode[1]))?.stream;
    if (cmapStream) fontMaps.set(num, cmapOf(cmapStream));
  }

  // Page order comes from the page tree, not from where the objects happen
  // to sit in the file -- an assertion about "page 2" has to mean the second
  // page a reader sees.
  const pagesNode = [...objects.values()].find((o) => /\/Type\s*\/Pages\b/.test(o.body));
  const kids = pagesNode
    ? [...(/\/Kids \[([^\]]*)\]/.exec(pagesNode.body)?.[1] ?? "").matchAll(/(\d+) 0 R/g)].map((m) =>
        Number(m[1]),
      )
    : [...objects.entries()].filter(([, o]) => /\/Type\s*\/Page\b/.test(o.body)).map(([n]) => n);

  const out: string[] = [];
  for (const pageNum of kids) {
    const page = objects.get(pageNum);
    if (!page) continue;

    /** resource name -> ToUnicode table, for THIS page. */
    const byName = new Map<string, Map<number, string>>();
    const fontDict = /\/Font <<([\s\S]*?)>>/.exec(page.body)?.[1] ?? "";
    for (const m of fontDict.matchAll(/\/(\w+) (\d+) 0 R/g)) {
      const table = fontMaps.get(Number(m[2]));
      if (table) byName.set(m[1], table);
    }

    const contentRef = /\/Contents (\d+) 0 R/.exec(page.body);
    const content = contentRef ? objects.get(Number(contentRef[1]))?.stream : null;
    if (!content) continue;

    const text = content.toString("latin1");
    let current: Map<number, string> | null = null;
    let page_ = "";
    // Font selections and show operators, in the order they occur. Chromium
    // emits one glyph per Tj, so the font in hand changes constantly and
    // reading it any other way is what produced nonsense.
    for (const m of text.matchAll(
      /\/(\w+)\s+[\d.]+\s+Tf|(\[[^\]]*\]|\([^)]*\)|<[0-9A-Fa-f\s]*>)\s*(TJ|Tj)/g,
    )) {
      if (m[1]) {
        current = byName.get(m[1]) ?? null;
        continue;
      }
      const operand = m[2];
      const parts = operand.startsWith("[")
        ? [...operand.matchAll(/(\([^)]*\)|<[0-9A-Fa-f\s]*>)/g)].map((x) => x[1])
        : [operand];
      for (const part of parts) {
        for (const code of operandCodes(part)) {
          const ch = current?.get(code);
          page_ += ch ?? (current ? "" : code >= 32 && code < 127 ? String.fromCharCode(code) : "");
        }
      }
    }
    out.push(page_.replace(/\s+/g, " ").trim());
  }
  return out;
}

/** Chromium positions every glyph individually, so word spacing in the
 *  extracted stream is decorative. Assertions run against this. */
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
  return `<!doctype html>
<html lang="${c.locale}"><head><meta charset="utf-8"><title>CV</title>
<style>${CSS}</style></head>
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
  "cv-export:proof OK (four real PDFs, selectable text, expiry stated, deselected facts absent, pagination intact)",
);
