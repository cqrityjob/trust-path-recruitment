// Launch: the published terms and privacy policy, and acceptance at signup.
//
// Run via `bun run launch-legal:check`.
// Planted controls: `bun run negative-controls:launch-legal`.
//
// What must stay true (owner decisions of 2026-10-03 and 2026-10-04,
// docs/legal/2026-10-04-owner-decisions.md):
//
//   1  the documents carry the owner's decisions: the provider and data
//      controller is Cqrityjobb AB (559261-0249) and the retired names are
//      left nowhere; contact is info@, job@ is for recruitment replies, no
//      response time is promised in public; generative AI is off in version 1
//      and later a separate paid service; transfers need a documented support
//      and no EU-only rule is invented; every undecided "[Ange ...]" is still a
//      visible gap, never filled in by the code;
//   2  both documents have a route, are linked from the footer and from
//      registration, and are in the sitemap once final;
//   3  signup asks for acceptance of the TERMS, in a box of its own that is
//      required and never pre-ticked, and bundles no other consent;
//      acceptance is recorded with the terms version; Google signup is held
//      to the same box;
//   4  the privacy policy is offered as information, never as something the
//      person "accepts";
//   5  a document with open points is a draft (banner, noindex, no sitemap,
//      draft version accepted), and every account, Google sign-in included,
//      accepts before it can use the product;
//   6  the retention section of the policy IS the approved plan, row for row,
//      and the policy cannot become final while a period has no verified
//      routine behind it;
//   7  the processor agreement draft exists with the content art. 28(3) GDPR
//      requires, and its sub-processor annex lists the same suppliers as the
//      policy; the historical records keep the old provider name and say why.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { FUNNEL_MEASUREMENT_ENABLED } from "../src/lib/analytics/funnel-measurement";
import {
  SHARE_COOKIE_MAX_AGE_SECONDS,
  buildShareCookie,
  buildShareSessionCookie,
} from "../src/lib/security-passport/share-transport";
import { COMPANY } from "../src/lib/legal/company";
import { PRIVACY, TERMS, type LegalDocument } from "../src/lib/legal/documents";
import {
  RETENTION_PLAN,
  RETENTION_POLICY_ROWS,
  RETENTION_READY,
} from "../src/lib/legal/retention-plan";
import { VENDORS } from "../src/lib/legal/vendors";
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
group("GROUP 1 — the owner's documents and decisions");
/* ================================================================== */
{
  const terms = allText(TERMS);
  const privacy = allText(PRIVACY);
  const gaps = (t: string) =>
    (t.match(/\[(?:Ange|ange|Länk|länk|publiceringsdatum)[^\]]*\]/g) ?? []).length;

  ck(
    "1.0 the company data is the owner's: Cqrityjobb AB, 559261-0249, brand CQrityjob",
    COMPANY.legalName === "Cqrityjobb AB" &&
      COMPANY.organisationNumber === "559261-0249" &&
      COMPANY.brand === "CQrityjob" &&
      COMPANY.contactEmail === "info@cqrityjob.com" &&
      COMPANY.recruitmentEmail === "job@cqrityjob.com",
  );
  ck(
    "1.1 the terms name Cqrityjobb AB, its organisation number and info@, and the address is a visible gap",
    terms.includes("Tjänsten tillhandahålls av Cqrityjobb AB, organisationsnummer 559261-0249.") &&
      terms.includes("Kontakt: info@cqrityjob.com") &&
      terms.includes("[Ange bolagets adress.]"),
  );
  ck(
    "1.2 the privacy policy names Cqrityjobb AB as controller, with organisation number, info@ as contact and job@ for replies",
    privacy.includes("**Cqrityjobb AB**") &&
      privacy.includes("Organisationsnummer: 559261-0249.") &&
      privacy.includes("Kontakt: **info@cqrityjob.com**") &&
      privacy.includes("Cqrityjobb AB är personuppgiftsansvarig") &&
      privacy.includes("Svar på ett sådant mejl går till job@cqrityjob.com") &&
      privacy.includes("[Ange bolagets adress.]"),
  );
  const RETIRED = /Cqrityjob (?:LLC|AB)\b|\[kontaktadress\]/;
  const webTexts = [
    sv["legal.provider"],
    en["legal.provider"],
    sv["meta.privacy.description"],
    en["meta.privacy.description"],
  ];
  const sourceFiles = (dir: string): string[] =>
    readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? sourceFiles(path.join(dir, e.name))
        : /\.(ts|tsx)$/.test(e.name)
          ? [path.join(dir, e.name)]
          : [],
    );
  const stale = [...sourceFiles("src"), ...sourceFiles("supabase/functions")].filter((f) =>
    /Cqrityjob (?:LLC|AB)\b/.test(code(f)),
  );
  ck(
    "1.3 the retired provider names and '[kontaktadress]' are left nowhere: documents, web texts, source",
    ![terms, privacy, ...webTexts].some((t) => RETIRED.test(t)) && stale.length === 0,
    stale.join(", "),
  );
  ck(
    "1.3b the web texts name Cqrityjobb AB, the organisation number and info@ in both languages",
    [sv["legal.provider"], en["legal.provider"]].every(
      (t) =>
        t.includes("Cqrityjobb AB") &&
        t.includes("559261-0249") &&
        t.includes("info@cqrityjob.com"),
    ),
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
  ck(
    "1.6 the terms carry the owner's decisions (18 years, closing through info@) and exactly one open point, the company address",
    gaps(terms) === 1 &&
      terms.includes("Du måste vara minst 18 år för att skapa ett konto.") &&
      terms.includes(
        "Du kan avsluta ditt konto genom att skriva till info@cqrityjob.com från den e-postadress som kontot är registrerat på.",
      ),
    String(gaps(terms)),
  );
  ck(
    "1.7 the privacy policy's 16 undecided points are still open: date, address, supplier facts (including Cloudflare, which the hosting layer's cookie shows is in the delivery path), the backup period, and the audit entries that are classified first",
    gaps(privacy) === 16 && openPoints(PRIVACY).length === 16,
    String(gaps(privacy)),
  );
  ck(
    "1.8 section 9 is the approved retention plan, row for row, and the untrue 7-day promise is not back",
    !privacy.includes("7 dagar") &&
      RETENTION_POLICY_ROWS.every((r) => privacy.includes(`${r.data}\n${r.period}`)),
  );
  ck(
    '1.14 nothing is described that the product does not do: no newsletter, no consent-based tracking, our own measurement and the hosting supplier\'s visitor analytics said to be off only as checked on 4 October 2026 and only while the measurement constant is false (never "Vi mäter inte"), and no automatic forwarding of replies from job@',
    !/nyhetsbrev|direktmarknadsföring|samtyckeskrävande spårning/i.test(`${terms}\n${privacy}`) &&
      !privacy.includes("Vi mäter anonymt") &&
      !/Vi mäter inte/.test(privacy) &&
      FUNNEL_MEASUREMENT_ENABLED === false &&
      privacy.includes(
        "Vår egen användningsmätning och driftleverantörens besöksstatistik är avstängda (kontrollerat den 4 oktober 2026), och vi lagrar ingen statistikmarkering i webbläsaren.",
      ) &&
      !/vidarebefordrar (?:det|svaret) till arbetsgivaren/.test(`${terms}\n${privacy}`) &&
      terms.includes("svaret förs inte automatiskt vidare till arbetsgivaren") &&
      privacy.includes("Svaret förs inte automatiskt vidare till arbetsgivaren") &&
      terms.includes("Den adressen hanteras av CQrityjob") &&
      privacy.includes("som hanteras av CQrityjob på arbetsgivarens uppdrag"),
  );
  ck(
    "1.9 acceptance of the terms is not consent to processing (terms §9)",
    terms.includes(
      "Att acceptera dessa användarvillkor innebär inte ett generellt samtycke till all personuppgiftsbehandling.",
    ),
  );
  ck(
    "1.10 generative AI is off in version 1 and a later separate paid service; functional cookies only, no cookie-settings link",
    privacy.includes("Generativa AI-funktioner är avstängda i den här versionen av tjänsten.") &&
      privacy.includes(
        "Vi använder i dag inga AI-leverantörer, och dina uppgifter skickas inte till någon AI-tjänst.",
      ) &&
      privacy.includes("som separata betaltjänster som du uttryckligen beställer och aktiverar") &&
      terms.includes(
        "Generativa AI-funktioner är avstängda i den här versionen av tjänsten och ingår inte i den.",
      ) &&
      terms.includes("är separata betaltjänster. De kräver en uttrycklig beställning") &&
      !/kakpolicy|kakinställningar/.test(privacy),
  );
  ck(
    "1.10b the policy's cookie sentence matches what the share transport sets (two cookies, 30 minutes), and it names the two cookies of the hosting layer that were measured on the live site (__cf_bm, __dpl) with their purposes and lifetimes, without claiming that no technology needing consent exists or that nothing is ever measured",
    SHARE_COOKIE_MAX_AGE_SECONDS === 1800 &&
      buildShareCookie("t", true).includes("Max-Age=1800") &&
      buildShareSessionCookie("s", true).includes("Max-Age=1800") &&
      privacy.includes(
        "sätts två kakor (en för delningsnyckeln och en för delningssessionen, som vardera gäller i 30 minuter)",
      ) &&
      !privacy.includes("en kaka som gäller") &&
      !privacy.includes("behövs inget samtycke") &&
      !privacy.includes("ingen teknik som kräver samtycke") &&
      !privacy.includes("Vi sätter inga kakor för analys") &&
      !privacy.includes("Vi använder inga kakor för analys") &&
      privacy.includes(
        "__cf_bm från Cloudflare, som skyddar mot automatiserad trafik och gäller i 30 minuter, och __dpl från Lovable, som håller dig på rätt publicerad version och gäller i ungefär 24 timmar. Ingen av dem används för analys eller marknadsföring.",
      ) &&
      !privacy.includes("session-id") &&
      VENDORS.some((v) => v.id === "cloudflare" && v.location.startsWith("[Ange ")) &&
      !VENDORS.some((v) => (v.id as string) === "tinybird"),
  );
  ck(
    "1.10c the terms' AI-result sentence is conditional: it does not describe an AI result in a version that has no generative AI",
    terms.includes(
      "Om AI-funktioner erbjuds i en senare version är ett AI-resultat beslutsstöd.",
    ) && !terms.includes("Ett AI-resultat är beslutsstöd."),
  );
  ck(
    "1.11 no response time is promised in public; requests follow the statutory deadline",
    !/arbetsdag/i.test(`${terms}\n${privacy}`) &&
      privacy.includes("utan onödigt dröjsmål och senast inom en månad"),
  );
  ck(
    "1.12 transfers: no EU-only rule is invented, a transfer needs a documented support, and a purchase or an acceptance of the terms does not replace it",
    privacy.includes(
      "Vi har ingen generell regel om att uppgifter bara får behandlas inom EU/EES.",
    ) &&
      privacy.includes("framgår av tabellen i avsnitt 6") &&
      privacy.includes(
        "Ett köp av en tjänst eller ett godkännande av användarvillkoren ersätter inte stödet för en överföring.",
      ) &&
      !/endast inom EU|enbart inom EU|bara inom EU\/EES\./i.test(privacy),
  );
  ck(
    "1.13 every supplier is listed in section 6 with its place and its transfer support",
    VENDORS.length >= 5 &&
      VENDORS.every((v) =>
        privacy.includes(`${v.name}\n${v.purpose}\n${v.location}\n${v.transferSupport}`),
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

/* ================================================================== */
group("GROUP 6 — the retention plan is the policy, and the policy waits for it");
/* ================================================================== */
{
  const privacy = allText(PRIVACY);
  const ids = RETENTION_PLAN.map((r) => r.id);
  ck(
    "6.1 every row has an id, a public text, a period, an approval, a routine and the evidence behind it; ids are unique",
    RETENTION_PLAN.length >= 13 &&
      new Set(ids).size === ids.length &&
      RETENTION_PLAN.every(
        (r) =>
          r.id &&
          r.data.length > 10 &&
          r.period.length > 5 &&
          r.evidence.length > 40 &&
          r.routine.length > 10 &&
          (r.approval === "approved" || r.approval === "proposed"),
      ),
  );
  // What the owner approved (decision 3, 2026-10-04): these periods, as the
  // owner's retention plan states them.
  const approved: Record<string, readonly string[]> = {
    account: ["30 dagar", "24 månader"],
    "info-mailbox": ["12 månader"],
    "job-mailbox": ["24 månader"],
    feedback: ["12 månader"],
    "notice-outbox": ["90 dagar"],
    // Decided 2026-10-04 (third message, relayed by the release session).
    recruitment: [
      "24 månader efter att rekryteringen avslutades",
      "arbetsgivarens fastställda instruktioner",
    ],
    "admin-audit": ["Högst 12 månader", "dokumenterat behov"],
    "platform-logs": ["90 dagar"],
    "mail-logs": ["90 dagar"],
  };
  ck(
    "6.2 the approved periods are the owner's (a change is a decision, so it must change this guard too)",
    Object.entries(approved).every(([id, parts]) => {
      const row = RETENTION_PLAN.find((r) => r.id === id);
      return (
        !!row && row.approval === "approved" && parts.every((part) => row.period.includes(part))
      );
    }),
  );
  // Owner instruction, 2026-10-04 (second message): 13 months of usage
  // statistics, 24 months of audit logs and a general anonymisation after 24
  // months are NOT decisions already made. The third message decided three of
  // them in a narrower form (recruitment: 24 months after the recruitment ended,
  // per the employer's instructions; security and permission logs: at most 12
  // months with a documented need; technical logs: normally 90 days) and left
  // two open: the other kinds of audit entry (classified first) and the 339 old
  // usage rows (checked and classified first, nothing deleted). Those two stay
  // proposals: no number in the public text, an open point or "not decided".
  const proposed = ["usage-statistics", "other-audit", "accounting"];
  ck(
    '6.2b usage statistics (13 months), a 24-month audit period and the other audit entries are not decided: no number in the public text, an open point or "not decided" instead; the decided rows carry no leftover proposal',
    ["usage-statistics", "other-audit"].every((id) => {
      const row = RETENTION_PLAN.find((r) => r.id === id);
      return (
        !!row &&
        row.approval === "proposed" &&
        !!row.proposal &&
        (/\[Ange [^\]]*\]/.test(row.period) || /Inte beslutat/.test(row.period)) &&
        !/\d+ månader/.test(row.period)
      );
    }) &&
      ["recruitment", "admin-audit", "platform-logs", "mail-logs"].every((id) => {
        const row = RETENTION_PLAN.find((r) => r.id === id);
        return !!row && row.approval === "approved" && !row.proposal;
      }) &&
      RETENTION_PLAN.filter((r) => r.approval === "proposed")
        .map((r) => r.id)
        .sort()
        .join() === [...proposed].sort().join() &&
      !privacy.includes("13 månader") &&
      !privacy.includes("24 månader för granskningsloggar") &&
      !/anonymiseras därefter/.test(
        privacy.replace("raderas eller anonymiseras därefter, såvida inte", ""),
      ),
  );
  const usage = RETENTION_PLAN.find((r) => r.id === "usage-statistics");
  const acct = RETENTION_PLAN.find((r) => r.id === "account");
  ck(
    "6.2c the candidate's own test results are account data, not usage statistics; version 1 has no usage statistics in the policy",
    !!usage &&
      !!acct &&
      !usage.inPolicy &&
      /cd_sessions/.test(usage.evidence) &&
      /account data/.test(usage.evidence) &&
      acct.data.includes("egna tester") &&
      /cd_sessions/.test(acct.evidence) &&
      !/användningsstatistik/i.test(privacy),
  );
  ck(
    "6.3 a period only the supplier knows is an open point, never a number invented by the code",
    ["backups"].every((id) => {
      const row = RETENTION_PLAN.find((r) => r.id === id);
      return !!row && row.period.startsWith("[Ange ") && row.mechanism === "pending";
    }) &&
      // The logs have a decided ceiling (normally 90 days) but only the supplier's
      // own setting makes it true, so they stay pending until the owner has read it.
      ["platform-logs", "mail-logs"].every((id) => {
        const row = RETENTION_PLAN.find((r) => r.id === id);
        return !!row && row.mechanism === "pending" && /R8/.test(row.routine);
      }),
  );
  const statusSrc = code("src/lib/legal/status.ts");
  const planSrc = code("src/lib/legal/retention-plan.ts");
  ck(
    "6.4 the policy cannot be final while a period is undecided or has no carried-out, verified routine",
    /export const PRIVACY_FINAL =\s*openPoints\(PRIVACY\)\.length === 0 && OWNER_APPROVED\.privacy && RETENTION_READY;/.test(
      statusSrc,
    ) &&
      /export const RETENTION_READY = RETENTION_PLAN\.every\(\s*\(r\) => r\.approval === "approved" && r\.mechanism !== "pending",\s*\);/.test(
        planSrc,
      ) &&
      PRIVACY_FINAL ===
        (openPoints(PRIVACY).length === 0 && OWNER_APPROVED.privacy && RETENTION_READY) &&
      !RETENTION_READY,
  );
  ck(
    "6.5 a row is only live or confirmed with a document that proves it",
    RETENTION_PLAN.filter((r) => r.mechanism !== "pending").every((r) => /docs\//.test(r.evidence)),
  );

  // The smallest working routine behind every row (owner, 2026-10-04): a named
  // person, a control interval, a simple log, tested steps; no promise the
  // routines cannot keep.
  const runbook = read("docs/legal/retention-runbook-v1.md");
  const log = read("docs/legal/retention-execution-log.md");
  const mailbox = read("docs/legal/mailbox-and-gdpr-routine.md");
  ck(
    "6.6 the runbook names the person responsible, the control intervals and the log, and the log exists",
    runbook.includes("**Mostafa Alshawi**") &&
      /Första arbetsdagen varje månad/.test(runbook) &&
      /varje kvartal/.test(runbook) &&
      runbook.includes("docs/legal/retention-execution-log.md") &&
      log.includes("| Datum | Rutin | Utförd av |") &&
      mailbox.includes("Mostafa är ansvarig") &&
      mailbox.includes("Inget vidarebefordras automatiskt") &&
      mailbox.includes("Mottagen + 1 månad"),
  );
  ck(
    "6.7 every row that is not supplier-controlled or undecided points at a runbook routine that exists",
    RETENTION_PLAN.every((r) => {
      const m = /Runbook (R\d)/.exec(r.routine);
      return r.id === "accounting" ||
        r.id === "usage-statistics" ||
        r.id === "admin-audit" ||
        r.id === "other-audit"
        ? true
        : !!m && new RegExp(`^## ${m[1]}\\.`, "m").test(runbook);
    }),
  );
  const files = [
    "supabase/retention/feedback-12-months.dry-run.sql",
    "supabase/retention/feedback-12-months.delete.sql",
    "supabase/retention/inactive-accounts-24-months.list.sql",
  ];
  const dbTest = read("supabase/tests/retention_manual_routines_test.sql");
  ck(
    "6.8 the routine SQL in the runbook is the file's text, and the database test runs those files on synthetic data and is part of the database suite",
    files.every((f) => runbook.includes(read(f).trim()) && dbTest.includes(`cat ${f}`)) &&
      read("scripts/db-test.sh").includes("supabase/tests/retention_manual_routines_test.sql"),
  );
  const r6 = /## R6\.[\s\S]*?(?=\n## R7\.)/.exec(runbook)?.[0] ?? "";
  const r2sql = read("supabase/retention/inactive-accounts-24-months.list.sql");
  ck(
    "6.10 R6 counts from the end of the recruitment and deletes nothing it cannot date (no claim that the rule is cautious); the R2 list leaves out erased and anonymised accounts",
    r6.includes("Tiden räknas från **när rekryteringen") &&
      r6.includes("Kan avslutsdatumet inte fastställas: **radera inte.**") &&
      !/försiktig/i.test(r6) &&
      r2sql.includes(
        "not exists (select 1 from public.deleted_accounts d where d.user_id = u.id)",
      ) &&
      r2sql.includes("'raderad+%@removed.invalid'") &&
      r2sql.includes("'anonymised+%@removed.invalid'"),
  );
  ck(
    "6.9 the destructive statements are never run by the guard or the build: they are documents for the owner",
    !/supabase\/retention/.test(read("package.json")) &&
      /Claude-sessionerna kör inga raderingar i produktion/.test(runbook),
  );
}

/* ================================================================== */
group("GROUP 7 — the processor agreement draft, and the historical records");
/* ================================================================== */
{
  const DPA = "docs/legal/personuppgiftsbitradesavtal-utkast.md";
  const have = existsSync(path.join(root, DPA));
  const dpa = have ? read(DPA) : "";
  ck(
    "7.1 the processor agreement draft exists, is marked as a draft and names Cqrityjobb AB",
    have &&
      dpa.includes("Utkast") &&
      dpa.includes("Cqrityjobb AB") &&
      dpa.includes("559261-0249") &&
      !/Cqrityjob (?:LLC|AB)\b/.test(dpa),
  );
  ck(
    "7.2 it has what art. 28(3) GDPR requires: instructions, confidentiality, security, sub-processors, transfers, assistance, incidents, deletion or return, audit, and three annexes",
    have &&
      [
        "Instruktioner",
        "Sekretess",
        "Säkerhetsåtgärder",
        "Underbiträden",
        "Överföring till tredje land",
        "Bistånd",
        "Personuppgiftsincidenter",
        "Radering och återlämnande",
        "Revision",
        "Bilaga 1",
        "Bilaga 2",
        "Bilaga 3",
      ].every((h) => dpa.includes(h)),
  );
  ck(
    "7.3 its sub-processor annex lists every supplier of the privacy policy",
    have && VENDORS.every((v) => dpa.includes(v.name)) && dpa.includes("Bilaga 3"),
  );
  // The agreement and the terms refer to no document that does not exist (owner,
  // 2026-10-04: check references to company agreements). There is no company
  // agreement; the proposals table at the end of the draft says so and is not
  // part of the agreement's text.
  const clauses = dpa.split("## Förslag på frister")[0];
  ck(
    "7.5 neither the terms, the policy nor the agreement's clauses refer to a company agreement that does not exist",
    !/företagsavtal/i.test(allText(TERMS)) &&
      !/företagsavtal/i.test(allText(PRIVACY)) &&
      !/företagsavtal/i.test(clauses.replace("Något separat företagsavtal finns inte i dag", "")) &&
      allText(TERMS).includes(
        "Särskilda ansvarsbegränsningar för företagskunder gäller bara om de har avtalats skriftligt.",
      ),
  );
  ck(
    "7.6 job@ is manual handling in the agreement too, with no automatic forwarding promised; and the retention default is the decided standard, the same as the policy's (24 months after the recruitment ended, per the customer's instructions)",
    clauses.includes("Manuell hantering av kandidatsvar som kommer till job@cqrityjob.com") &&
      !/Vidarebefordran av kandidatsvar/.test(clauses) &&
      /10\.1[\s\S]*24 månader efter att rekryteringen avslutades, enligt Kundens fastställda\s+instruktioner/.test(
        clauses,
      ) &&
      !/Detta motsvarar lagringsplanen/.test(clauses) &&
      !clauses.includes("Ägaren har inte beslutat"),
  );
  ck(
    "7.7 every deadline left open in the agreement has a concrete proposal and a short reason in the table at the end",
    /## Förslag på frister och återstående punkter, med kort motivering/.test(dpa) &&
      [
        "6.2 Förvarning",
        "8.1 Vidarebefordra",
        "9.1 Meddela",
        "10.1 Standardtid",
        "10.2 Radering",
        "11.2 Revision",
        "12 Ansvarsbegränsning",
        "13.3 Domstol",
      ].every((row) => dpa.includes(`| ${row}`)),
  );
  const decisions = "docs/legal/2026-10-04-owner-decisions.md";
  const records = [
    "docs/release/2026-10-03-launch-legal-decisions.md",
    "docs/release/2026-10-03-launch-legal-and-contact.md",
  ].map((f) => (existsSync(path.join(root, f)) ? read(f) : ""));
  ck(
    "7.4 the historical records keep the old provider name and say, at the top, why it is retired and where the decision is",
    existsSync(path.join(root, decisions)) &&
      records.every(
        (t) =>
          t.includes("Cqrityjob LLC") &&
          t.split("\n").slice(0, 14).join("\n").includes(decisions) &&
          t.split("\n").slice(0, 14).join("\n").includes("2026-10-04"),
      ),
  );
}

console.log("");
if (fails.length) {
  console.error(`launch-legal: ${fails.length} failure(s)`);
  for (const f of fails) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log("launch-legal: all checks passed");
