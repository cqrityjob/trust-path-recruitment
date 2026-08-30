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
import { c, cp, L, Lp, type Copy, type Lang, type PluralCopy } from "./copy";

const TITLE: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c("Slutför din bedömning", "Complete your assessment"),
  read_released_report: c("Din rapport är tillgänglig", "Your report is available"),
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
  take_career_discovery: c(
    "Cirka 15 minuter. Ger dig en karriärriktning och underlaget till ditt Career Card.",
    "About 15 minutes. Gives you a career direction and the basis for your Career Card.",
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
  complete_profile_basics: c("Fyll i profilen", "Complete your profile"),
  start_passport: c("Öppna Security Passport", "Open the Security Passport"),
  submit_passport_verification: c("Skicka in för granskning", "Submit for review"),
  take_career_discovery: c("Starta Career Discovery", "Start Career Discovery"),
  create_career_card: c("Visa Career Card", "View Career Card"),
  create_cv: c("Skapa CV", "Create CV"),
  open_cv: c("Öppna ditt CV", "Open your CV"),
  explore_jobs: c("Utforska jobb", "Browse jobs"),
};

const HEADING = c("Ditt nästa steg", "Your next step");
const RECOMMENDED = c("Rekommenderat", "Recommended");
const ALSO = c("Också möjligt nu", "Also available now");
const EMPTY_TITLE = c("Inget väntar på dig just nu.", "Nothing is waiting for you right now.");
const EMPTY_BODY = c(
  "Du är i fas. Utforska jobb eller titta på ditt Security Passport när du vill.",
  "You are up to date. Browse jobs or look at your Security Passport whenever you like.",
);

/** The reason line, counted or not. */
function reasonFor(kind: ActionKind, count: number | null, l: Lang): string {
  if (count === null) return L(WHY[kind], l);
  const counted = WHY_COUNTED[kind];
  return counted ? Lp(counted, l, count) : L(WHY[kind], l);
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

  return (
    <section aria-labelledby="next-actions-heading">
      <h2
        id="next-actions-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(HEADING, l)}
      </h2>

      {!lead ? (
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
              {L(TITLE[lead.kind], l)}
            </h3>
            {/* Why it is being recommended, then what it gives. Two
                sentences, in that order, because the question a person
                actually has is the first one. */}
            <p className="mt-2 max-w-[60ch] text-sm font-medium text-foreground">
              {reasonFor(lead.kind, lead.count, l)}
            </p>
            <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
              {L(OUTCOME[lead.kind], l)}
            </p>
            <Link
              to={lead.href}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-[color:var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {L(VERB[lead.kind], l)}
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
                        {L(TITLE[action.kind], l)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {reasonFor(action.kind, action.count, l)}
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
