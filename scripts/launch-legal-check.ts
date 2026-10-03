// Launch: the published terms and privacy policy, and acceptance at signup.
//
// Run via `bun run launch-legal:check`.
// Planted controls: `bun run negative-controls:launch-legal`.
//
// What must stay true (owner, 2026-10-03):
//
//   1  the documents are the owner's texts, with exactly the two
//      substitutions asked for: Cqrityjob LLC and info@cqrityjob.com; every
//      undecided "[Ange …]" is still a visible gap, never filled in here;
//   2  both documents have a route, are linked from the footer and from
//      registration, and are in the sitemap;
//   3  signup asks for acceptance of the TERMS, in a box of its own that is
//      required and never pre-ticked, and bundles no other consent;
//      acceptance is recorded with the terms version; Google signup is held
//      to the same box;
//   4  the privacy policy is offered as information, never as something the
//      person "accepts".

import { readFileSync } from "node:fs";
import path from "node:path";
import { PRIVACY, TERMS, TERMS_VERSION, type LegalDocument } from "../src/lib/legal/documents";
import { dictionaries } from "../src/i18n/dictionaries";

const fails: string[] = [];
function ck(name: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function allText(doc: LegalDocument): string {
  const out: string[] = [doc.title, doc.date];
  for (const s of [{ heading: "", blocks: doc.intro }, ...doc.sections]) {
    out.push(s.heading);
    for (const b of s.blocks) {
      if (b.type === "p" || b.type === "placeholder") out.push(b.text);
      else if (b.type === "list") out.push(...b.items);
      else out.push(...b.head, ...b.rows.flat());
    }
  }
  return out.join("\n");
}
const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

/* ================================================================== */
group("GROUP 1 — the owner's documents, as given");
/* ================================================================== */
{
  const terms = allText(TERMS);
  const privacy = allText(PRIVACY);
  ck(
    "1.1 the terms name Cqrityjob LLC and info@cqrityjob.com",
    terms.includes("Cqrityjob LLC, info@cqrityjob.com"),
  );
  ck(
    "1.2 the privacy policy names Cqrityjob LLC as controller and info@ as contact",
    privacy.includes("**Cqrityjob LLC**") &&
      privacy.includes("Kontakt: **info@cqrityjob.com**") &&
      privacy.includes("Cqrityjob LLC är personuppgiftsansvarig"),
  );
  ck(
    "1.3 no 'Cqrityjob AB' and no '[kontaktadress]' is left",
    ![terms, privacy].some((t) => t.includes("Cqrityjob AB") || t.includes("[kontaktadress]")),
  );
  ck(
    "1.4 the terms keep all 16 sections, the privacy policy all 12",
    TERMS.sections.length === 16 && PRIVACY.sections.length === 12,
  );
  ck(
    "1.5 the terms apply from 2026-10-01, which is the version accepted",
    TERMS.date === "2026-10-01" && TERMS_VERSION === "2026-10-01",
  );
  const gaps = (t: string) =>
    (t.match(/\[(?:Ange|ange|Länk|länk|publiceringsdatum)[^\]]*\]/g) ?? []).length;
  ck(
    "1.6 the owner's undecided points are still open: 2 in the terms",
    gaps(terms) === 2,
    String(gaps(terms)),
  );
  ck("1.7 and 7 in the privacy policy", gaps(privacy) === 7, String(gaps(privacy)));
  ck(
    "1.8 the 7-day retention lines are the owner's, unchanged",
    privacy.includes("Supportärenden\n7 dagar") &&
      privacy.includes("Säkerhets- och åtkomstloggar\n7 dagar"),
  );
  ck(
    "1.9 acceptance of the terms is not consent to processing (terms §9)",
    terms.includes(
      "Att acceptera dessa användarvillkor innebär inte ett generellt samtycke till all personuppgiftsbehandling.",
    ),
  );
}

/* ================================================================== */
group("GROUP 2 — routes, footer, sitemap");
/* ================================================================== */
{
  for (const [route, doc] of [
    ["src/routes/villkor.tsx", "TERMS"],
    ["src/routes/integritetspolicy.tsx", "PRIVACY"],
  ] as const) {
    const src = code(route);
    ck(`2.1 ${route} renders ${doc}`, src.includes(`<LegalDocumentView doc={${doc}}`));
  }
  const view = code("src/components/legal/LegalDocumentView.tsx");
  ck(
    "2.2 a gap is rendered as a marked placeholder, not as finished text",
    view.includes("data-legal-placeholder") && /PLACEHOLDER\.test\(part\)/.test(view),
  );
  const footer = code("src/components/site/SiteFooter.tsx");
  ck(
    "2.3 the footer links both documents and info@",
    footer.includes("<Link to={TERMS_PATH}") &&
      footer.includes("<Link to={PRIVACY_PATH}") &&
      footer.includes("href={`mailto:${CONTACT_EMAIL}`}"),
  );
  const sitemap = code("src/routes/sitemap[.]xml.ts");
  ck(
    "2.4 both documents are in the sitemap",
    sitemap.includes('path: "/villkor"') && sitemap.includes('path: "/integritetspolicy"'),
  );
}

/* ================================================================== */
group("GROUP 3 — acceptance at signup");
/* ================================================================== */
{
  const panel = code("src/components/auth/UnifiedAuthPanel.tsx");
  ck(
    "3.1 the terms box starts unticked",
    /useState\(false\);\s*$/m.test(
      panel.split("const [termsAccepted, setTermsAccepted] = ")[1]?.split("\n")[0] ?? "",
    ),
  );
  ck(
    "3.2 the box is its own, required, and links the terms",
    /data-testid="signup-terms"\s+required/.test(panel) &&
      /withLink\(\s*t\("auth\.terms\.accept"\),\s*"\{terms\}"/.test(panel) &&
      panel.includes("href={TERMS_PATH}"),
  );
  ck(
    "3.3 an unticked box stops the email signup",
    panel.includes('if (isSignup && !termsAccepted) found.push(t("auth.error.termsRequired"));'),
  );
  ck(
    "3.4 an unticked box stops the Google signup too",
    /async function onGoogle\(\) \{\s*if \(isSignup && !termsAccepted\) \{[\s\S]{0,120}reportErrors\(\[t\("auth\.error\.termsRequired"\)\]\);\s*return;/.test(
      panel,
    ),
  );
  ck(
    "3.5 the signup records which terms were accepted, and when",
    panel.includes("terms_version: TERMS_VERSION,") &&
      panel.includes("terms_accepted_at: new Date().toISOString(),"),
  );
  ck(
    "3.6 nothing else rides on the box: no marketing or newsletter consent",
    !/marketing|newsletter|nyhetsbrev|marknadsf/i.test(panel) &&
      ![sv["auth.terms.accept"], en["auth.terms.accept"]].some((t) =>
        /marknadsf|nyhetsbrev|marketing|newsletter|integritet|privacy/i.test(t),
      ),
  );
  ck(
    "3.7 the box text is about the terms",
    sv["auth.terms.accept"] === "Jag har läst och godkänner {terms}." &&
      en["auth.terms.accept"] === "I have read and accept the {terms}.",
  );
}

/* ================================================================== */
group("GROUP 4 — the privacy policy is information, not consent");
/* ================================================================== */
{
  ck(
    "4.1 neither language says creating an account accepts the privacy policy",
    !/godkänner du vår integritetspolicy/i.test(sv["auth.privacy_note"]) &&
      !/accept our privacy policy/i.test(en["auth.privacy_note"]),
  );
  ck(
    "4.2 the note links the policy and names info@",
    sv["auth.privacy_note"].includes("{privacy}") &&
      en["auth.privacy_note"].includes("{privacy}") &&
      sv["auth.privacy_note"].includes("info@cqrityjob.com") &&
      code("src/components/auth/UnifiedAuthPanel.tsx").includes("href={PRIVACY_PATH}"),
  );
}

console.log("");
if (fails.length) {
  console.error(`launch-legal: ${fails.length} failure(s)`);
  for (const f of fails) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log("launch-legal: all checks passed");
