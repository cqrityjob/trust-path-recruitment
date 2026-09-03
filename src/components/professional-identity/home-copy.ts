// Copy for the personal home's sections — authored as sv/en pairs beside the
// screens that read them, per the convention documented in copy.ts.
//
// Every string here is a STATUS or a DESTINATION, never a score, never a
// demand. The three classifications from the brief are named in words so
// nothing depends on seeing a colour, and a suggestion is called a
// suggestion rather than dressed as a requirement.

import type { CandidateInterviewStatus } from "@/lib/interview-intelligence/candidate.functions";
import type { StatusClassification } from "@/lib/professional-identity/next-best-action";
import type {
  ActivityKind,
  ExploreDestination,
  SecondaryStatusKind,
} from "@/lib/professional-identity/home-presentation";
import { c, cp, type Copy, type PluralCopy } from "./copy";

/* ------------------------------------------------------------------ */
/* Classification chips                                                */
/* ------------------------------------------------------------------ */

export const CLASSIFICATION: Readonly<Record<StatusClassification, Copy>> = {
  action_required: c("Kräver din åtgärd", "Needs your action"),
  new_for_you: c("Nytt för dig", "New for you"),
  in_progress_no_action: c("Pågår – inget krävs av dig", "In progress – nothing needed from you"),
  suggestion: c("Förslag", "Suggestion"),
};

/* ------------------------------------------------------------------ */
/* Greeting                                                            */
/* ------------------------------------------------------------------ */

export const GREETING = {
  welcome: c("Välkommen tillbaka, {0}", "Welcome back, {0}"),
  welcomeAnon: c("Välkommen tillbaka", "Welcome back"),
  lede: c(
    "Här är det viktigaste i din karriär just nu.",
    "Here is what matters most in your career right now.",
  ),
  noTitle: c("Yrkestitel inte ifylld", "Professional title not filled in"),
  experienceYears: c("{0} års erfarenhet", "{0} years of experience"),
  viewProfile: c("Visa profil", "View profile"),
  editProfile: c("Redigera profil", "Edit profile"),
  /** Said only when every basic section is answered. Never a percentage,
   *  and never a claim about quality: the profile is filled in, not good. */
  basicsComplete: c("Grundprofil komplett", "Basic profile complete"),
  selfReported: c(
    "Uppgifterna här är självrapporterade. Det som är verifierat visas i Security Passport.",
    "The information here is self-reported. What has been verified is shown in the Security Passport.",
  ),
  degraded: c(
    "Delar av din profil kunde inte läsas. Ingenting har tagits bort.",
    "Parts of your profile could not be read. Nothing has been removed.",
  ),
  retry: c("Försök igen", "Try again"),
} as const;

/* ------------------------------------------------------------------ */
/* Priority workspace                                                  */
/* ------------------------------------------------------------------ */

export const WORKSPACE = {
  heading: c("Viktigast just nu", "What matters most right now"),
  calmTitle: c("Du är i fas", "You are up to date"),
  calmBody: c("Inget väntar på dig just nu.", "Nothing is waiting for you right now."),
  calmSuggestion: c("Ett förslag när du har tid:", "A suggestion for when you have time:"),
  calmEmpty: c(
    "Utforska jobb eller öppna ditt Security Passport när du vill.",
    "Browse jobs or open your Security Passport whenever you like.",
  ),
  deadline: c("Senast {0}", "By {0}"),
} as const;

export const SECONDARY_TITLE: Readonly<
  Record<Exclude<SecondaryStatusKind, "engine_action">, PluralCopy>
> = {
  passport_under_review: cp(
    c("1 uppgift granskas", "1 entry is being reviewed"),
    c("{0} uppgifter granskas", "{0} entries are being reviewed"),
  ),
  assessment_awaiting_release: cp(
    c("1 bedömning väntar på resultat", "1 assessment is awaiting its result"),
    c("{0} bedömningar väntar på resultat", "{0} assessments are awaiting their results"),
  ),
  interview_process_continuing: cp(
    c("Intervjun är genomförd", "Your interview is complete"),
    c("{0} intervjuer är genomförda", "{0} interviews are complete"),
  ),
  career_card_available: cp(
    c("Career Card är tillgängligt", "Your Career Card is available"),
    c("Career Card är tillgängligt", "Your Career Card is available"),
  ),
};

export const SECONDARY_BODY: Readonly<Record<Exclude<SecondaryStatusKind, "engine_action">, Copy>> =
  {
    passport_under_review: c(
      "Du behöver inte göra något just nu.",
      "There is nothing you need to do right now.",
    ),
    assessment_awaiting_release: c(
      "Arbetsgivaren har inte släppt resultatet ännu. Inget krävs av dig.",
      "The employer has not released the result yet. Nothing is needed from you.",
    ),
    interview_process_continuing: c(
      "Arbetsgivarens process fortsätter. Inget krävs av dig.",
      "The employer's process continues. Nothing is needed from you.",
    ),
    career_card_available: c(
      "Skapa eller öppna ditt delbara Career Card.",
      "Create or open your shareable Career Card.",
    ),
  };

export const SECONDARY_CTA: Readonly<Record<Exclude<SecondaryStatusKind, "engine_action">, Copy>> =
  {
    passport_under_review: c("Visa status", "View status"),
    assessment_awaiting_release: c("Visa bedömningar", "View assessments"),
    interview_process_continuing: c("Om intervjun", "About the interview"),
    career_card_available: c("Öppna Career Card", "Open Career Card"),
  };

/* ------------------------------------------------------------------ */
/* Career snapshot                                                     */
/* ------------------------------------------------------------------ */

export const SNAPSHOT = {
  heading: c("Din karriär i korthet", "Your career at a glance"),
  unreadable: c("Kunde inte läsas", "Could not be read"),
  actionRequired: c("Kräver din åtgärd", "Needs your action"),

  passportTitle: c("Security Passport", "Security Passport"),
  passportNotOpened: c("Inte öppnat ännu", "Not opened yet"),
  passportVerified: cp(c("1 verifierad", "1 verified"), c("{0} verifierade", "{0} verified")),
  passportUnderReview: cp(
    c("1 granskas", "1 being reviewed"),
    c("{0} granskas", "{0} being reviewed"),
  ),
  passportReviewUnknown: c(
    "granskningsstatus kunde inte hämtas",
    "review status could not be loaded",
  ),
  passportOpen: c("Öppna Passport", "Open Passport"),

  analysisTitle: c("Karriäranalys", "Career Analysis"),
  analysisReady: c("Rapport klar", "Report ready"),
  analysisCompleted: c("Genomförd {0}", "Completed {0}"),
  analysisNone: c("Inte genomförd ännu", "Not taken yet"),
  // Contains the word the gate guard looks for: the closed state says WHY.
  analysisClosed: c(
    "Den uppdaterade versionen är under granskning innan den öppnas för alla.",
    "The updated version is under review before it opens to everyone.",
  ),
  analysisLoading: c("Hämtar din senaste rapport…", "Loading your latest report…"),
  analysisView: c("Visa karriäranalys", "View career analysis"),
  analysisStart: c("Starta Career Discovery", "Start Career Discovery"),
  analysisExplore: c("Utforska yrken", "Explore professions"),
  analysisHistory: c("Alla mina rapporter", "All my reports"),
  analysisRetry: c("Försök igen", "Try again"),

  assessmentsTitle: c("Bedömningar", "Assessments"),
  assessmentsOpen: cp(c("1 att göra", "1 to do"), c("{0} att göra", "{0} to do")),
  assessmentsReleased: cp(
    c("1 rapport tillgänglig", "1 report available"),
    c("{0} rapporter tillgängliga", "{0} reports available"),
  ),
  assessmentsAwaiting: cp(
    c("1 väntar på resultat", "1 awaiting result"),
    c("{0} väntar på resultat", "{0} awaiting results"),
  ),
  assessmentsNone: c("Inga bedömningar just nu", "No assessments right now"),
  assessmentsView: c("Visa bedömningar", "View assessments"),

  jobsTitle: c("Jobb", "Jobs"),
  jobsActive: cp(
    c("1 aktiv ansökan", "1 active application"),
    c("{0} aktiva ansökningar", "{0} active applications"),
  ),
  jobsInterviews: cp(c("1 intervju", "1 interview"), c("{0} intervjuer", "{0} interviews")),
  jobsExplore: c("Utforska jobb", "Explore jobs"),
} as const;

/* ------------------------------------------------------------------ */
/* Recent activity                                                     */
/* ------------------------------------------------------------------ */

export const ACTIVITY = {
  heading: c("Senaste aktivitet", "Recent activity"),
  today: c("idag", "today"),
  yesterday: c("igår", "yesterday"),
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
    with: c("Rapport från {0} tillgänglig", "Report from {0} available"),
    without: c("Rapport tillgänglig", "Report available"),
  },
  verification_approved: {
    with: c("Uppgift i Passport verifierad", "Passport entry verified"),
    without: c("Uppgift i Passport verifierad", "Passport entry verified"),
  },
  verification_rejected: {
    with: c("Beslut om uppgift i Passport", "Decision on a Passport entry"),
    without: c("Beslut om uppgift i Passport", "Decision on a Passport entry"),
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
/* Active work                                                         */
/* ------------------------------------------------------------------ */

export const ACTIVE_WORK = {
  heading: c("Pågående", "In progress"),
  progress: c("{0} besvarade", "{0} answered"),
  deadline: c("Senast {0}", "By {0}"),
  openAssessment: c("Öppna bedömningen", "Open the assessment"),
  aboutInterview: c("Om intervjun", "About the interview"),
  openEntry: c("Öppna uppgiften", "Open the entry"),
  clarificationTitle: c(
    "Granskaren väntar på ditt svar",
    "The reviewer is waiting for your answer",
  ),
  outcomeTitle: c(
    "Granskningen ledde inte till en verifiering",
    "The review did not result in a verification",
  ),
  entryFallback: c("Uppgift i ditt pass", "An entry in your Passport"),
  linkEarlierTitle: c("Koppla ett tidigare resultat", "Link an earlier result"),
  linkEarlierBody: c(
    "Du har genomfört en arbetsgivartilldelad bedömning med den här e-postadressen. Koppla resultatet till din profil för att se det under Bedömningar.",
    "You've completed an employer-assigned assessment with this email address. Link the result to your profile to see it under Assessments.",
  ),
  linkEarlierCta: c("Koppla till min profil", "Link to my profile"),
} as const;

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
/* Explore and grow                                                    */
/* ------------------------------------------------------------------ */

export const EXPLORE = {
  heading: c("Bygg vidare på din karriär", "Build on your career"),
  more: c("Fler saker du kan göra", "More things you can do"),
  status: c("Din status", "Your status"),
  allReports: c("Alla mina rapporter", "All my reports"),
} as const;

export const EXPLORE_DESTINATION: Readonly<
  Record<ExploreDestination, { title: Copy; body: Copy }>
> = {
  career_discovery: {
    title: c("Gör om Career Discovery (valfritt)", "Retake Career Discovery (optional)"),
    body: c(
      "Uppdatera din karriärriktning när du vill.",
      "Update your career direction whenever you like.",
    ),
  },
  career_card: {
    title: c("Ditt Career Card", "Your Career Card"),
    body: c("Din profil som ett kort du kan dela.", "Your profile as a card you can share."),
  },
  cv: {
    title: c("Ditt CV", "Your CV"),
    body: c(
      "Byggt av det du redan har registrerat. Inget hittas på.",
      "Built from what you have already recorded. Nothing is invented.",
    ),
  },
  professions: {
    title: c("Utforska yrken", "Explore professions"),
    body: c(
      "Se vad olika säkerhetsroller innebär och vad de kräver.",
      "See what different security roles involve and require.",
    ),
  },
  profile: {
    title: c("Min profil", "My Profile"),
    body: c(
      "Det du själv har registrerat, avsnitt för avsnitt.",
      "What you have recorded about yourself, section by section.",
    ),
  },
  jobs: {
    title: c("Utforska jobb inom säkerhet", "Explore security jobs"),
    body: c(
      "Se lediga tjänster inom säkerhetsbranschen.",
      "See open roles across the security sector.",
    ),
  },
};
