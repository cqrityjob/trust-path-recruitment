// The words for every next-best action — one table per sentence, keyed by
// the engine's kinds so a kind cannot ship without its copy.
//
// ── RULES THE COPY OBEYS ───────────────────────────────────────────────
//
// 1. Never a vague object. Every title names the thing it is about, and
//    every counted sentence is authored in both grammatical numbers.
// 2. No product name the Swedish page does not use: "karriäranalysen",
//    never "Career Discovery". "Security Passport" and "Career Card" stay.
// 3. A candidate takes a TEST; "bedömning" is the employer's word for the
//    instrument and stays on employer surfaces.
// 4. No claim the product cannot keep: nothing here says who a result is
//    NOT shared with, or that a field is used "by everything".

import type { CompletenessSection } from "@/lib/professional-identity/completeness";
import type { ActionKind, NextBestAction } from "@/lib/professional-identity/next-best-action";
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";
import { c, cp, L, Lp, type Copy, type Lang, type PluralCopy } from "./copy";

const TITLE: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c("Slutför testet", "Complete the test"),
  complete_training_assignment: c("Slutför utbildningen", "Complete the training"),
  prepare_interview: c("Förbered din intervju", "Prepare for your interview"),
  respond_to_clarification: c("Svara granskaren", "Respond to the reviewer"),
  review_verification_outcome: c(
    "Beslut om en merit i ditt Security Passport",
    "A decision about a merit in your Security Passport",
  ),
  complete_profile_basics: c("Komplettera dina uppgifter", "Complete your details"),
  start_passport: c("Öppna ditt Security Passport", "Open your Security Passport"),
  resume_draft_merits: c("Slutför din påbörjade merit", "Finish the merit you started"),
  submit_passport_verification: c("Verifiera dina meriter", "Get your merits verified"),
  take_career_discovery: c("Gör din karriäranalys", "Take your career analysis"),
  create_career_card: c("Ditt Career Card", "Your Career Card"),
  create_cv: c("Skapa CV från dina meriter", "Create a CV from your merits"),
  open_cv: c("Ditt CV", "Your CV"),
  explore_jobs: c("Lediga jobb inom din inriktning", "Open roles within your direction"),
};

const TITLE_COUNTED: Readonly<Partial<Record<ActionKind, PluralCopy>>> = {
  review_verification_outcome: cp(
    c(
      "Beslut om en merit i ditt Security Passport",
      "A decision about a merit in your Security Passport",
    ),
    c(
      "Beslut om {0} meriter i ditt Security Passport",
      "Decisions about {0} merits in your Security Passport",
    ),
  ),
  resume_draft_merits: cp(
    c("Slutför din påbörjade merit", "Finish the merit you started"),
    c("Slutför dina påbörjade meriter", "Finish the merits you started"),
  ),
  complete_assessment_assignment: cp(
    c("Slutför testet", "Complete the test"),
    c("Slutför dina tester", "Complete your tests"),
  ),
  complete_training_assignment: cp(
    c("Slutför utbildningen", "Complete the training"),
    c("Slutför dina utbildningar", "Complete your training"),
  ),
};

const WHY: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c(
    "En arbetsgivare väntar på ditt test.",
    "An employer is waiting for your test.",
  ),
  complete_training_assignment: c(
    "Din arbetsgivare har tilldelat dig en utbildning med sista dag.",
    "Your employer has assigned you training with a due date.",
  ),
  prepare_interview: c(
    "En arbetsgivare har bjudit in dig till intervju.",
    "An employer has invited you to an interview.",
  ),
  respond_to_clarification: c(
    "En granskare väntar på ett svar från dig.",
    "A reviewer is waiting for an answer from you.",
  ),
  review_verification_outcome: c(
    "Granskningen ledde inte till en verifiering.",
    "The review did not result in a verification.",
  ),
  complete_profile_basics: c(
    "Din yrkestitel eller ditt yrke saknas.",
    "Your professional title or profession is missing.",
  ),
  start_passport: c(
    "Ditt Security Passport innehåller inga meriter ännu.",
    "Your Security Passport holds no merits yet.",
  ),
  resume_draft_merits: c(
    "Du har en påbörjad merit som inte är färdig.",
    "You have a merit you started and did not finish.",
  ),
  submit_passport_verification: c(
    "Du har registrerade meriter som ännu inte är verifierade.",
    "You have recorded merits that are not verified yet.",
  ),
  take_career_discovery: c(
    "Du har inte gjort karriäranalysen ännu.",
    "You have not taken the career analysis yet.",
  ),
  create_career_card: c(
    "Din karriäranalys namnger yrken som kan sättas på ett kort.",
    "Your career analysis names professions that a card can present.",
  ),
  create_cv: c(
    "Du har tillräckligt registrerat för att bygga ett CV.",
    "You have enough recorded to build a CV.",
  ),
  open_cv: c("Du har ett sparat CV.", "You have a saved CV."),
  explore_jobs: c(
    "Det finns lediga jobb inom din inriktning.",
    "There are open roles within your direction.",
  ),
};

const WHY_COUNTED: Readonly<Partial<Record<ActionKind, PluralCopy>>> = {
  complete_assessment_assignment: cp(
    c(
      "{0} test väntar på dig från en arbetsgivare.",
      "{0} test is waiting for you from an employer.",
    ),
    c(
      "{0} tester väntar på dig från arbetsgivare.",
      "{0} tests are waiting for you from employers.",
    ),
  ),
  complete_training_assignment: cp(
    c(
      "{0} utbildning med sista dag är tilldelad dig.",
      "{0} training programme with a due date is assigned to you.",
    ),
    c(
      "{0} utbildningar med sista dag är tilldelade dig.",
      "{0} training programmes with due dates are assigned to you.",
    ),
  ),
  prepare_interview: cp(
    c("{0} intervju väntar på dig.", "{0} interview is waiting for you."),
    c("{0} intervjuer väntar på dig.", "{0} interviews are waiting for you."),
  ),
  review_verification_outcome: cp(
    c(
      "{0} merit fick ett beslut som inte blev en verifiering.",
      "{0} merit received a decision that did not become a verification.",
    ),
    c(
      "{0} meriter fick beslut som inte blev verifieringar.",
      "{0} merits received decisions that did not become verifications.",
    ),
  ),
  respond_to_clarification: cp(
    c(
      "{0} granskare väntar på ett svar från dig.",
      "{0} reviewer is waiting for an answer from you.",
    ),
    c("{0} granskare väntar på svar från dig.", "{0} reviewers are waiting for answers from you."),
  ),
  resume_draft_merits: cp(
    c(
      "Du har {0} påbörjad merit som inte är färdig.",
      "You have {0} unfinished merit you started.",
    ),
    c(
      "Du har {0} påbörjade meriter som inte är färdiga.",
      "You have {0} unfinished merits you started.",
    ),
  ),
  submit_passport_verification: cp(
    c(
      "Du har {0} registrerad merit som ännu inte är verifierad.",
      "You have {0} recorded merit that is not verified yet.",
    ),
    c(
      "Du har {0} registrerade meriter som ännu inte är verifierade.",
      "You have {0} recorded merits that are not verified yet.",
    ),
  ),
  explore_jobs: cp(
    c(
      "{0} ledigt jobb matchar din inriktning just nu.",
      "{0} open role matches your direction right now.",
    ),
    c(
      "{0} lediga jobb matchar din inriktning just nu.",
      "{0} open roles match your direction right now.",
    ),
  ),
};

const OUTCOME: Readonly<Record<ActionKind, Copy>> = {
  // Never "and nobody else": the product cannot keep that promise, and the
  // test's own information sheet states the actual access contract.
  complete_assessment_assignment: c(
    "Resultatet delas inom den aktuella arbetsgivarprocessen enligt informationen för testet.",
    "The result is shared within the current employer process, as described in the test's information.",
  ),
  complete_training_assignment: c(
    "När alla moduler är klara visas utbildningen som genomförd i din utvecklingshistorik.",
    "Once every module is done, the training shows as completed in your development history.",
  ),
  prepare_interview: c(
    "Se vad intervjun gäller och hur du kan förbereda dig.",
    "See what the interview is about and how you can prepare.",
  ),
  respond_to_clarification: c(
    "Granskningen står stilla tills du svarar.",
    "The review is on hold until you answer.",
  ),
  review_verification_outcome: c(
    "Du kan rätta meriten eller skicka in den igen.",
    "You can correct the merit or submit it again.",
  ),
  complete_profile_basics: c(
    "Yrkestiteln och yrket visas i din profil, på ditt CV och på ditt Career Card.",
    "Your professional title and profession appear in your profile, on your CV and on your Career Card.",
  ),
  start_passport: c(
    "Passet skiljer på vad du uppger och vad som faktiskt har verifierats.",
    "The Passport keeps what you state separate from what has actually been verified.",
  ),
  resume_draft_merits: c(
    "En påbörjad merit syns bara för dig och kan inte granskas.",
    "An unfinished merit is visible only to you and cannot be reviewed.",
  ),
  submit_passport_verification: c(
    "Verifierade meriter stärker ditt Security Passport när du delar det med arbetsgivare.",
    "Verified merits strengthen your Security Passport when you share it with employers.",
  ),
  take_career_discovery: c(
    `${DURATION_CLAIM.sv}. Du får en karriärriktning och underlaget till ditt Career Card.`,
    `${DURATION_CLAIM.en}. You get a career direction and the basis for your Career Card.`,
  ),
  create_career_card: c(
    "Dina yrkesrekommendationer från karriäranalysen i ett kort du själv väljer att dela. Career Card är karriärvägledning och är inte ett verifieringsbevis.",
    "Your profession recommendations from the career analysis, in a card you choose to share. The Career Card is career guidance, not proof of verification.",
  ),
  create_cv: c(
    "Byggt av de meriter du redan har registrerat. Ingenting läggs till som du inte själv har fyllt i.",
    "Built from the merits you have already recorded. Nothing is added that you did not fill in yourself.",
  ),
  open_cv: c(
    "Öppna, redigera eller exportera det du har sparat.",
    "Open, edit or export what you have saved.",
  ),
  explore_jobs: c(
    "Se lediga tjänster inom säkerhetsbranschen.",
    "See open roles across the security sector.",
  ),
};

/** The verb on the button. Names what the click does. */
const VERB: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c("Öppna testet", "Open the test"),
  complete_training_assignment: c("Öppna utbildningen", "Open the training"),
  prepare_interview: c("Om intervjun", "About the interview"),
  respond_to_clarification: c("Öppna meriten och svara", "Open the merit and respond"),
  review_verification_outcome: c("Se beslutet om meriten", "See the decision on the merit"),
  complete_profile_basics: c("Fyll i uppgiften", "Fill in the detail"),
  start_passport: c("Öppna Security Passport", "Open the Security Passport"),
  resume_draft_merits: c("Fortsätt registreringen", "Continue the entry"),
  submit_passport_verification: c("Välj meriter att verifiera", "Choose merits to verify"),
  take_career_discovery: c("Starta karriäranalysen", "Start the career analysis"),
  create_career_card: c("Visa Career Card", "View Career Card"),
  create_cv: c("Skapa CV", "Create CV"),
  open_cv: c("Öppna ditt CV", "Open your CV"),
  explore_jobs: c("Se lediga jobb", "See open roles"),
};

/**
 * One quiet alternative beside the primary button. A text link, never a
 * second button. The label and the destination describe the same task:
 * /passport/credentials/new creates a CREDENTIAL (a certificate, licence,
 * training or qualification), so it is never called "add a merit".
 */
const SECONDARY_LINK: Readonly<Partial<Record<ActionKind, { label: Copy; href: string }>>> = {
  submit_passport_verification: {
    label: c("Lägg till ett intyg eller en utbildning", "Add a certificate or qualification"),
    href: "/passport/credentials/new",
  },
  start_passport: {
    label: c("Lägg till ett intyg eller en utbildning", "Add a certificate or qualification"),
    href: "/passport/credentials/new",
  },
  resume_draft_merits: {
    label: c("Öppna mitt Security Passport", "Open my Security Passport"),
    href: "/passport",
  },
  take_career_discovery: {
    label: c("Utforska yrken och karriärvägar", "Explore professions and career paths"),
    href: "/career-center",
  },
  explore_jobs: {
    label: c("Följ mina ansökningar", "Track my applications"),
    href: "/my-career/applications",
  },
  complete_assessment_assignment: {
    label: c("Alla mina tester", "All my tests"),
    href: "/academy",
  },
  complete_training_assignment: {
    label: c("All min utveckling", "All my development"),
    href: "/academy",
  },
};

export function secondaryLinkFor(kind: ActionKind): { label: Copy; href: string } | null {
  return SECONDARY_LINK[kind] ?? null;
}

/* ------------------------------------------------------------------ */
/* The profile action, said in the words of the thing it asks for       */
/* ------------------------------------------------------------------ */

const SECTION_TITLE: Readonly<Record<CompletenessSection, Copy>> = {
  situation: c("Berätta var du står i dag", "Tell us where you are today"),
  identity: c("Lägg till din yrkestitel", "Add your professional title"),
  profession: c("Lägg till ditt nuvarande yrke", "Add your current profession"),
  experience: c("Lägg till hur lång erfarenhet du har", "Add how much experience you have"),
  location: c("Ange vilket land du arbetar i", "Add the country you work in"),
  employment: c("Lägg till din arbetslivserfarenhet", "Add your work experience"),
  education: c("Lägg till din utbildning", "Add your education"),
  skills: c("Lägg till dina färdigheter", "Add your skills"),
  languages: c("Lägg till dina språk", "Add your languages"),
  careerDirection: c("Gör din karriäranalys", "Take your career analysis"),
};

const SECTION_WHY: Readonly<Record<CompletenessSection, Copy>> = {
  situation: c(
    "Du har inte sagt var du befinner dig i karriären.",
    "You have not said where you are in your career.",
  ),
  identity: c("Du har ingen yrkestitel i din profil.", "Your profile has no professional title."),
  profession: c("Ditt nuvarande yrke saknas.", "Your current profession is missing."),
  experience: c("Din erfarenhet är inte ifylld.", "Your experience is not filled in."),
  location: c("Vi vet inte vilket land du arbetar i.", "We do not know which country you work in."),
  employment: c("Du har inga anställningar registrerade.", "You have no employment recorded."),
  education: c("Du har ingen utbildning registrerad.", "You have no education recorded."),
  skills: c("Du har inga färdigheter registrerade.", "You have no skills recorded."),
  languages: c("Du har inga språk registrerade.", "You have no languages recorded."),
  careerDirection: c(
    "Du har inte gjort karriäranalysen ännu.",
    "You have not taken the career analysis yet.",
  ),
};

const SECTION_OUTCOME: Readonly<Record<CompletenessSection, Copy>> = {
  situation: c(
    "Det avgör vilka frågor vi ställer och vad vi föreslår härnäst.",
    "It decides which questions we ask you and what we suggest next.",
  ),
  identity: c(
    "Titeln står överst på ditt CV och ditt Career Card.",
    "The title heads your CV and your Career Card.",
  ),
  profession: c(
    "Yrket visas i din profil, på ditt CV och på ditt Career Card.",
    "Your profession appears in your profile, on your CV and on your Career Card.",
  ),
  experience: c(
    "Erfarenheten visas i din profil och på ditt CV.",
    "Your experience appears in your profile and on your CV.",
  ),
  location: c(
    "Landet avgör vilka behörigheter som gäller för dig.",
    "The country decides which authorisations apply to you.",
  ),
  employment: c(
    "Anställningar kan verifieras av en arbetsgivare. En profiluppgift kan det aldrig.",
    "Employment can be confirmed by an employer. A profile field never can.",
  ),
  education: c(
    "Utbildning kan granskas och verifieras.",
    "Education can be reviewed and verified.",
  ),
  skills: c("Färdigheter visas på ditt CV.", "Skills appear on your CV."),
  languages: c(
    "Språk visas för arbetsgivare i ditt CV.",
    "Languages appear to employers on your CV.",
  ),
  careerDirection: c(
    "Du får en karriärriktning och underlaget till ditt Career Card.",
    "You get a career direction and the basis for your Career Card.",
  ),
};

const SECTION_VERB: Readonly<Record<CompletenessSection, Copy>> = {
  situation: c("Välj din situation", "Choose your situation"),
  identity: c("Lägg till yrkestitel", "Add professional title"),
  profession: c("Lägg till yrke", "Add profession"),
  experience: c("Lägg till erfarenhet", "Add experience"),
  location: c("Ange land", "Set country"),
  employment: c("Lägg till anställning", "Add employment"),
  education: c("Lägg till utbildning", "Add education"),
  skills: c("Lägg till färdighet", "Add a skill"),
  languages: c("Lägg till språk", "Add a language"),
  careerDirection: c("Starta karriäranalysen", "Start the career analysis"),
};

export function wordsFor(
  kind: ActionKind,
  section: CompletenessSection | null,
): { title: Copy; why: Copy; outcome: Copy; verb: Copy } {
  if (section) {
    return {
      title: SECTION_TITLE[section],
      why: SECTION_WHY[section],
      outcome: SECTION_OUTCOME[section],
      verb: SECTION_VERB[section],
    };
  }
  return { title: TITLE[kind], why: WHY[kind], outcome: OUTCOME[kind], verb: VERB[kind] };
}

export function titleFor(action: NextBestAction, l: Lang): string {
  const { title } = wordsFor(action.kind, action.section);
  if (action.section || action.count === null) return L(title, l);
  const counted = TITLE_COUNTED[action.kind];
  return counted ? Lp(counted, l, action.count) : L(title, l);
}

export function reasonFor(action: NextBestAction, l: Lang): string {
  const { why } = wordsFor(action.kind, action.section);
  if (action.count === null) return L(why, l);
  const counted = WHY_COUNTED[action.kind];
  return counted ? Lp(counted, l, action.count) : L(why, l);
}
