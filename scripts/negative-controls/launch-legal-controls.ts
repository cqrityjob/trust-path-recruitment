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
    find: '"text": "Tjänsten tillhandahålls av Cqrityjob LLC, info@cqrityjob.com"',
    replace: '"text": "Tjänsten tillhandahålls av Cqrityjob AB info@cqrityjob.com"',
    guard: GUARD,
    expect: "1.1 the terms name Cqrityjob LLC and info@cqrityjob.com",
  },
  {
    id: "LEGAL-NC-GAP-FILLED",
    defect: "an undecided age limit is filled in by the code",
    file: DOCS,
    find: '"text": "[Ange beslutad åldersgräns och eventuella regler för minderåriga användare.]"',
    replace: '"text": "Du måste vara minst 16 år."',
    guard: GUARD,
    expect: "1.6 the owner's undecided points are still open: 2 in the terms",
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
    find: "              terms_version: TERMS_VERSION,\n",
    replace:
      "              terms_version: TERMS_VERSION,\n              marketing_consent: termsAccepted,\n",
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
