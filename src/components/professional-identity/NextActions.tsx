// "Your next step" — the deterministic next best action, rendered as ONE
// recommendation.
//
// ── WHY ONE AND NOT THREE ──────────────────────────────────────────────
//
// This surface used to render the ladder's top three as three identical
// cards, each ending in the word "Continue". Three equally weighted cards
// is the same refusal to decide that the seven-card dashboard was, moved up
// the page: the product had already ranked them and then declined to say
// so, and the person still had to choose. A generic verb compounded it —
// "Continue" is the one word that tells somebody nothing about where a
// button goes.
//
// So the ranking is expressed rather than merely computed. The highest
// action gets weight, a reason, an outcome and a verb naming what it does;
// everything else that qualified stays reachable underneath at obviously
// lower priority. Nothing is hidden and nothing new is decided here.
//
// ── THE DECISION IS STILL NOT MADE HERE ────────────────────────────────
//
// `computeNextBestActions` is a pure function over eight integers and four
// booleans, tested against fixed inputs, so the same account always sees
// the same recommendation and anybody can be told why. This file only draws
// it, and it draws them in the order that function returned — it does not
// re-rank, re-filter or promote.
//
// ── WHAT THIS COMPONENT IS NOT ALLOWED TO BE ───────────────────────────
//
// Not a nag list, not a checklist with a completion score, not a streak.
// There is no badge for an action nobody asked for and no countdown. A
// person who came here to read their report and leave must be able to.
//
// ── WHY THE COPY LIVES BESIDE THE KINDS ────────────────────────────────
//
// `Record<ActionKind, ...>` rather than a switch: adding a kind to the
// engine without adding its copy stops compiling, which is the only way to
// be sure a new action can never render as a blank row or a bare verb.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  computeNextBestActions,
  type ActionKind,
  type NextBestActionSignals,
} from "@/lib/professional-identity/next-best-action";
import type { ProfessionalIdentityV1 } from "@/lib/professional-identity/types";
import type { CompletenessSection } from "@/lib/professional-identity/completeness";
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";
import { c, cp, L, Lp, type Copy, type Lang, type PluralCopy } from "./copy";

const TITLE: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c("Slutför din bedömning", "Complete your assessment"),
  read_released_report: c("Din rapport är tillgänglig", "Your report is available"),
  respond_to_clarification: c("Svara granskaren", "Respond to the reviewer"),
  complete_profile_basics: c("Fyll i din profil", "Fill in your profile"),
  start_passport: c("Öppna ditt Security Passport", "Open your Security Passport"),
  submit_passport_verification: c("Skicka in för verifiering", "Submit for verification"),
  take_career_discovery: c("Gör Career Discovery", "Take Career Discovery"),
  // "Visa", not "Skapa". The card is rendered from the report on arrival and
  // this action fires only when the report NAMES careers, so the card already
  // exists in every sense the holder cares about. It said "Create" here while
  // the hero two rems above said "View", about the same one destination.
  create_career_card: c("Ditt Career Card", "Your Career Card"),
  create_cv: c("Skapa ditt CV", "Create your CV"),
  open_cv: c("Ditt CV", "Your CV"),
  explore_jobs: c("Utforska jobb inom säkerhet", "Explore security jobs"),
};

/**
 * WHY this is the recommendation — the state of the account that put it at
 * the top of the ladder.
 *
 * This is the half the old three-card treatment had nowhere to put. A
 * recommendation a person cannot interrogate is an instruction, and the
 * whole reason the ladder is rules rather than a model is that the product
 * has to be able to answer "why does it say that".
 */
const WHY: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c(
    "En arbetsgivare väntar på dig.",
    "An employer is waiting for you.",
  ),
  read_released_report: c(
    "Ett resultat har släppts till dig.",
    "A result has been released to you.",
  ),
  respond_to_clarification: c(
    "En granskare väntar på ett svar från dig.",
    "A reviewer is waiting for an answer from you.",
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
  read_released_report: cp(
    c("{0} rapport har släppts till dig.", "{0} report has been released to you."),
    c("{0} rapporter har släppts till dig.", "{0} reports have been released to you."),
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
  read_released_report: c(
    "Du ser vad arbetsgivaren har delat med dig.",
    "You see what the employer has shared with you.",
  ),
  respond_to_clarification: c(
    "Granskningen står stilla tills du svarar.",
    "The review is on hold until you answer.",
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
  // stated three different figures for the same assessment. See
  // career-discovery/v31/duration.ts.
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
  read_released_report: c("Läs rapporten", "Read the report"),
  respond_to_clarification: c("Öppna granskningen", "Open the review"),
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

// ── WHY THE PROFILE ACTION IS NOT ONE SENTENCE ─────────────────────────
//
// "Fyll i din profil" is the copy a person was given when the product had
// decided WHICH field was missing and then declined to say. It is the
// sentence that made the pilot's dead loop invisible: somebody who had just
// saved their profile was told to fill in their profile, with no way to tell
// that the product meant a different field on a different page.
//
// The engine now returns the section, so the recommendation can name it.
// Each entry is the same three things the generic copy carries -- what it
// is, why it is being asked, what changes when it is done -- written about
// one field, in the words a person would use for it rather than the words
// the schema uses. `Record<CompletenessSection, ...>` so a new section
// cannot ship without them.

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
function wordsFor(
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

const HEADING = c("Ditt nästa steg", "Your next step");
const RECOMMENDED = c("Rekommenderat", "Recommended");
const ALSO = c("Också möjligt nu", "Also available now");
const EMPTY_TITLE = c("Inget väntar på dig just nu.", "Nothing is waiting for you right now.");
const EMPTY_BODY = c(
  "Du är i fas. Utforska jobb eller titta på ditt Security Passport när du vill.",
  "You are up to date. Browse jobs or look at your Security Passport whenever you like.",
);

/** The reason line, counted or not. */
function reasonFor(
  kind: ActionKind,
  section: CompletenessSection | null,
  count: number | null,
  l: Lang,
): string {
  const { why } = wordsFor(kind, section);
  if (count === null) return L(why, l);
  const counted = WHY_COUNTED[kind];
  return counted ? Lp(counted, l, count) : L(why, l);
}

export function NextActions({
  identity,
  signals,
}: {
  identity: ProfessionalIdentityV1;
  /** Extra state the identity read model deliberately does not carry --
   *  see NextBestActionSignals. Omitted, everything behaves as before. */
  signals?: NextBestActionSignals;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  // The engine's order, untouched. `primary[0]` is the recommendation; the
  // rest are the other things that qualified, at lower weight.
  const { primary } = computeNextBestActions(identity, signals);
  const [lead, ...rest] = primary;
  const leadWords = lead ? wordsFor(lead.kind, lead.section) : null;

  return (
    <section aria-labelledby="next-actions-heading">
      <h2
        id="next-actions-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(HEADING, l)}
      </h2>

      {!lead || !leadWords ? (
        <div className="mt-3 rounded-xl border border-border bg-card p-6">
          <p className="text-base font-medium text-foreground">{L(EMPTY_TITLE, l)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{L(EMPTY_BODY, l)}</p>
        </div>
      ) : (
        <>
          {/* ── The recommendation ──────────────────────────────────────
              One card, and the only element on this page carrying the
              accent surface. `data-next-action` is the seam the guard
              counts: exactly one primary may ever render. */}
          <article
            data-next-action="primary"
            className="mt-3 rounded-xl border border-accent/30 bg-secondary/60 p-6 shadow-sm md:p-8"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              {L(RECOMMENDED, l)}
            </p>
            <h3
              className="mt-2 text-xl font-semibold tracking-tight text-balance text-foreground md:text-2xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {L(leadWords.title, l)}
            </h3>
            {/* Why it is being recommended, then what it gives. Two
                sentences, in that order, because the question a person
                actually has is the first one. */}
            <p className="mt-2 max-w-[60ch] text-sm font-medium text-foreground">
              {reasonFor(lead.kind, lead.section, lead.count, l)}
            </p>
            <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
              {L(leadWords.outcome, l)}
            </p>
            <Link
              to={lead.href}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-[color:var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {L(leadWords.verb, l)}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>

          {/* ── Everything else that qualified ──────────────────────────
              Reachable, and obviously not the recommendation: no surface,
              no button, one line each.

              Constrained rather than full-bleed: `justify-between` across a
              1440px page put each action's reason at the far right edge,
              half a metre from the title it explains. */}
          {rest.length > 0 && (
            <div className="mt-4 max-w-3xl">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {L(ALSO, l)}
              </h4>
              <ul className="mt-2 divide-y divide-border border-t border-border">
                {rest.map((action) => (
                  <li key={action.kind}>
                    <Link
                      data-next-action="secondary"
                      to={action.href}
                      className="group flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-sm font-medium text-foreground group-hover:underline">
                        {L(wordsFor(action.kind, action.section).title, l)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {reasonFor(action.kind, action.section, action.count, l)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
