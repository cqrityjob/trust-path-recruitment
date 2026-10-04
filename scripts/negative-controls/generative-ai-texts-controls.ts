/**
 * Negative controls for the generative-AI texts guard
 * (scripts/generative-ai-texts-check.ts).
 *
 * Each mutation brings back one promise the owner removed on 2026-10-04: the
 * home page naming AI support, the CV button asking an AI for a draft, the CV
 * notice saying data goes to an AI service, the candidate page describing an AI
 * assistant, a new AI promise on a public page, and the server gate opened
 * while the version-1 texts still stand.
 *
 * Run: bun run negative-controls:generative-ai-texts
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "generative-ai-texts:check";
const DICT = "src/i18n/dictionaries.ts";
const CV_COPY = "src/components/professional-identity/cv-copy.ts";
const SAVED = "src/routes/_authenticated.my-career.cv.$cvId.tsx";
const CANDIDATE = "src/routes/_authenticated.my-career.interviews.$caseId.tsx";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "AITEXT-NC-HERO",
    defect: "the home page names AI support again",
    file: DICT,
    find: '"Karriär, säkerhetsjobb och verifierbara meriter på ett ställe. Rekryteringsverktyg för arbetsgivare – på samma plats."',
    replace:
      '"Jobb, kompetens, Security Passport och AI-stöd för ditt säkerhetsarbete. Rekryteringsverktyg för arbetsgivare – på samma plats."',
    guard: GUARD,
    expect: "sv: the positioning opens with the owner's sentence",
  },
  {
    id: "AITEXT-NC-INDIVIDUAL",
    defect: "the individual entrance invites people to explore AI support",
    file: DICT,
    find: '"Hitta jobb, utveckla din kompetens och bygg ditt Security Passport."',
    replace:
      '"Hitta jobb, utveckla din kompetens, bygg ditt Security Passport och utforska AI-stöd för ditt säkerhetsarbete."',
    guard: GUARD,
    expect: "sv: the hero positioning and the individual entrance mention no AI",
  },
  {
    id: "AITEXT-NC-CV-BUTTON",
    defect: "the CV button asks for an AI draft again",
    file: CV_COPY,
    find: 'regenerate: c("Skapa nytt CV-utkast", "Create a new CV draft"),',
    replace: 'regenerate: c("Skapa nytt AI-utkast", "Create a new AI draft"),',
    guard: GUARD,
    expect: "the CV button reads",
  },
  {
    id: "AITEXT-NC-CV-BUTTON-UNGATED",
    defect: "the AI draft button is shown whether or not generative AI is on",
    file: SAVED,
    find: "{GENERATIVE_AI_ENABLED ? (",
    replace: "{true ? (",
    guard: GUARD,
    expect: "the AI draft button is shown only when generative AI is on",
  },
  {
    id: "AITEXT-NC-CV-NOTICE",
    defect: "the CV notice says the entries are sent to an AI service",
    file: CV_COPY,
    find: '"Ditt CV byggs direkt av de uppgifter du valt ovan. Inga uppgifter skickas till någon AI-tjänst.",',
    replace:
      '"Om du väljer ett AI-utkast skickas de uppgifter du valt ovan till den AI-tjänst som är konfigurerad för CQrityjob, för att formuleras om.",',
    guard: GUARD,
    expect: "the notice before the preview says no information is sent to an AI service",
  },
  {
    id: "AITEXT-NC-CANDIDATE-PAGE",
    defect: "the candidate's page describes an AI assistant again",
    file: CANDIDATE,
    find: '"Arbetsgivaren använder ett strukturerat metodstöd för intervjun och bedömningen. Det är en människa som granskar underlaget och fattar beslut.",',
    replace:
      '"Ett AI-stöd hjälper arbetsgivaren att strukturera underlaget och föreslå var i dina svar det finns konkret information.",',
    guard: GUARD,
    expect: "sv: the page says the owner's two sentences",
  },
  {
    id: "AITEXT-NC-NEW-PROMISE",
    defect: "a public page gains an AI promise",
    file: DICT,
    find: '"about.cta.employers": "För arbetsgivare",',
    replace: '"about.cta.employers": "För arbetsgivare med AI-stöd",',
    guard: GUARD,
    expect: "sv: no public text promises AI",
  },
  {
    id: "AITEXT-NC-GATE-OPENED",
    defect: "the server gate is opened while the version-1 texts still stand",
    file: "src/lib/ai/generative-ai-gate.ts",
    find: "export const GENERATIVE_AI_ENABLED = false;",
    replace: "export const GENERATIVE_AI_ENABLED = true;",
    guard: GUARD,
    expect: "the version-1 texts stand only while the server gate is closed",
  },
  {
    id: "AITEXT-NC-SW-BUILT-FOR-AI",
    defect: "the public Security work page says the workspace is built for AI again",
    file: DICT,
    find: '"AI-stöd ingår inte i den här versionen av arbetsytan, och inget av det du skriver skickas till någon AI-tjänst. Om sådant stöd erbjuds senare gäller samma princip. AI hjälper dig med arbetet. Du ansvarar för besluten.",',
    replace:
      '"Arbetsytan är byggd för AI-stöd som kan föreslå kompletteringsfrågor och ta fram utkast. AI-stödet är ännu inte aktiverat.",',
    guard: GUARD,
    expect: "sv: the public Security work page says AI support is not part of this version",
  },
  {
    id: "AITEXT-NC-METHOD-AI",
    defect: "the interview method text says AI may suggest again",
    file: DICT,
    find: '"Intervjun följer CQrityjobs metod. Frågorna är låsta till intervjuguiden, och varje bedömning och beslut är ditt.",',
    replace:
      '"Intervjun följer CQrityjobs metod. Frågorna är låsta till intervjuguiden, AI får bara föreslå, och varje bedömning och beslut är ditt.",',
    guard: GUARD,
    expect: "sv: the interview method text mentions no AI",
  },
  {
    id: "AITEXT-NC-MANDATE-HINT-UNGUARDED",
    defect: "the mandate hint promises a Security AI draft whether or not AI is available",
    file: "src/components/security-work/Mandate.tsx",
    find: "            {aiAvailable\n              ? l(",
    replace: "            {true\n              ? l(",
    guard: GUARD,
    expect: "Mandate.tsx:",
  },
  {
    id: "AITEXT-NC-AIDRAFT-INTRO-UNGUARDED",
    defect: "the analysis panel says AI proposes report text even when AI is off",
    file: "src/components/security-work/AiDraft.tsx",
    find: '        {status.data?.enabled && (\n          <p className="text-sm text-muted-foreground">',
    replace: '        {true && (\n          <p className="text-sm text-muted-foreground">',
    guard: GUARD,
    expect: "AiDraft.tsx:",
  },
];

runControls("generative-ai-texts", MUTATIONS);
