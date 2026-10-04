/**
 * Negative controls for the launch legal guard (scripts/launch-legal-check.ts).
 *
 * Each mutation plants one defect the guard exists for: the retired company
 * name in the terms or in a web text, an owner gap filled in by the code, an
 * untrue 7-day retention promise, a retention period that drifts from the
 * owner's plan, the policy made final with no verified retention routine, a
 * public response time, a lost AI-off sentence, an invented EU-only rule, a
 * supplier the processor agreement does not list, a processor agreement with
 * a required clause missing, a historical record without its note, a
 * pre-ticked or optional terms box, a Google signup that skips it, marketing
 * consent riding on it, the privacy policy presented as accepted, and a footer
 * without the documents.
 *
 * `expect` names the failing check as "FAIL <id> ...", so a control cannot be
 * satisfied by some other check failing.
 *
 * Run: bun run negative-controls:launch-legal
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "launch-legal:check";
const DOCS = "src/lib/legal/documents.ts";
const PLAN = "src/lib/legal/retention-plan.ts";
const DPA = "docs/legal/personuppgiftsbitradesavtal-utkast.md";
const PANEL = "src/components/auth/UnifiedAuthPanel.tsx";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "LEGAL-NC-OLD-COMPANY",
    defect: "the terms name the retired company",
    file: DOCS,
    find: "text: `Tjänsten tillhandahålls av ${COMPANY.legalName}, organisationsnummer ${COMPANY.organisationNumber}. ${COMPANY.brand} är tjänstens varumärke.`,",
    replace: 'text: "Tjänsten tillhandahålls av Cqrityjob LLC, info@cqrityjob.com",',
    guard: GUARD,
    expect:
      "FAIL 1.1 the terms name Cqrityjobb AB, its organisation number and info@, and the address is a visible gap",
  },
  {
    id: "LEGAL-NC-LLC-IN-WEB-TEXT",
    defect: "a web text still names the retired company",
    file: "src/i18n/dictionaries.ts",
    find: '"legal.provider": `${COMPANY.legalName} · org.nr ${COMPANY.organisationNumber} · ${COMPANY.contactEmail}`,',
    replace: '"legal.provider": "Cqrityjob LLC · info@cqrityjob.com",',
    guard: GUARD,
    expect: "FAIL 1.3 the retired provider names",
  },
  {
    id: "LEGAL-NC-GAP-FILLED",
    defect: "the company address, an undecided fact, is filled in by the code",
    file: DOCS,
    find: '        { type: "placeholder", text: "[Ange bolagets adress.]" },\n        {\n          type: "p",\n          text: `Kontakt: **${COMPANY.contactEmail}**`,',
    replace:
      '        { type: "p", text: "Storgatan 1, 111 22 Stockholm" },\n        {\n          type: "p",\n          text: `Kontakt: **${COMPANY.contactEmail}**`,',
    guard: GUARD,
    expect: "FAIL 1.2 the privacy policy names Cqrityjobb AB as controller",
  },
  {
    id: "LEGAL-NC-SEVEN-DAYS-BACK",
    defect: "the untrue 7-day retention promise returns",
    file: PLAN,
    find: 'period: "12 månader efter senaste kontakt.",',
    replace: 'period: "7 dagar",',
    guard: GUARD,
    expect: "FAIL 1.8 section 9 is the approved retention plan",
  },
  {
    id: "LEGAL-NC-RETENTION-DRIFT",
    defect: "a retention period drifts from the owner's approved plan",
    file: PLAN,
    find: 'period: "12 månader.",',
    replace: 'period: "18 månader.",',
    guard: GUARD,
    expect: "FAIL 6.2 the approved periods are the owner's",
  },
  {
    id: "LEGAL-NC-RETENTION-GATE-REMOVED",
    defect: "the policy can become final although no retention routine is verified",
    file: "src/lib/legal/status.ts",
    find: "openPoints(PRIVACY).length === 0 && OWNER_APPROVED.privacy && RETENTION_READY;",
    replace: "openPoints(PRIVACY).length === 0 && OWNER_APPROVED.privacy;",
    guard: GUARD,
    expect:
      "FAIL 6.4 the policy cannot be final while a period is undecided or has no carried-out, verified routine",
  },
  {
    id: "LEGAL-NC-RECRUITMENT-DRIFT",
    defect:
      "the recruitment standard drifts from the owner's decision (24 months after the recruitment ended)",
    file: PLAN,
    find: "Standardtiden är 24 månader efter att rekryteringen avslutades,",
    replace: "Standardtiden är 12 månader efter att rekryteringen avslutades,",
    guard: GUARD,
    expect: "FAIL 6.2 the approved periods are the owner's",
  },
  {
    id: "LEGAL-NC-AUDIT-DRIFT",
    defect:
      "the security and permission logs are kept 24 months, where the owner decided at most 12",
    file: PLAN,
    find: 'period: "Högst 12 månader, och bara så länge det finns ett dokumenterat behov.",',
    replace: 'period: "24 månader.",',
    guard: GUARD,
    expect: "FAIL 6.2 the approved periods are the owner's",
  },
  {
    id: "LEGAL-NC-OTHER-AUDIT-DECIDED",
    defect: "a period is published for the audit entries the owner said are classified first",
    file: PLAN,
    find: 'period: "[Ange lagringstid för övriga granskningsposter. De klassificeras först.]",',
    replace: 'period: "12 månader.",',
    guard: GUARD,
    expect: "FAIL 6.2b",
  },
  {
    id: "LEGAL-NC-R6-CAUTIOUS",
    defect: "runbook R6 deletes a thread whose recruitment end date cannot be determined",
    file: "docs/legal/retention-runbook-v1.md",
    find: "Kan avslutsdatumet inte fastställas: **radera inte.**",
    replace: "Kan avslutsdatumet inte avgöras: radera ändå, regeln är försiktig.",
    guard: GUARD,
    expect: "FAIL 6.10",
  },
  {
    id: "LEGAL-NC-R2-LISTS-ERASED",
    defect: "the inactive-account list includes accounts that were already erased",
    file: "supabase/retention/inactive-accounts-24-months.list.sql",
    find: "   and not exists (select 1 from public.deleted_accounts d where d.user_id = u.id)\n",
    replace: "",
    guard: GUARD,
    expect: "FAIL 6.10",
  },
  {
    id: "LEGAL-NC-AUTO-FORWARD-PROMISED",
    defect:
      "the policy promises that job@ replies are forwarded to the employer, which nothing does",
    file: DOCS,
    find: "på arbetsgivarens uppdrag. Svaret förs inte automatiskt vidare till arbetsgivaren.",
    replace: "på arbetsgivarens uppdrag, och vi vidarebefordrar det till arbetsgivaren.",
    guard: GUARD,
    expect: "FAIL 1.14 nothing is described that the product does not do",
  },
  {
    id: "LEGAL-NC-MEASUREMENT-DESCRIBED",
    defect: "the policy describes an anonymous measurement again",
    file: DOCS,
    find: "Vi har stängt av vår egen mätning av hur tjänsten används, och vi lagrar ingen statistikmarkering i webbläsaren.",
    replace: "Vi mäter anonymt hur ofta vissa sidor och steg används.",
    guard: GUARD,
    expect: "FAIL 1.14 nothing is described that the product does not do",
  },
  {
    id: "LEGAL-NC-MEASUREMENT-SWITCHED-ON",
    defect:
      "the measurement constant is switched on while the policy still says CQrityjob does not measure",
    file: "src/lib/analytics/funnel-measurement.ts",
    find: "export const FUNNEL_MEASUREMENT_ENABLED = false;",
    replace: "export const FUNNEL_MEASUREMENT_ENABLED = true;",
    guard: GUARD,
    expect: "FAIL 1.14 nothing is described that the product does not do",
  },
  {
    id: "LEGAL-NC-ONE-COOKIE",
    defect: "the policy says the share link sets one cookie, where it sets two",
    file: DOCS,
    find: "sätts två kakor (en för delningsnyckeln och en för delningssessionen, som vardera gäller i 30 minuter)",
    replace: "sätts en kaka som gäller i 30 minuter",
    guard: GUARD,
    expect: "FAIL 1.10b the policy's cookie sentence matches what the share transport sets",
  },
  {
    id: "LEGAL-NC-NO-CONSENT-TECH-CLAIM",
    defect:
      "the policy says nothing is measured and no technology needing consent is used, in place of the checked, dated statement about what is off",
    file: DOCS,
    find: "Vår driftleverantör Lovables inbyggda besöksstatistik är avstängd. Det kontrollerades den 4 oktober 2026: ingen besöksstatistik skickades och ingen kaka för den sattes. Vi kontrollerar det igen efter varje publicering.",
    replace:
      "Vi mäter inte hur du använder tjänsten. Vi använder ingen teknik som kräver samtycke.",
    guard: GUARD,
    expect: "FAIL 1.14 nothing is described that the product does not do",
  },
  {
    id: "LEGAL-NC-ANALYTICS-STILL-ON-WORDING",
    defect:
      "the policy says the hosting supplier's statistics are being switched off and that a cookie is set, although they are off and no such cookie is set",
    file: DOCS,
    find: "Vår driftleverantör Lovables inbyggda besöksstatistik är avstängd. Det kontrollerades den 4 oktober 2026: ingen besöksstatistik skickades och ingen kaka för den sattes. Vi kontrollerar det igen efter varje publicering.",
    replace:
      "Vår driftleverantör Lovable har en inbyggd besöksstatistik som vi håller på att stänga av. Lovable sätter en kaka med namnet session-id.",
    guard: GUARD,
    expect: "FAIL 1.14 nothing is described that the product does not do",
  },
  {
    id: "LEGAL-NC-HOST-COOKIES-HIDDEN",
    defect:
      "the policy no longer names the two cookies of the hosting layer that were measured on the live site",
    file: DOCS,
    find: "Dessutom sätter våra driftleverantörer två tekniskt nödvändiga kakor: __cf_bm (Cloudflare, skyddar mot automatiserad trafik, gäller i 30 minuter) och __dpl (Lovable, ser till att du får den senast publicerade versionen av webbplatsen, gäller i ett dygn). De används inte för analys eller marknadsföring.",
    replace: "Vi sätter inga andra kakor.",
    guard: GUARD,
    expect: "FAIL 1.10b the policy's cookie sentence matches what the share transport sets",
  },
  {
    id: "LEGAL-NC-AI-RESULT-UNCONDITIONAL",
    defect: "the terms describe an AI result as if the product produced one in version 1",
    file: DOCS,
    find: "Om AI-funktioner erbjuds i en senare version är ett AI-resultat beslutsstöd.",
    replace: "Ett AI-resultat är beslutsstöd.",
    guard: GUARD,
    expect: "FAIL 1.10c the terms' AI-result sentence is conditional",
  },
  {
    id: "LEGAL-NC-RUNBOOK-NO-OWNER",
    defect: "the retention runbook no longer names who is responsible",
    file: "docs/legal/retention-runbook-v1.md",
    find: "| **Ansvarig** | **Mostafa Alshawi**.",
    replace: "| **Ansvarig** | ägaren.",
    guard: GUARD,
    expect: "FAIL 6.6 the runbook names the person responsible",
  },
  {
    id: "LEGAL-NC-ROUTINE-SQL-DRIFT",
    defect: "the routine SQL in the repository drifts from the runbook that describes it",
    file: "supabase/retention/feedback-12-months.delete.sql",
    find: "   where created_at < now() - interval '12 months'",
    replace: "   where created_at < now() - interval '1 month'",
    guard: GUARD,
    expect: "FAIL 6.8 the routine SQL in the runbook is the file's text",
  },
  {
    id: "LEGAL-NC-SLA-PROMISED",
    defect: "a public response time is promised",
    file: DOCS,
    find: "Vi besvarar din begäran utan onödigt dröjsmål",
    replace: "Vi svarar inom två arbetsdagar. Vi besvarar din begäran utan onödigt dröjsmål",
    guard: GUARD,
    expect: "FAIL 1.11 no response time is promised in public",
  },
  {
    id: "LEGAL-NC-AI-OFF-LOST",
    defect: "the policy no longer says generative AI is off",
    file: DOCS,
    find: 'text: "Generativa AI-funktioner är avstängda i den här versionen av tjänsten.",',
    replace: 'text: "Vi använder AI för att hjälpa dig.",',
    guard: GUARD,
    expect: "FAIL 1.10 generative AI is off in version 1",
  },
  {
    id: "LEGAL-NC-EU-ONLY-INVENTED",
    defect: "an EU-only storage rule the owner did not decide is invented",
    file: DOCS,
    find: "Vi har ingen generell regel om att uppgifter bara får behandlas inom EU/EES.",
    replace: "Uppgifter behandlas endast inom EU/EES.",
    guard: GUARD,
    expect: "FAIL 1.12 transfers",
  },
  {
    id: "LEGAL-NC-VENDOR-NOT-IN-DPA",
    defect: "a supplier of the policy is not in the processor agreement's annex",
    file: "src/lib/legal/vendors.ts",
    find: 'name: "Google",',
    replace: 'name: "Gxogle",',
    guard: GUARD,
    expect: "FAIL 7.3 its sub-processor annex lists every supplier",
  },
  {
    id: "LEGAL-NC-DPA-CLAUSE-MISSING",
    defect: "the processor agreement has no clause on personal data incidents",
    file: DPA,
    find: "## 9. Personuppgiftsincidenter",
    replace: "## 9. Meddelanden",
    guard: GUARD,
    expect: "FAIL 7.2 it has what art. 28(3) GDPR requires",
  },
  {
    id: "LEGAL-NC-HISTORY-UNEXPLAINED",
    defect: "the historical decision record keeps the old provider name with no note on why",
    file: "docs/release/2026-10-03-launch-legal-decisions.md",
    find: "(`docs/legal/2026-10-04-owner-decisions.md`)",
    replace: "(beslutet)",
    guard: GUARD,
    expect: "FAIL 7.4 the historical records keep the old provider name",
  },
  {
    id: "LEGAL-NC-PRETICKED",
    defect: "the terms box starts ticked",
    file: PANEL,
    find: "const [termsAccepted, setTermsAccepted] = useState(false);",
    replace: "const [termsAccepted, setTermsAccepted] = useState(true);",
    guard: GUARD,
    expect: "3.1 the terms box starts unticked",
  },
  {
    id: "LEGAL-NC-OPTIONAL",
    defect: "an unticked box no longer stops the email signup",
    file: PANEL,
    find: '    if (isSignup && !termsAccepted) found.push(t("auth.error.termsRequired"));\n',
    replace: "",
    guard: GUARD,
    expect: "3.3 an unticked box stops the email signup",
  },
  {
    id: "LEGAL-NC-GOOGLE-SKIPS",
    defect: "Google signup skips the terms box",
    file: PANEL,
    find: "    if (isSignup && !termsAccepted) {\n      setInfo(null);",
    replace: "    if (false) {\n      setInfo(null);",
    guard: GUARD,
    expect: "3.4 an unticked box stops the Google signup too",
  },
  {
    id: "LEGAL-NC-MARKETING-BUNDLED",
    defect: "marketing consent rides on the terms box",
    file: PANEL,
    find: "              ...acceptanceMetadata(),\n",
    replace:
      "              ...acceptanceMetadata(),\n              marketing_consent: termsAccepted,\n",
    guard: GUARD,
    expect: "3.6 nothing else rides on the box: no marketing or newsletter consent",
  },
  {
    id: "LEGAL-NC-PRIVACY-ACCEPTED",
    defect: "creating an account is said to accept the privacy policy",
    file: "src/i18n/dictionaries.ts",
    find: '"Läs hur vi behandlar dina personuppgifter i vår {privacy}.',
    replace: '"Genom att skapa ett konto godkänner du vår integritetspolicy {privacy}.',
    guard: GUARD,
    expect: "4.1 neither language says creating an account accepts the privacy policy",
  },
  {
    id: "LEGAL-NC-APPROVED-BY-CODE",
    defect: "the terms are published as final without the owner's approval",
    file: "src/lib/legal/status.ts",
    find: "export const OWNER_APPROVED = { terms: false, privacy: false } as const;",
    replace: "export const OWNER_APPROVED = { terms: true, privacy: false } as const;",
    guard: GUARD,
    expect: "5.1 a document is final only with no open point AND the owner's approval",
  },
  {
    id: "LEGAL-NC-OLD-ACCOUNTS-NEVER-ASKED",
    defect: "existing accounts are never asked to accept the final terms",
    file: "src/lib/legal/terms-acceptance.ts",
    find: '  return current.final && typeof provider === "string";',
    replace: "  return false;",
    guard: GUARD,
    expect: "5.12 once the terms are final, every existing account accepts them",
  },
  {
    id: "LEGAL-NC-GATE-UNMOUNTED",
    defect: "the acceptance gate is not mounted, so a Google sign-in skips the terms",
    file: "src/routes/__root.tsx",
    find: "        <TermsAcceptanceGate />\n",
    replace: "",
    guard: GUARD,
    expect: "5.5 the acceptance gate is mounted on every page",
  },
  {
    id: "LEGAL-NC-GOOGLE-ACCOUNT-SKIPPED",
    defect: "accounts from a provider are never asked",
    file: "src/lib/legal/terms-acceptance.ts",
    find: '  if (typeof provider === "string" && provider !== "email") return true;',
    replace: '  if (typeof provider === "string" && provider === "never") return true;',
    guard: GUARD,
    expect: "5.6 a Google account with no recorded acceptance is asked",
  },
  {
    id: "LEGAL-NC-DRAFT-AS-FINAL",
    defect: "a draft is published as final: no banner",
    file: "src/components/legal/LegalDocumentView.tsx",
    find: "          {!final && (",
    replace: "          {false && (",
    guard: GUARD,
    expect: "5.2 a draft shows the draft banner before any clause",
  },
  {
    id: "LEGAL-NC-DRAFT-INDEXED",
    defect: "the draft terms are offered to search engines",
    file: "src/routes/villkor.tsx",
    find: '      ...(TERMS_FINAL ? [] : [{ name: "robots", content: "noindex" }]),\n',
    replace: "",
    guard: GUARD,
    expect: "5.3 src/routes/villkor.tsx: a draft is noindex and rendered as a draft",
  },
  {
    id: "LEGAL-NC-FOOTER-NO-TERMS",
    defect: "the footer drops the terms link",
    file: "src/components/site/SiteFooter.tsx",
    find: "<Link to={TERMS_PATH} className={LEGAL_LINK}>",
    replace: "<Link to={PRIVACY_PATH} className={LEGAL_LINK}>",
    guard: GUARD,
    expect: "2.3 the footer links both documents and info@",
  },
];

runControls("launch-legal", MUTATIONS);
