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
//      person "accepts";
//   5  a document with open points is a draft (banner, noindex, no sitemap,
//      draft version accepted), and every account, Google sign-in included,
//      accepts before it can use the product.

import { readFileSync } from "node:fs";
import path from "node:path";
import { PRIVACY, TERMS, type LegalDocument } from "../src/lib/legal/documents";
import {
  ACCEPTED_TERMS_VERSION,
  OWNER_APPROVED,
  PRIVACY_FINAL,
  TERMS_FINAL,
  openPoints,
} from "../src/lib/legal/status";
import { needsTermsAcceptance } from "../src/lib/legal/terms-acceptance";
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
    "1.5 the terms apply from 2026-10-01; while open points remain the accepted version is the draft's",
    TERMS.date === "2026-10-01" &&
      ACCEPTED_TERMS_VERSION === (TERMS_FINAL ? "2026-10-01" : "2026-10-01-utkast"),
  );
  const gaps = (t: string) =>
    (t.match(/\[(?:Ange|ange|Länk|länk|publiceringsdatum)[^\]]*\]/g) ?? []).length;
  ck(
    "1.6 the terms carry the owner's two decisions and no open point: 18 years, closing through info@",
    gaps(terms) === 0 &&
      terms.includes("Du måste vara minst 18 år för att skapa ett konto.") &&
      terms.includes(
        "Du kan avsluta ditt konto genom att skriva till info@cqrityjob.com från den e-postadress som kontot är registrerat på.",
      ),
    String(gaps(terms)),
  );
  ck(
    "1.7 the privacy policy's 6 undecided points are still open",
    gaps(privacy) === 6,
    String(gaps(privacy)),
  );
  ck(
    "1.8 no retention time is promised that nothing enforces: no 7-day line, both rows open",
    !privacy.includes("7 dagar") &&
      privacy.includes("Supportärenden\n[Ange lagringstid enligt beslutad lagringsplan]") &&
      privacy.includes(
        "Säkerhets- och åtkomstloggar\n[Ange lagringstid enligt beslutad lagringsplan]",
      ),
  );
  ck(
    "1.10 the verified facts: no AI provider, functional cookies only, no cookie-settings link",
    privacy.includes("Vi använder i dag inga AI-leverantörer.") &&
      privacy.includes("Vi använder inga kakor för analys eller marknadsföring") &&
      !/kakpolicy|kakinställningar/.test(privacy),
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
    panel.includes("...acceptanceMetadata(),"),
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

/* ================================================================== */
group("GROUP 5 — drafts are drafts, and every account accepts");
/* ================================================================== */
{
  ck(
    "5.1 a document is final only with no open point AND the owner's approval; neither is approved yet",
    TERMS_FINAL === (openPoints(TERMS).length === 0 && OWNER_APPROVED.terms) &&
      PRIVACY_FINAL === (openPoints(PRIVACY).length === 0 && OWNER_APPROVED.privacy) &&
      !OWNER_APPROVED.terms &&
      !OWNER_APPROVED.privacy &&
      !TERMS_FINAL &&
      !PRIVACY_FINAL,
  );
  const view = code("src/components/legal/LegalDocumentView.tsx");
  ck(
    "5.2 a draft shows the draft banner before any clause",
    /\{!final && \([\s\S]{0,200}data-testid="legal-draft-banner"/.test(view),
  );
  for (const [route, flag] of [
    ["src/routes/villkor.tsx", "TERMS_FINAL"],
    ["src/routes/integritetspolicy.tsx", "PRIVACY_FINAL"],
  ] as const) {
    const src = code(route);
    ck(
      `5.3 ${route}: a draft is noindex and rendered as a draft`,
      src.includes(`...(${flag} ? [] : [{ name: "robots", content: "noindex" }])`) &&
        src.includes(`final={${flag}}`),
    );
  }
  const sitemap = code("src/routes/sitemap[.]xml.ts");
  ck(
    "5.4 a draft is not in the sitemap",
    /\.\.\.\(TERMS_FINAL\s*\?\s*\[\{ path: "\/villkor"/.test(sitemap) &&
      /\.\.\.\(PRIVACY_FINAL\s*\?\s*\[\{ path: "\/integritetspolicy"/.test(sitemap),
  );
  const root = code("src/routes/__root.tsx");
  ck("5.5 the acceptance gate is mounted on every page", root.includes("<TermsAcceptanceGate />"));
  const google = { app_metadata: { provider: "google" }, user_metadata: {} };
  const email = { app_metadata: { provider: "email" }, user_metadata: {} };
  ck("5.6 a Google account with no recorded acceptance is asked", needsTermsAcceptance(google));
  ck(
    "5.7 an account that accepted the current version is not asked again",
    !needsTermsAcceptance({ ...google, user_metadata: { terms_version: ACCEPTED_TERMS_VERSION } }),
  );
  ck(
    "5.8 an account that accepted another version is asked again",
    needsTermsAcceptance({ ...email, user_metadata: { terms_version: "2025-01-01" } }),
  );
  ck(
    "5.9 an email account from before the terms is not asked to accept a draft",
    !needsTermsAcceptance(email, { version: "2026-10-01-utkast", final: false }) &&
      !needsTermsAcceptance(null),
  );
  ck(
    "5.12 once the terms are final, every existing account accepts them (owner decision)",
    needsTermsAcceptance(email, { version: "2026-10-01", final: true }) &&
      needsTermsAcceptance(
        { ...email, user_metadata: { terms_version: "2026-10-01-utkast" } },
        { version: "2026-10-01", final: true },
      ) &&
      !needsTermsAcceptance(
        { ...email, user_metadata: { terms_version: "2026-10-01" } },
        { version: "2026-10-01", final: true },
      ),
  );
  const gateSrc = code("src/components/legal/TermsAcceptanceGate.tsx");
  ck(
    "5.10 the gate cannot be dismissed: accept (box ticked) or sign out",
    gateSrc.includes('aria-modal="true"') &&
      gateSrc.includes("disabled={!ticked || busy}") &&
      gateSrc.includes("supabase.auth.signOut()") &&
      gateSrc.includes("const [ticked, setTicked] = useState(false);"),
  );
  const panel = code("src/components/auth/UnifiedAuthPanel.tsx");
  ck(
    "5.11 Google from the signup page carries the ticked box across the round trip",
    panel.includes("if (isSignup) rememberTermsAcceptance();"),
  );
}

console.log("");
if (fails.length) {
  console.error(`launch-legal: ${fails.length} failure(s)`);
  for (const f of fails) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log("launch-legal: all checks passed");
