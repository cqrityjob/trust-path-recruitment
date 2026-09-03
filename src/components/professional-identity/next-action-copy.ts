// The words for every next-best action — one table per sentence, keyed by
// the engine's kinds so a kind cannot ship without its copy.
//
// Split out of NextActions.tsx so the component file exports only
// components (fast refresh) and so the explore section can speak about a
// lower-ranked action in exactly the words the workspace would have used.

import type { CompletenessSection } from "@/lib/professional-identity/completeness";
import type { ActionKind, NextBestAction } from "@/lib/professional-identity/next-best-action";
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";
import { c, cp, L, Lp, type Copy, type Lang, type PluralCopy } from "./copy";

const TITLE: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c("Slutför din bedömning", "Complete your assessment"),
  prepare_interview: c("Förbered din intervju", "Prepare for your interview"),
  respond_to_clarification: c("Svara granskaren", "Respond to the reviewer"),
  read_released_report: c("Din nya rapport är klar", "Your new report is ready"),
  review_verification_outcome: c("Ett beslut om din uppgift", "A decision about your entry"),
  complete_profile_basics: c("Fyll i din profil", "Fill in your profile"),
  start_passport: c("Öppna ditt Security Passport", "Open your Security Passport"),
  submit_passport_verification: c("Skicka in för verifiering", "Submit for verification"),
  take_career_discovery: c("Gör Career Discovery", "Take Career Discovery"),
  // "Visa", not "Skapa". The card is rendered from the report on arrival and
  // this action fires only when the report NAMES careers, so the card already
  // exists in every sense the holder cares about.
  create_career_card: c("Ditt Career Card", "Your Career Card"),
  create_cv: c("Skapa ditt CV", "Create your CV"),
  open_cv: c("Ditt CV", "Your CV"),
  explore_jobs: c("Utforska jobb inom säkerhet", "Explore security jobs"),
};

/**
 * WHY this is the recommendation — the state of the account that put it at
 * the top of the ladder. A recommendation a person cannot interrogate is an
 * instruction, and the whole reason the ladder is rules rather than a model
 * is that the product has to be able to answer "why does it say that".
 */
const WHY: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c(
    "En arbetsgivare väntar på dig.",
    "An employer is waiting for you.",
  ),
  prepare_interview: c(
    "En arbetsgivare har bjudit in dig till intervju.",
    "An employer has invited you to an interview.",
  ),
  respond_to_clarification: c(
    "En granskare väntar på ett svar från dig.",
    "A reviewer is waiting for an answer from you.",
  ),
  read_released_report: c(
    "En rapport har gjorts tillgänglig för dig.",
    "A report has been made available to you.",
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
    "Du har inget Security Passport ännu.",
    "You do not have a Security Passport yet.",
  ),
  submit_passport_verification: c(
    "Du har uppgifter som ingen har granskat.",
    "You have entries nobody has reviewed.",
  ),
  take_career_discovery: c(
    "Du har inte gjort Career Discovery.",
    "You have not taken Career Discovery.",
  ),
  create_career_card: c(
    "Din rapport namnger yrken som kan sättas på ett kort.",
    "Your report names professions that a card can present.",
  ),
  create_cv: c(
    "Du har tillräckligt registrerat för att bygga ett CV.",
    "You have enough recorded to build a CV.",
  ),
  open_cv: c("Du har ett sparat CV.", "You have a saved CV."),
  explore_jobs: c("Du har inte sökt något jobb ännu.", "You have not applied for anything yet."),
};

/** The counted reasons, in both grammatical forms. Swedish inflects the noun
 *  and the participles, so both are authored rather than templated. */
const WHY_COUNTED: Readonly<Partial<Record<ActionKind, PluralCopy>>> = {
  complete_assessment_assignment: cp(
    c(
      "{0} bedömning väntar på dig från en arbetsgivare.",
      "{0} assessment is waiting for you from an employer.",
    ),
    c(
      "{0} bedömningar väntar på dig från arbetsgivare.",
      "{0} assessments are waiting for you from employers.",
    ),
  ),
  prepare_interview: cp(
    c("{0} intervju väntar på dig.", "{0} interview is waiting for you."),
    c("{0} intervjuer väntar på dig.", "{0} interviews are waiting for you."),
  ),
  read_released_report: cp(
    c("{0} rapport har gjorts tillgänglig för dig.", "{0} report has been made available to you."),
    c(
      "{0} rapporter har gjorts tillgängliga för dig.",
      "{0} reports have been made available to you.",
    ),
  ),
  review_verification_outcome: cp(
    c(
      "{0} uppgift fick ett beslut som inte blev en verifiering.",
      "{0} entry received a decision that did not become a verification.",
    ),
    c(
      "{0} uppgifter fick beslut som inte blev verifieringar.",
      "{0} entries received decisions that did not become verifications.",
    ),
  ),
  respond_to_clarification: cp(
    c(
      "{0} granskare väntar på ett svar från dig.",
      "{0} reviewer is waiting for an answer from you.",
    ),
    c("{0} granskare väntar på svar från dig.", "{0} reviewers are waiting for answers from you."),
  ),
  submit_passport_verification: cp(
    c(
      "{0} uppgift är inlagd men ännu inte granskad.",
      "{0} entry is recorded but not yet reviewed.",
    ),
    c(
      "{0} uppgifter är inlagda men ännu inte granskade.",
      "{0} entries are recorded but not yet reviewed.",
    ),
  ),
};

/** WHAT IT GIVES YOU — the outcome, so the recommendation is a trade rather
 *  than a demand. */
const OUTCOME: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c(
    "Ditt svar går till arbetsgivaren som bad om det, och ingen annan.",
    "Your answer goes to the employer who asked for it, and nobody else.",
  ),
  prepare_interview: c(
    "Se vad intervjun gäller och hur du kan förbereda dig.",
    "See what the interview is about and how you can prepare.",
  ),
  respond_to_clarification: c(
    "Granskningen står stilla tills du svarar.",
    "The review is on hold until you answer.",
  ),
  read_released_report: c(
    "Se vilket underlag arbetsgivaren har valt att dela.",
    "See what the employer has chosen to share with you.",
  ),
  review_verification_outcome: c(
    "Du kan rätta uppgiften eller skicka in den igen.",
    "You can correct the entry or submit it again.",
  ),
  complete_profile_basics: c(
    "Yrkestiteln och yrket används av allt annat i CQrityjob.",
    "Your professional title and profession are used by everything else in CQrityjob.",
  ),
  start_passport: c(
    "Passet skiljer på vad du uppger och vad som faktiskt har verifierats.",
    "The Passport keeps what you state separate from what has actually been verified.",
  ),
  submit_passport_verification: c(
    "En behörig granskare avgör, och det som godkänns blir verifierat.",
    "An authorised reviewer decides, and what passes becomes verified.",
  ),
  // The duration comes from the instrument, not from copy — three surfaces
  // stated three different figures for the same assessment.
  take_career_discovery: c(
    `${DURATION_CLAIM.sv}. Ger dig en karriärriktning och underlaget till ditt Career Card.`,
    `${DURATION_CLAIM.en}. Gives you a career direction and the basis for your Career Card.`,
  ),
  create_career_card: c(
    "Din profil som ett kort du kan dela.",
    "Your profile as a card you can share.",
  ),
  create_cv: c(
    "Byggt av det du redan har registrerat. Inget hittas på.",
    "Built from what you have already recorded. Nothing is invented.",
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

/** The verb on the button. Never "Continue": a call to action that does not
 *  name what it does is the one word that tells nobody anything. */
const VERB: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c("Öppna bedömningen", "Open the assessment"),
  prepare_interview: c("Om intervjun", "About the interview"),
  respond_to_clarification: c("Öppna granskningen", "Open the review"),
  read_released_report: c("Läs rapporten", "Read the report"),
  review_verification_outcome: c("Se beslutet", "See the decision"),
  complete_profile_basics: c("Fyll i profilen", "Complete your profile"),
  start_passport: c("Öppna Security Passport", "Open the Security Passport"),
  submit_passport_verification: c("Skicka in för granskning", "Submit for review"),
  take_career_discovery: c("Starta Career Discovery", "Start Career Discovery"),
  create_career_card: c("Visa Career Card", "View Career Card"),
  create_cv: c("Skapa CV", "Create CV"),
  open_cv: c("Öppna ditt CV", "Open your CV"),
  explore_jobs: c("Utforska jobb", "Browse jobs"),
};

/* ------------------------------------------------------------------ */
/* The profile action, said in the words of the thing it asks for       */
/* ------------------------------------------------------------------ */

// "Fyll i din profil" is the copy a person was given when the product had
// decided WHICH field was missing and then declined to say. The engine
// returns the section, so the recommendation can name it. `Record` so a new
// section cannot ship without them.

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
  careerDirection: c("Gör Career Discovery", "Take Career Discovery"),
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
  careerDirection: c("Du har inte gjort Career Discovery.", "You have not taken Career Discovery."),
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
    "Yrket används av allt annat i CQrityjob.",
    "Your profession is used by everything else in CQrityjob.",
  ),
  experience: c(
    "Erfarenheten avgör vilka roller som visas som möjliga nästa steg.",
    "Your experience decides which roles show up as possible next steps.",
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
  skills: c(
    "Färdigheter används när jobb matchas mot dig.",
    "Skills are used when jobs are matched to you.",
  ),
  languages: c(
    "Språk visas för arbetsgivare i ditt CV.",
    "Languages appear to employers on your CV.",
  ),
  careerDirection: c(
    "Ger dig en karriärriktning och underlaget till ditt Career Card.",
    "Gives you a career direction and the basis for your Career Card.",
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
  careerDirection: c("Starta Career Discovery", "Start Career Discovery"),
};

/** The action's words, specialised by section where it has one. Falls back
 *  to the per-kind copy for every action that is not about a profile
 *  section, which is most of them. */
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

/** The reason line, counted or not. */
export function reasonFor(action: NextBestAction, l: Lang): string {
  const { why } = wordsFor(action.kind, action.section);
  if (action.count === null) return L(why, l);
  const counted = WHY_COUNTED[action.kind];
  return counted ? Lp(counted, l, action.count) : L(why, l);
}
