// Copy for the personal career home — authored as sv/en pairs beside the
// screens that read them, per the convention documented in copy.ts.
//
// Every string here is a STATUS or a DESTINATION, never a score, never a
// demand. "Merit" is the candidate-facing word for what the Passport holds.
// A candidate takes a TEST; "bedömning" is the employer's word and stays on
// employer surfaces. Nothing here says who a result is NOT shared with.

import type { CandidateInterviewStatus } from "@/lib/interview-intelligence/candidate.functions";
import { FIGURE_UNAVAILABLE, MERIT_FIGURE_WORDS } from "@/lib/professional-identity/merit-figures";
import type { StatusClassification } from "@/lib/professional-identity/next-best-action";
import type {
  ActivityKind,
  TestPhase,
  ToolKey,
} from "@/lib/professional-identity/home-presentation";
import type { MeritLabel } from "@/lib/professional-identity/passport-merits";
import type { ApplicationStatus } from "@/lib/job-intelligence/applications.functions";
import { c, cp, type Copy, type PluralCopy } from "./copy";

export const CLASSIFICATION: Readonly<Record<StatusClassification, Copy>> = {
  action_required: c("Kräver din åtgärd", "Needs your action"),
  new_for_you: c("Nytt för dig", "New for you"),
  in_progress_no_action: c("Pågår – inget krävs av dig", "In progress – nothing needed from you"),
  suggestion: c("Rekommenderat nästa steg", "Recommended next step"),
};

export const COMMON = {
  retry: c("Försök igen", "Try again"),
  unavailableShort: c("kunde inte läsas", "could not be read"),
} as const;

/* ------------------------------------------------------------------ */
/* The page header                                                     */
/* ------------------------------------------------------------------ */

export const HEADER = {
  title: c("Din karriär, {0}", "Your career, {0}"),
  titleAnon: c("Din karriär", "Your career"),
  lede: c(
    "Samla dina meriter, stärk ditt Security Passport och hitta nästa steg i säkerhetsbranschen.",
    "Gather your merits, strengthen your Security Passport and find your next step in the security sector.",
  ),
  noTitle: c("Yrkestitel inte ifylld", "Professional title not filled in"),
  noCountry: c("Arbetsland inte angett", "Work country not set"),
  editDetails: c("Redigera mina uppgifter", "Edit my details"),
  /** A fact about answered sections. Never a percentage, never a claim of
   *  quality: the details are filled in, not good. */
  basicsComplete: c("Grunduppgifter ifyllda", "Basic details filled in"),
  selfReported: c(
    "Uppgifterna här är självrapporterade. Det som är verifierat visas i ditt Security Passport.",
    "The information here is self-reported. What has been verified is shown in your Security Passport.",
  ),
  degraded: c(
    "Delar av din profil kunde inte läsas. Ingenting har tagits bort.",
    "Parts of your profile could not be read. Nothing has been removed.",
  ),
  failedTitle: c("Dina uppgifter kunde inte hämtas", "Your details could not be loaded"),
  failedBody: c(
    "Resten av sidan visar det som gick att läsa. Ingenting har tagits bort.",
    "The rest of the page shows what could be read. Nothing has been removed.",
  ),
  loading: c("Hämtar dina uppgifter…", "Loading your details…"),
} as const;

/* ------------------------------------------------------------------ */
/* The one recommended next step                                       */
/* ------------------------------------------------------------------ */

export const NEXT_ACTION = {
  heading: c("Nästa steg", "Next step"),
  calmTitle: c("Du är i fas", "You are up to date"),
  calmBody: c("Inget väntar på dig just nu.", "Nothing is waiting for you right now."),
  calmEmpty: c(
    "Öppna ditt Security Passport eller se lediga jobb när du vill.",
    "Open your Security Passport or browse open roles whenever you like.",
  ),
  deadline: c("Senast {0}", "By {0}"),
  loading: c("Hämtar ditt nästa steg…", "Loading your next step…"),
  failedTitle: c("Ditt nästa steg kunde inte avgöras", "Your next step could not be determined"),
  failedBody: c(
    "Dina uppgifter gick inte att läsa just nu, så ingen rekommendation kan göras. Du kan ändå öppna ditt Security Passport.",
    "Your details could not be read right now, so no recommendation can be made. You can still open your Security Passport.",
  ),
  failedPassportLink: c("Öppna mitt Security Passport", "Open my Security Passport"),
} as const;

/* ------------------------------------------------------------------ */
/* Security Passport                                                   */
/* ------------------------------------------------------------------ */

export const PASSPORT = {
  heading: c("Mitt Security Passport", "My Security Passport"),
  unreadable: c(
    "Dina meriter kunde inte läsas just nu. Ingenting har tagits bort.",
    "Your merits could not be read right now. Nothing has been removed.",
  ),
  notOpened: c(
    "Du har inte öppnat ditt Security Passport ännu.",
    "You have not opened your Security Passport yet.",
  ),
  notOpenedBody: c(
    "Passet är privat som standard. Du väljer själv vad du delar och med vem.",
    "The Passport is private by default. You choose what you share, and with whom.",
  ),
  // ── ONE VOCABULARY, TWO SURFACES ─────────────────────────────────────
  //
  // These five words are NOT authored here. They come from
  // lib/professional-identity/merit-figures.ts, which the Security Passport
  // workspace prints from as well, because authoring them twice is exactly
  // how "Registrerade" came to mean the bottom rung on one screen and the
  // total on the other — for the same person, on the same afternoon.
  //
  // `total` is named as a TOTAL. It used to be labelled "Registrerade
  // meriter" while holding `addedCount`, which contains the documented and
  // the source-confirmed ones; a reader adding the figures up got more
  // merits than they own.
  total: c(MERIT_FIGURE_WORDS.total_current.sv, MERIT_FIGURE_WORDS.total_current.en),
  registered: c(MERIT_FIGURE_WORDS.self_reported.sv, MERIT_FIGURE_WORDS.self_reported.en),
  underReview: c(MERIT_FIGURE_WORDS.open_cases.sv, MERIT_FIGURE_WORDS.open_cases.en),
  /** The SOURCE confirming a fact it was party to. Never a CQrityjob review;
   *  see PR #189, and `documented` below. */
  verified: c(MERIT_FIGURE_WORDS.source_confirmed.sv, MERIT_FIGURE_WORDS.source_confirmed.en),
  /** Reviewed by CQrityjob. Shown apart from the source-confirmed figure,
   *  because a document review is not the source confirming the merit. */
  documented: c(MERIT_FIGURE_WORDS.documented.sv, MERIT_FIGURE_WORDS.documented.en),
  expired: c(MERIT_FIGURE_WORDS.lapsed.sv, MERIT_FIGURE_WORDS.lapsed.en),
  /** A figure the request table could not answer for. Never "0", and never a
   *  second copy of the heading. */
  figureUnavailable: c(FIGURE_UNAVAILABLE.sv, FIGURE_UNAVAILABLE.en),
  drafts: c("Påbörjade meriter", "Unfinished merits"),
  /** Only a surface that reads every lifecycle can show this, and it is
   *  never folded into "Registrerade meriter". */
  archived: c("Arkiverade meriter", "Archived merits"),
  reviewUnknown: c("kunde inte läsas", "could not be read"),
  loading: c("Hämtar dina meriter…", "Loading your merits…"),
  explanation: c(
    "Dina egna uppgifter märks som tillagda av dig. En merit visas som verifierad först när källan själv har bekräftat den. Har CQrityjob granskat ett dokument visas meriten som dokumenterad.",
    "Your own entries are marked as added by you. A merit is shown as verified only once the source itself has confirmed it. Where CQrityjob has reviewed a document, the merit is shown as documented.",
  ),
  open: c("Öppna mitt Security Passport", "Open my Security Passport"),
  /** /passport/credentials/new creates a CREDENTIAL. The label says so. */
  addCredential: c("Lägg till ett intyg eller en utbildning", "Add a certificate or qualification"),
  clarification: cp(
    c("1 merit behöver en komplettering från dig", "1 merit needs something from you"),
    c("{0} meriter behöver en komplettering från dig", "{0} merits need something from you"),
  ),
} as const;

export const MERIT_LABEL: Readonly<Record<MeritLabel, Copy>> = {
  added_by_you: c("Tillagd av dig", "Added by you"),
  document_provided: c("Underlag bifogat", "Document provided"),
  verification_requested: c("Verifiering begärd", "Verification requested"),
  clarification_needed: c("Komplettering behövs", "More information needed"),
  documented: c("Dokumentgranskad av {0}", "Document reviewed by {0}"),
  verified: c("Verifierad av {0}", "Verified by {0}"),
  expired: c("Giltighet har gått ut", "Validity has expired"),
};

export const MERIT_VERIFIED_UNATTRIBUTED = c("Verifierad", "Verified");

/* ------------------------------------------------------------------ */
/* Career direction                                                    */
/* ------------------------------------------------------------------ */

export const CAREER = {
  heading: c("Din karriärbild", "Your career picture"),
  eyebrow: c("Baserat på din karriäranalys", "Based on your career analysis"),
  completed: c("Genomförd {0}", "Completed {0}"),
  topRole: c("Närmast din profil", "Closest to your profile"),
  alternatives: c("Andra möjliga riktningar", "Other possible directions"),
  strengths: c("Dina styrkor enligt analysen", "Your strengths according to the analysis"),
  guidance: c(
    "Det här är möjliga riktningar utifrån dina svar. Det är vägledning, inte ett bevis på kompetens, och ingen bedömning av om du får ett jobb.",
    "These are possible directions based on your answers. It is guidance, not proof of competence, and not a judgement about whether you will get a job.",
  ),
  noRolesNamed: c(
    "Din analys namnger inga enskilda yrken. Den beskriver hur du arbetar och vilka områden som passar dig.",
    "Your analysis names no individual professions. It describes how you work and which areas suit you.",
  ),
  frozenLocale: c(
    "Innehållet visas på det språk analysen genomfördes på.",
    "This content is shown in the language the analysis was taken in.",
  ),
  indicative: c(
    "Det här är den närmaste träffen i vår yrkeskatalog, inte ett fastställt matchningsresultat.",
    "This is the closest match in our profession catalogue, not an established matching result.",
  ),
  view: c("Se hela karriäranalysen", "See the full career analysis"),
  /** The catalogue is NOT filtered to the candidate's top three, and the
   *  label must not imply it is. Individual professions deep-link below. */
  explore: c("Utforska yrken och karriärvägar", "Explore professions and career paths"),
  openProfession: c("Läs om {0}", "Read about {0}"),
  history: c("Se mina karriäranalyser", "See my career analyses"),
  earlier: c("Tidigare karriäranalyser", "Earlier career analyses"),
  legacy: c(
    "Din senaste karriäranalys gjordes med en tidigare version. Den beskriver vilka områden som passar dig, men namnger inga enskilda yrken.",
    "Your most recent career analysis was taken with an earlier version. It describes which areas suit you, but names no individual professions.",
  ),
  noneTitle: c(
    "Upptäck vilka säkerhetsyrken som passar dig",
    "Discover which security professions suit you",
  ),
  noneBody: c(
    "Karriäranalysen ger dig en riktning utifrån hur du arbetar — inte ett betyg.",
    "The career analysis gives you a direction based on how you work — not a grade.",
  ),
  noneCta: c("Starta karriäranalysen", "Start the career analysis"),
  closed: c(
    "Den uppdaterade versionen är under granskning innan den öppnas för alla.",
    "The updated version is under review before it opens to everyone.",
  ),
  closedCta: c("Utforska yrken och karriärvägar", "Explore professions and career paths"),
  unreadable: c(
    "Din sparade karriäranalys kan inte visas i den här versionen. Den finns kvar och har inte tagits bort.",
    "Your saved career analysis cannot be shown in this version. It is still there and has not been removed.",
  ),
  unavailable: c(
    "Din karriäranalys kunde inte läsas just nu.",
    "Your career analysis could not be read right now.",
  ),
  loading: c("Hämtar din karriäranalys…", "Loading your career analysis…"),
} as const;

/* ------------------------------------------------------------------ */
/* Open roles                                                          */
/* ------------------------------------------------------------------ */

export const JOBS = {
  heading: c("Lediga jobb", "Open roles"),
  /** The filter IS the career analysis. Never "the profession you entered". */
  basisAnalysis: c(
    "Urvalet bygger på den yrkesinriktning som framgår av din karriäranalys.",
    "The selection is based on the professional direction your career analysis indicates.",
  ),
  /** No filter exists: these are the newest vacancies, and say so. */
  general: c(
    "Utforska lediga jobb inom säkerhetsbranschen.",
    "Explore open roles across the security sector.",
  ),
  generalHint: c(
    "Gör karriäranalysen för att få jobb inom din inriktning här.",
    "Take the career analysis to see roles within your direction here.",
  ),
  filteredEmptyTitle: c(
    "Vi hittade inga jobb inom din inriktning just nu",
    "We found no roles within your direction right now",
  ),
  filteredEmptyBody: c(
    "Nya jobb publiceras löpande. Du kan se alla lediga jobb, eller se hela karriäranalysen som urvalet bygger på.",
    "New roles are published continuously. You can see all open roles, or the full career analysis the selection is based on.",
  ),
  all: c("Se alla jobb", "See all jobs"),
  seeAnalysis: c("Se karriäranalysen", "See the career analysis"),
  unavailable: c(
    "Lediga jobb kunde inte hämtas just nu.",
    "Open roles could not be loaded right now.",
  ),
  loading: c("Hämtar lediga jobb…", "Loading open roles…"),
} as const;

/* ------------------------------------------------------------------ */
/* Applications                                                        */
/* ------------------------------------------------------------------ */

export const APPLICATIONS = {
  title: c("Mina ansökningar", "My applications"),
  active: cp(
    c("1 aktiv ansökan", "1 active application"),
    c("{0} aktiva ansökningar", "{0} active applications"),
  ),
  none: c("Du har inte sökt något jobb ännu.", "You have not applied for anything yet."),
  onlyHistory: cp(
    c("1 avslutad ansökan", "1 concluded application"),
    c("{0} avslutade ansökningar", "{0} concluded applications"),
  ),
  latestActive: c("Senast uppdaterad", "Most recently updated"),
  cta: c("Följ mina ansökningar", "Track my applications"),
  unavailable: c(
    "Dina ansökningar kunde inte hämtas just nu.",
    "Your applications could not be loaded right now.",
  ),
  loading: c("Hämtar dina ansökningar…", "Loading your applications…"),
  interviews: cp(
    c("1 intervju pågår", "1 interview under way"),
    c("{0} intervjuer pågår", "{0} interviews under way"),
  ),
  /** The application-scoped Passport disclosure lives on the applications
   *  page, per application. Named here so the home can point at it. */
  disclosureHint: c(
    "Där väljer du också vilka meriter varje arbetsgivare får se.",
    "That is also where you choose which merits each employer may see.",
  ),
} as const;

export const APPLICATION_STATUS: Readonly<Record<ApplicationStatus, Copy>> = {
  submitted: c("Skickad", "Submitted"),
  reviewing: c("Under granskning hos arbetsgivaren", "Being reviewed by the employer"),
  interview: c("Intervjusteg", "Interview stage"),
  rejected: c("Arbetsgivaren gick vidare med någon annan", "The employer went with someone else"),
  hired: c("Erbjuden tjänsten", "Offered the role"),
  withdrawn: c("Återkallad av dig", "Withdrawn by you"),
};

export const INTERVIEW_STATUS: Readonly<Record<CandidateInterviewStatus, Copy>> = {
  interview_offered: c(
    "Intervju erbjuden — förbered dig inför intervjun",
    "Interview offered — prepare for your interview",
  ),
  interview_in_progress: c("Intervjun pågår", "Interview in progress"),
  employer_process_continuing: c(
    "Intervjun är genomförd. Arbetsgivarens process fortsätter.",
    "Interview completed. The employer's process continues.",
  ),
};

/* ------------------------------------------------------------------ */
/* Tests and results · Training and development                        */
/* ------------------------------------------------------------------ */

export const EMPLOYER_WORK = {
  heading: c("Arbetsgivarprocesser", "Employer processes"),
  testsTitle: c("Tester och resultat", "Tests and results"),
  developmentTitle: c("Utbildning och kompetensutveckling", "Training and development"),
  /** Recruitment: the organisation REQUESTED a test; the person is an
   *  applicant, never an employee. */
  requestedBy: c("Begärt av {0}", "Requested by {0}"),
  assignedBy: c("Tilldelat av {0}", "Assigned by {0}"),
  forRole: c("för tjänsten {0}", "for the role {0}"),
  recruitmentTest: c("Rekryteringstest", "Recruitment test"),
  workforceTest: c("Test", "Test"),
  progress: c("{0} besvarade", "{0} answered"),
  modules: c("{0} moduler klara", "{0} modules done"),
  deadline: c("Senast {0}", "By {0}"),
  released: c("Delat med dig {0}", "Shared with you {0}"),
  open: c("Öppna testet", "Open the test"),
  openTraining: c("Öppna utbildningen", "Open the training"),
  readResult: c("Läs resultatet", "Read the result"),
  /** The only item is the recommended step above. Never "no test exists". */
  testFeaturedAbove: c(
    "Testet visas som rekommenderat nästa steg ovan.",
    "The test is shown as the recommended next step above.",
  ),
  trainingFeaturedAbove: c(
    "Utbildningen visas som rekommenderat nästa steg ovan.",
    "The training is shown as the recommended next step above.",
  ),
  testsNone: c(
    "Ingen arbetsgivare har bett dig göra ett test.",
    "No employer has asked you to take a test.",
  ),
  developmentNone: c(
    "Ingen arbetsgivare har tilldelat dig en utbildning.",
    "No employer has assigned you any training.",
  ),
  unavailable: c(
    "Dina tester kunde inte hämtas just nu.",
    "Your tests could not be loaded right now.",
  ),
  loading: c("Hämtar dina tester…", "Loading your tests…"),
  all: c("Öppna Tester & utveckling", "Open Tests & development"),
  /** Passive, and says outright that nothing is required. Both numbers. */
  waiting: cp(
    c(
      "1 test väntar på resultat från arbetsgivaren. Du behöver inte göra något just nu.",
      "1 test is awaiting its result from the employer. You do not need to do anything right now.",
    ),
    c(
      "{0} tester väntar på resultat från arbetsgivaren. Du behöver inte göra något just nu.",
      "{0} tests are awaiting their results from the employer. You do not need to do anything right now.",
    ),
  ),
  /** Not a merit, not evidence. Said where a result is listed. */
  resultNotEvidence: c(
    "Ett testresultat är arbetsgivarens underlag i den processen. Det blir inte en merit i ditt Security Passport.",
    "A test result is the employer's material in that process. It does not become a merit in your Security Passport.",
  ),
} as const;

/** What each pipeline phase is called to the candidate. Only the explicit
 *  states the pipeline supports are described as waiting. */
export const TEST_PHASE: Readonly<Record<TestPhase, Copy>> = {
  action: c("Kräver din åtgärd", "Needs your action"),
  waiting: c("Väntar på resultat från arbetsgivaren", "Awaiting the employer's result"),
  released: c("Resultat delat med dig", "Result shared with you"),
  abandoned: c("Avbrutet", "Cancelled"),
  unknown: c("Status kunde inte tolkas", "Status could not be interpreted"),
};

/* ------------------------------------------------------------------ */
/* Career tools                                                        */
/* ------------------------------------------------------------------ */

export const TOOLS = {
  heading: c("Karriärverktyg", "Career tools"),
} as const;

export const TOOL: Readonly<Record<ToolKey, { title: Copy; existingTitle?: Copy; body: Copy }>> = {
  cv: {
    title: c("Skapa CV från mina meriter", "Create a CV from my merits"),
    existingTitle: c("Öppna mitt CV", "Open my CV"),
    body: c(
      "Byggt av de meriter du redan har registrerat. Ingenting läggs till som du inte själv har fyllt i.",
      "Built from the merits you have already recorded. Nothing is added that you did not fill in yourself.",
    ),
  },
  career_card: {
    title: c("Visa mitt Career Card", "View my Career Card"),
    body: c(
      "Dina yrkesrekommendationer från karriäranalysen i ett kort du själv väljer att dela. Career Card är karriärvägledning och är inte ett verifieringsbevis.",
      "Your profession recommendations from the career analysis, in a card you choose to share. The Career Card is career guidance, not proof of verification.",
    ),
  },
  professions: {
    title: c("Yrken och karriärvägar", "Professions and career paths"),
    body: c(
      "Se vad olika säkerhetsroller innebär och vad de kräver.",
      "See what different security roles involve and require.",
    ),
  },
  profile: {
    title: c("Mina uppgifter", "My details"),
    body: c(
      "Det du själv har registrerat, avsnitt för avsnitt.",
      "What you have recorded about yourself, section by section.",
    ),
  },
};

/* ------------------------------------------------------------------ */
/* Recent activity                                                     */
/* ------------------------------------------------------------------ */

export const ACTIVITY = {
  heading: c("Senaste aktivitet", "Recent activity"),
  today: c("idag", "today"),
  yesterday: c("igår", "yesterday"),
  all: c("Visa all aktivitet", "Show all activity"),
  partial: c(
    "Delar av din aktivitet kunde inte hämtas.",
    "Parts of your activity could not be loaded.",
  ),
  unavailable: c(
    "Din aktivitet kunde inte hämtas just nu.",
    "Your activity could not be loaded right now.",
  ),
} as const;

/** {0} is the merit, the employer or the title, where the row has one. */
export const ACTIVITY_LINE: Readonly<Record<ActivityKind, { with: Copy; without: Copy }>> = {
  report_released: {
    with: c("Resultat från {0} delat med dig", "Result from {0} shared with you"),
    without: c("Ett testresultat delades med dig", "A test result was shared with you"),
  },
  verification_approved: {
    with: c(
      "{0} verifierades i ditt Security Passport",
      "{0} was verified in your Security Passport",
    ),
    without: c(
      "En merit i ditt Security Passport verifierades",
      "A merit in your Security Passport was verified",
    ),
  },
  /** The decision stands; the merit it was about is no longer current. Said
   *  so the feed can never contradict a Passport summary counting current
   *  merits only. */
  verification_approved_archived: {
    with: c(
      "{0} verifierades · meriten är sedan dess arkiverad",
      "{0} was verified · the merit has since been archived",
    ),
    without: c(
      "En merit verifierades · meriten är sedan dess arkiverad",
      "A merit was verified · the merit has since been archived",
    ),
  },
  verification_rejected: {
    with: c("Beslut om {0}", "Decision on {0}"),
    without: c(
      "Beslut om en merit i ditt Security Passport",
      "A decision about a merit in your Security Passport",
    ),
  },
  interview_offered: {
    with: c("Intervju erbjuden av {0}", "Interview offered by {0}"),
    without: c("Intervju erbjuden", "Interview offered"),
  },
  interview_in_progress: {
    with: c("Intervju pågår · {0}", "Interview in progress · {0}"),
    without: c("Intervju pågår", "Interview in progress"),
  },
  interview_completed: {
    with: c("Intervju genomförd · {0}", "Interview completed · {0}"),
    without: c("Intervju genomförd", "Interview completed"),
  },
  application_submitted: {
    with: c("Ansökan skickad · {0}", "Application sent · {0}"),
    without: c("Ansökan skickad", "Application sent"),
  },
};

/* ------------------------------------------------------------------ */
/* Link an earlier result                                              */
/* ------------------------------------------------------------------ */

export const LINK_EARLIER = {
  title: c("Koppla ett tidigare testresultat", "Link an earlier test result"),
  body: c(
    "Du har gjort ett arbetsgivartilldelat test med den här e-postadressen innan du hade ett konto. Koppla resultatet till ditt konto, så sparas det som en rapport du kan öppna. Det blir inte en merit i ditt Security Passport.",
    "You completed an employer-assigned test with this email address before you had an account. Link the result to your account and it is saved as a report you can open. It does not become a merit in your Security Passport.",
  ),
  cta: c("Koppla resultatet till mitt konto", "Link the result to my account"),
  pending: c("Kopplar…", "Linking…"),
  success: c("Resultatet är kopplat till ditt konto.", "The result is now linked to your account."),
  /** Linking creates a career report (assessment_runs), which is what the
   *  link opens. Never "open the test": the attempt is not what was made. */
  open: c("Öppna rapporten", "Open the report"),
  failed: c(
    "Kopplingen misslyckades. Ingenting har ändrats.",
    "The link failed. Nothing has changed.",
  ),
  retry: c("Försök igen", "Try again"),
} as const;

/** Kept for the profile page's own hero, which shares this module. */
export const GREETING = {
  noTitle: HEADER.noTitle,
  experienceYears: c("{0} års erfarenhet", "{0} years of experience"),
  viewProfile: c("Visa profil", "View profile"),
  editProfile: c("Redigera profil", "Edit profile"),
  basicsComplete: HEADER.basicsComplete,
  selfReported: HEADER.selfReported,
  degraded: HEADER.degraded,
  retry: COMMON.retry,
  welcome: c("Välkommen tillbaka, {0}", "Welcome back, {0}"),
  welcomeAnon: c("Välkommen tillbaka", "Welcome back"),
  lede: c(
    "Här är det viktigaste i din karriär just nu.",
    "Here is what matters most in your career right now.",
  ),
} as const;

export type { Copy, PluralCopy };

/* ------------------------------------------------------------------ */
/* The hub — the six areas, and the compact status of four of them     */
/* ------------------------------------------------------------------ */

/**
 * ── WHY THE LABELS ARE HERE AND NOT IN THE DICTIONARY ─────────────────
 *
 * candidate-app-nav.ts keeps the PRIMARY navigation's labels in
 * dictionaries.ts, because those five strings are chrome read on every
 * page of the product by several components. These six are read by one
 * component on one area, which is exactly the case copy.ts describes as
 * belonging beside its screen — the same rule that put the Passport
 * shell's own tab labels in the Passport's copy module.
 *
 * The names themselves are NOT new. "Karriäranalys" is what CAREER.view
 * has called the result since the vocabulary cleanup, "Security Passport"
 * and "CV" are the product names, and one-name-per-product is asserted
 * over this file by candidate-app-navigation:check.
 */
export const HUB = {
  navAria: c("Min karriär – avsnitt", "My Career — sections"),
  sections: {
    overview: c("Översikt", "Overview"),
    passport: c("Security Passport", "Security Passport"),
    cv: c("CV", "CV"),
    // The RESULT, which is what a tab points at. "Career Discovery" is the
    // product that produces it and stays the product's name; a Swedish
    // string may not say it, and T15 asserts that.
    discovery: c("Karriäranalys", "Career analysis"),
    applications: c("Ansökningar", "Applications"),
    // The screen where a holder decides what leaves their Passport. Named
    // for the decision, not for the link it produces.
    sharing: c("Delning", "Sharing"),
  },
} as const;

/**
 * The compact status modules.
 *
 * ── EACH ONE SAYS WHAT IS TRUE AND STOPS ──────────────────────────────
 *
 * A hub module has room for one fact, so the fact has to be the right
 * one. None of these is a percentage, a score or a completion bar: the
 * overview reports STATE — how many, how recent, what is open — and the
 * destination holds the detail. "You have no saved CV yet" and "your CVs
 * could not be loaded" are different sentences for different situations,
 * and neither is ever shown while a read is still in flight.
 */
export const HUB_TILE = {
  loading: c("Hämtar…", "Loading…"),
  unavailable: c("Kunde inte hämtas just nu.", "Could not be loaded right now."),
  retry: COMMON.retry,

  cv: {
    title: c("CV", "CV"),
    none: c(
      "Du har inget sparat CV ännu. Ett CV byggs av de meriter du redan har registrerat.",
      "You have no saved CV yet. A CV is built from the merits you have already recorded.",
    ),
    saved: cp(c("1 sparat CV", "1 saved CV"), c("{0} sparade CV", "{0} saved CVs")),
    latest: c("Senast ändrat {0}", "Last changed {0}"),
    create: c("Skapa mitt första CV", "Create my first CV"),
    open: c("Öppna mina CV", "Open my CVs"),
  },

  discovery: {
    title: c("Karriäranalys", "Career analysis"),
    none: c(
      "Du har inte gjort karriäranalysen ännu.",
      "You have not taken the career analysis yet.",
    ),
    // Career Discovery is gated on a tester allowlist for the signed-in
    // run. Saying "start it" to somebody who cannot is a dead end wearing
    // a primary button, so the closed state says what is true instead.
    closed: c(
      "Karriäranalysen är inte öppen för nya deltagare just nu.",
      "The career analysis is not open to new participants right now.",
    ),
    // A result EXISTS and this build cannot render it. It is not "not
    // taken yet", and telling somebody who answered twenty-eight questions
    // that they never did is the worst thing this module could say.
    unreadable: c(
      "Du har ett resultat, men det kan inte visas i den här versionen.",
      "You have a result, but it cannot be shown in this version.",
    ),
    completed: c("Genomförd {0}", "Completed {0}"),
    topRole: c("Närmast din profil: {0}", "Closest to your profile: {0}"),
    noRolesNamed: c(
      "Analysen namnger inga enskilda yrken.",
      "The analysis names no individual professions.",
    ),
    start: c("Gör karriäranalysen", "Take the career analysis"),
    open: c("Se hela karriäranalysen", "See the full career analysis"),
    jobs: c("Se lediga jobb inom området", "See open roles in this area"),
  },

  applications: {
    title: c("Ansökningar", "Applications"),
    none: c("Du har inte sökt något jobb ännu.", "You have not applied for anything yet."),
    findJobs: c("Hitta jobb", "Find jobs"),
    open: c("Följ mina ansökningar", "Track my applications"),
  },

  sharing: {
    title: c("Delning", "Sharing"),
    none: c(
      "Du har ingen aktiv delningslänk. Du bestämmer vad som delas och kan återkalla en länk när som helst.",
      "You have no active share link. You decide what is shared and can revoke a link at any time.",
    ),
    active: cp(
      c("1 aktiv delningslänk", "1 active share link"),
      c("{0} aktiva delningslänkar", "{0} active share links"),
    ),
    // The count is of links the holder created and has not revoked. It is
    // NOT a read receipt and must never be described as one — the access
    // count on a share includes the holder's own preview.
    nextExpiry: c("Nästa upphör {0}", "Next expires {0}"),
    create: c("Dela valda meriter", "Share selected merits"),
    open: c("Hantera mina delningslänkar", "Manage my share links"),
  },
} as const;
