// Copy for the personal career home — authored as sv/en pairs beside the
// screens that read them, per the convention documented in copy.ts.
//
// Every string here is a STATUS or a DESTINATION, never a score, never a
// demand. The three classifications from the brief are named in words so
// nothing depends on seeing a colour, and a suggestion is called a
// recommendation rather than dressed as a requirement.
//
// ── TWO WORDS THAT ARE BANNED HERE ─────────────────────────────────────
//
// "uppgift" and "rapport" without an object, and "klar" without a subject.
// "Din uppgift är klar" tells a person nothing: which entry, finished by
// whom, and for what. Every sentence below names the thing it is about.
// "Merit" is the candidate-facing word for what the Passport holds, and it
// is used consistently — a merit is a credential, an education, a language,
// a skill or an employment the person has recorded.

import type { CandidateInterviewStatus } from "@/lib/interview-intelligence/candidate.functions";
import type { StatusClassification } from "@/lib/professional-identity/next-best-action";
import type { ActivityKind, ToolKey } from "@/lib/professional-identity/home-presentation";
import type { MeritLabel } from "@/lib/professional-identity/passport-merits";
import type { ApplicationStatus } from "@/lib/job-intelligence/applications.functions";
import { c, cp, type Copy, type PluralCopy } from "./copy";

/* ------------------------------------------------------------------ */
/* Classification chips                                                */
/* ------------------------------------------------------------------ */

export const CLASSIFICATION: Readonly<Record<StatusClassification, Copy>> = {
  action_required: c("Kräver din åtgärd", "Needs your action"),
  new_for_you: c("Nytt för dig", "New for you"),
  in_progress_no_action: c("Pågår – inget krävs av dig", "In progress – nothing needed from you"),
  suggestion: c("Rekommenderat nästa steg", "Recommended next step"),
};

/* ------------------------------------------------------------------ */
/* The page header                                                     */
/* ------------------------------------------------------------------ */

export const HEADER = {
  /** {0} is the preferred name, or the account first name. When neither
   *  exists the page uses `titleAnon` rather than greeting a blank. */
  title: c("Din karriär, {0}", "Your career, {0}"),
  titleAnon: c("Din karriär", "Your career"),
  lede: c(
    "Samla dina meriter, stärk ditt Security Passport och hitta nästa steg i säkerhetsbranschen.",
    "Gather your merits, strengthen your Security Passport and find your next step in the security sector.",
  ),
  noTitle: c("Yrkestitel inte ifylld", "Professional title not filled in"),
  noCountry: c("Arbetsland inte angett", "Work country not set"),
  editDetails: c("Redigera mina uppgifter", "Edit my details"),
  /** Said only when every basic section is answered. Never a percentage,
   *  and never a claim about quality: the profile is filled in, not good. */
  basicsComplete: c("Grundprofil komplett", "Basic profile complete"),
  selfReported: c(
    "Uppgifterna här är självrapporterade. Det som är verifierat visas i ditt Security Passport.",
    "The information here is self-reported. What has been verified is shown in your Security Passport.",
  ),
  degraded: c(
    "Delar av din profil kunde inte läsas. Ingenting har tagits bort.",
    "Parts of your profile could not be read. Nothing has been removed.",
  ),
  retry: c("Försök igen", "Try again"),
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
} as const;

/* ------------------------------------------------------------------ */
/* Security Passport                                                   */
/* ------------------------------------------------------------------ */

export const PASSPORT = {
  heading: c("Mitt Security Passport", "My Security Passport"),
  eyebrow: c("Dina meriter", "Your merits"),
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

  /** The three figures the brief names, each a count of merits and never a
   *  share of a whole. */
  registered: c("Registrerade meriter", "Recorded merits"),
  underReview: c("Under verifiering", "Being verified"),
  verified: c("Verifierade meriter", "Verified merits"),
  /** A fourth, shown only when it is non-zero: a merit whose validity has
   *  lapsed is not a current merit and must not sit inside "verified". */
  expired: c("Giltighet har gått ut", "Validity has expired"),
  drafts: c("Påbörjade meriter", "Unfinished merits"),
  reviewUnknown: c("kunde inte läsas", "could not be read"),
  loading: c("Hämtar dina meriter…", "Loading your merits…"),

  explanation: c(
    "Dina egna uppgifter märks som tillagda av dig. En merit visas som verifierad först när en behörig part har bekräftat den.",
    "Your own entries are marked as added by you. A merit is shown as verified only once an authorised party has confirmed it.",
  ),

  open: c("Öppna mitt Security Passport", "Open my Security Passport"),
  add: c("Lägg till en merit", "Add a merit"),
  clarification: cp(
    c("1 merit behöver en komplettering från dig", "1 merit needs something from you"),
    c("{0} meriter behöver en komplettering från dig", "{0} merits need something from you"),
  ),
} as const;

/**
 * The six labels a merit may carry.
 *
 * Every one is a sentence about the MERIT, never about the person: this
 * product never says somebody is verified. `verified` takes the verifying
 * organisation's name, and says what was confirmed and when beside it.
 */
export const MERIT_LABEL: Readonly<Record<MeritLabel, Copy>> = {
  added_by_you: c("Tillagd av dig", "Added by you"),
  document_provided: c("Underlag bifogat", "Document provided"),
  verification_requested: c("Verifiering begärd", "Verification requested"),
  clarification_needed: c("Komplettering behövs", "More information needed"),
  /** {0} is the organisation that DECIDED — never the issuer. */
  verified: c("Verifierad av {0}", "Verified by {0}"),
  expired: c("Giltighet har gått ut", "Validity has expired"),
};

/** When a verified merit's decision record names nobody — rows predating
 *  the rule that an approval must state its decider. */
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

  /** The sentence that keeps guidance from reading as a verdict. */
  guidance: c(
    "Det här är möjliga riktningar utifrån dina svar. Det är vägledning, inte ett bevis på kompetens, och ingen bedömning av om du får ett jobb.",
    "These are possible directions based on your answers. It is guidance, not proof of competence, and not a judgement about whether you will get a job.",
  ),
  /** Said when the analysis named strengths but no occupation. */
  noRolesNamed: c(
    "Din analys namnger inga enskilda yrken. Den beskriver hur du arbetar och vilka områden som passar dig.",
    "Your analysis names no individual professions. It describes how you work and which areas suit you.",
  ),
  /** Said when the stored result is in the other language. */
  frozenLocale: c(
    "Innehållet visas på det språk analysen genomfördes på.",
    "This content is shown in the language the analysis was taken in.",
  ),
  /** `indicative` confidence: the closest in the catalogue, and no more. */
  indicative: c(
    "Det här är den närmaste träffen i vår yrkeskatalog, inte ett fastställt matchningsresultat.",
    "This is the closest match in our profession catalogue, not an established matching result.",
  ),

  view: c("Se hela karriäranalysen", "See the full career analysis"),
  /** The v2.1 instrument named career AREAS and no occupation. Saying so is
   *  better than showing an empty "top profession" for a real result. */
  legacy: c(
    "Din senaste karriäranalys gjordes med en tidigare version. Den beskriver vilka områden som passar dig, men namnger inga enskilda yrken.",
    "Your most recent career analysis was taken with an earlier version. It describes which areas suit you, but names no individual professions.",
  ),
  earlier: c("Tidigare karriäranalyser", "Earlier career analyses"),
  explore: c("Utforska matchande yrken", "Explore matching professions"),

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
  unreadableCta: c("Se mina karriäranalyser", "See my career analyses"),
  unavailable: c(
    "Din karriäranalys kunde inte läsas just nu.",
    "Your career analysis could not be read right now.",
  ),
  loading: c("Hämtar din karriäranalys…", "Loading your career analysis…"),
} as const;

/* ------------------------------------------------------------------ */
/* Job recommendations                                                 */
/* ------------------------------------------------------------------ */

export const JOBS = {
  heading: c("Lediga jobb", "Open roles"),
  /** Says exactly what the filter did, and claims nothing more. */
  basis: c(
    "Urvalet bygger på det yrkesområde du har angett, inte på en personlig matchning.",
    "The selection is based on the professional area you stated, not on a personal match.",
  ),
  emptyTitle: c(
    "Vi hittade inga jobb som matchar din inriktning just nu",
    "We found no jobs matching your direction right now",
  ),
  emptyBody: c(
    "Du kan se alla lediga jobb eller komplettera dina uppgifter för bättre rekommendationer.",
    "You can see all open roles, or complete your details for better recommendations.",
  ),
  all: c("Se alla jobb", "See all jobs"),
  completeProfile: c("Komplettera mina uppgifter", "Complete my details"),
  unavailable: c(
    "Lediga jobb kunde inte hämtas just nu.",
    "Open roles could not be loaded right now.",
  ),
} as const;

/* ------------------------------------------------------------------ */
/* Applications, tests and results                                     */
/* ------------------------------------------------------------------ */

export const WORK = {
  heading: c("Ansökningar, tester och resultat", "Applications, tests and results"),

  applicationsTitle: c("Mina ansökningar", "My applications"),
  applicationsActive: cp(
    c("1 aktiv ansökan", "1 active application"),
    c("{0} aktiva ansökningar", "{0} active applications"),
  ),
  applicationsNone: c(
    "Du har inte sökt något jobb ännu.",
    "You have not applied for anything yet.",
  ),
  applicationsLatest: c("Senast: {0}", "Most recent: {0}"),
  applicationsCta: c("Följ mina ansökningar", "Track my applications"),
  applicationsUnavailable: c(
    "Dina ansökningar kunde inte hämtas just nu.",
    "Your applications could not be loaded right now.",
  ),

  testsTitle: c("Tester och resultat", "Tests and results"),
  testsNone: c(
    "Ingen arbetsgivare har bett dig göra ett test.",
    "No employer has asked you to take a test.",
  ),
  testsUnavailable: c(
    "Dina tester kunde inte hämtas just nu.",
    "Your tests could not be loaded right now.",
  ),
  testOpen: c("Öppna testet", "Open the test"),
  testProgress: c("{0} besvarade", "{0} answered"),
  testDeadline: c("Senast {0}", "By {0}"),
  resultOpen: c("Läs resultatet", "Read the result"),
  resultReleased: c("Delat med dig {0}", "Shared with you {0}"),
  /** The brief's passive-state example, in both grammatical numbers. It is
   *  a STATUS: the sentence says outright that nothing is required. */
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
  interviews: cp(
    c("1 intervju pågår", "1 interview under way"),
    c("{0} intervjuer pågår", "{0} interviews under way"),
  ),
} as const;

/** What a candidate is told about their own application. Never a
 *  prediction, and never a judgement of their chances. */
export const APPLICATION_STATUS: Readonly<Record<ApplicationStatus, Copy>> = {
  submitted: c("Skickad", "Submitted"),
  reviewing: c("Under granskning hos arbetsgivaren", "Being reviewed by the employer"),
  interview: c("Intervjusteg", "Interview stage"),
  rejected: c("Arbetsgivaren gick vidare med någon annan", "The employer went with someone else"),
  hired: c("Erbjuden tjänsten", "Offered the role"),
  withdrawn: c("Återkallad av dig", "Withdrawn by you"),
};

/** The three states a candidate is told about. `employer_process_continuing`
 *  covers four internal states, and the wording is chosen to be honest about
 *  that rather than to imply a stalled process. */
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
      "Din karriärbild som ett kort du själv väljer att dela.",
      "Your career picture as a card you choose to share.",
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

/** {0} is the employer or the title, where the row has one. */
export const ACTIVITY_LINE: Readonly<Record<ActivityKind, { with: Copy; without: Copy }>> = {
  report_released: {
    with: c("Resultat från {0} delat med dig", "Result from {0} shared with you"),
    without: c(
      "Ett bedömningsresultat delades med dig",
      "An assessment result was shared with you",
    ),
  },
  verification_approved: {
    with: c("En merit i ditt Passport verifierades", "A merit in your Passport was verified"),
    without: c("En merit i ditt Passport verifierades", "A merit in your Passport was verified"),
  },
  verification_rejected: {
    with: c("Beslut om en merit i ditt Passport", "A decision about a merit in your Passport"),
    without: c("Beslut om en merit i ditt Passport", "A decision about a merit in your Passport"),
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
/* Housekeeping that has nowhere better to live                        */
/* ------------------------------------------------------------------ */

export const LINK_EARLIER = {
  title: c("Koppla ett tidigare resultat", "Link an earlier result"),
  body: c(
    "Du har genomfört ett arbetsgivartilldelat test med den här e-postadressen. Koppla resultatet till din profil för att se det under Tester och resultat.",
    "You have completed an employer-assigned test with this email address. Link the result to your profile to see it under Tests and results.",
  ),
  cta: c("Koppla till min profil", "Link to my profile"),
} as const;

/** Kept for the greeting used by the profile page's own hero, which is not
 *  part of the career home but shares this module. */
export const GREETING = {
  noTitle: HEADER.noTitle,
  experienceYears: c("{0} års erfarenhet", "{0} years of experience"),
  viewProfile: c("Visa profil", "View profile"),
  editProfile: c("Redigera profil", "Edit profile"),
  basicsComplete: HEADER.basicsComplete,
  selfReported: HEADER.selfReported,
  degraded: HEADER.degraded,
  retry: HEADER.retry,
  welcome: c("Välkommen tillbaka, {0}", "Welcome back, {0}"),
  welcomeAnon: c("Välkommen tillbaka", "Welcome back"),
  lede: c(
    "Här är det viktigaste i din karriär just nu.",
    "Here is what matters most in your career right now.",
  ),
} as const;

/** Plural helper re-exports kept so importers need one module. */
export type { Copy, PluralCopy };
