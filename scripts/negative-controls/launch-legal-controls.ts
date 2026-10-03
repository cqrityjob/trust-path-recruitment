/**
 * Negative controls for the launch legal guard (scripts/launch-legal-check.ts).
 *
 * Each mutation plants one defect the guard exists for: the old company
 * name, an owner gap filled in by the code, a pre-ticked or optional terms
 * box, a Google signup that skips it, marketing consent riding on it, the
 * privacy policy presented as accepted, and a footer without the documents.
 *
 * Run: bun run negative-controls:launch-legal
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "launch-legal:check";
const DOCS = "src/lib/legal/documents.ts";
const PANEL = "src/components/auth/UnifiedAuthPanel.tsx";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "LEGAL-NC-OLD-COMPANY",
    defect: "the terms name the old company",
    file: DOCS,
    find: 'text: "Tjänsten tillhandahålls av Cqrityjob LLC, info@cqrityjob.com"',
    replace: 'text: "Tjänsten tillhandahålls av Cqrityjob AB info@cqrityjob.com"',
    guard: GUARD,
    expect: "1.1 the terms name Cqrityjob LLC and info@cqrityjob.com",
  },
  {
    id: "LEGAL-NC-GAP-FILLED",
    defect: "an undecided point of the privacy policy is filled in by the code",
    file: DOCS,
    find: 'text: "[Länk till aktuell leverantörsförteckning.]"',
    replace: 'text: "Se våra leverantörer."',
    guard: GUARD,
    expect: "1.7 the privacy policy's 6 undecided points are still open",
  },
  {
    id: "LEGAL-NC-SEVEN-DAYS-BACK",
    defect: "the untrue 7-day retention promise returns",
    file: DOCS,
    find: '["Supportärenden", "[Ange lagringstid enligt beslutad lagringsplan]"],',
    replace: '["Supportärenden", "7 dagar"],',
    guard: GUARD,
    expect:
      "1.8 no retention time is promised that nothing enforces: no 7-day line, both rows open",
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
