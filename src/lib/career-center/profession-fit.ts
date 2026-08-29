// "Passar dig som…" and "Passar mindre bra om…" for a profession guide.
//
// ── THE PROBLEM WITH A COUNTER-SIGNAL SECTION ──────────────────────────
//
// An honest career guide has to say who a role does NOT suit. Done carelessly
// that becomes a personality verdict — the exact thing this product forbids
// Career Discovery from doing, and it would be no better for being printed in
// a profession guide instead of a report.
//
// So nothing here is written per profession, and nothing here is a claim
// about a reader. Each signal is a fixed sentence attached to a COMPETENCY,
// and it is emitted only when the guide already states that the role demands
// that competency at the stated level. Every counter-signal is therefore a
// restatement, in preference terms, of a requirement the guide has already
// made and sourced: the role requires conflict management at level 3, so the
// role suits you less well if you would rather not be the person walking into
// a conflict. That is a working condition, not a diagnosis.
//
// Two consequences worth stating:
//
//   - Nothing is fabricated. Remove the competency from the profession and
//     the sentence disappears with it.
//   - Nothing is per-person. The reader decides whether the condition
//     describes them; the product does not decide for them.
//
// A guide showing fewer than MIN_SIGNALS on either side shows neither
// section: one lonely bullet under "Passar mindre bra om…" reads as a
// verdict rather than as a list of conditions.

import type { Bi, CompetencyId, Profession, ProficiencyLevel } from "./types";

export const MIN_SIGNALS = 2;
/** Beyond four the section stops being read and starts being skimmed. */
export const MAX_SIGNALS = 4;

interface SignalRule {
  readonly competencyId: CompetencyId;
  /** Emitted when the role requires the competency at this level or above. */
  readonly atLeast: ProficiencyLevel;
  readonly fit: Bi;
  readonly counter: Bi;
}

/** Ordered by how strongly the signal distinguishes one security role from
 *  another: a role demanding conflict management at level 3 tells a reader
 *  far more about their day than one demanding communication at level 3. */
const SIGNAL_RULES: readonly SignalRule[] = [
  {
    competencyId: "conflict",
    atLeast: 3,
    fit: {
      sv: "du kan hålla dig lugn och saklig när någon annan är upprörd",
      en: "you can stay calm and factual when someone else is not",
    },
    counter: {
      sv: "du helst undviker att vara den som går in i en konfrontation",
      en: "you would rather not be the person who walks into a confrontation",
    },
  },
  {
    competencyId: "stress",
    atLeast: 3,
    fit: {
      sv: "du behåller omdömet när tempot går upp och läget är oklart",
      en: "you keep your judgement when the pace rises and the situation is unclear",
    },
    counter: {
      sv: "du vill ha en förutsägbar arbetsdag utan skarpa lägen",
      en: "you want a predictable working day without live incidents",
    },
  },
  {
    competencyId: "legal_regulatory",
    atLeast: 3,
    fit: {
      sv: "du tycker det är rimligt att regelverk styr vad du får och inte får göra",
      en: "you accept that regulation decides what you may and may not do",
    },
    counter: {
      sv: "du blir otålig av regelverk, tillstånd och formella gränser",
      en: "regulation, permits and formal limits make you impatient",
    },
  },
  {
    competencyId: "reporting",
    atLeast: 3,
    fit: {
      sv: "du skriver ned vad som hänt även när ingen ber om det",
      en: "you write down what happened even when nobody asks you to",
    },
    counter: {
      sv: "du helst slipper dokumentation och skriftlig rapportering",
      en: "you would rather avoid documentation and written reporting",
    },
  },
  {
    competencyId: "analytical",
    atLeast: 4,
    fit: {
      sv: "du gärna gräver i underlag tills mönstret framträder",
      en: "you are happy to dig through material until the pattern shows",
    },
    counter: {
      sv: "du hellre arbetar praktiskt än sitter med analys och underlag",
      en: "you would rather work hands-on than sit with analysis and material",
    },
  },
  {
    competencyId: "leadership",
    atLeast: 4,
    fit: {
      sv: "du vill ansvara för andras arbete och för resultatet av det",
      en: "you want to be responsible for other people's work and its outcome",
    },
    counter: {
      sv: "du hellre är specialist än leder och följer upp andra",
      en: "you would rather be a specialist than lead and follow up on others",
    },
  },
  {
    competencyId: "technical",
    atLeast: 3,
    fit: {
      sv: "du tycker om att förstå hur system och utrustning fungerar",
      en: "you like understanding how systems and equipment work",
    },
    counter: {
      sv: "du inte vill att teknik och system ska vara en stor del av jobbet",
      en: "you do not want technology and systems to be a large part of the job",
    },
  },
  {
    competencyId: "customer_service",
    atLeast: 3,
    fit: {
      sv: "du trivs med att ha människor omkring dig hela arbetspasset",
      en: "you are comfortable with people around you for the whole shift",
    },
    counter: {
      sv: "du helst arbetar ostört och med lite kontakt med andra",
      en: "you would rather work undisturbed, with little contact with others",
    },
  },
  {
    competencyId: "observation",
    atLeast: 3,
    fit: {
      sv: "du märker när något avviker innan det blir en händelse",
      en: "you notice when something is off before it becomes an incident",
    },
    counter: {
      sv: "du tröttnar på uppgifter som kräver uthållig uppmärksamhet",
      en: "you tire of tasks that demand sustained attention",
    },
  },
  {
    competencyId: "planning",
    atLeast: 4,
    fit: {
      sv: "du planerar hellre i förväg än löser saker när de uppstår",
      en: "you would rather plan ahead than solve things as they arise",
    },
    counter: {
      sv: "du hellre löser dagens problem än planerar nästa kvartal",
      en: "you would rather solve today's problem than plan next quarter",
    },
  },
];

function matchedRules(p: Profession): readonly SignalRule[] {
  return SIGNAL_RULES.filter((rule) =>
    p.competencies.some(
      (rc) => rc.competencyId === rule.competencyId && rc.requiredLevel >= rule.atLeast,
    ),
  );
}

export interface FitSignals {
  /** Authored per profession — the guide's own `roleFor` sentence. */
  readonly lead: Bi;
  readonly fits: readonly Bi[];
  readonly counters: readonly Bi[];
}

/**
 * Derives both lists. Deterministic: same profession record, same output,
 * in the fixed rule order above.
 *
 * Either list comes back empty when the role does not demand enough to say
 * anything distinguishing — and an empty list means the section is not
 * rendered, rather than rendered with filler.
 */
export function fitSignals(p: Profession): FitSignals {
  const matched = matchedRules(p);
  const enough = matched.length >= MIN_SIGNALS;
  const take = matched.slice(0, MAX_SIGNALS);
  return {
    lead: p.roleFor,
    fits: enough ? take.map((r) => r.fit) : [],
    counters: enough ? take.map((r) => r.counter) : [],
  };
}

// ---------------------------------------------------------------------------
// "Så kommer du in"
// ---------------------------------------------------------------------------

export type EntryStepKind = "requirement" | "education";

export interface EntryStep {
  readonly kind: EntryStepKind;
  readonly text: Bi;
  /** Only for education steps that carry an official source. */
  readonly href?: string;
  readonly hrefLabel?: Bi;
}

/**
 * The practical path into the role, built only from facts the guide already
 * carries: its formal requirements and its education pathways, in that order
 * — you satisfy the requirement, then you take the training that satisfies
 * it, and both are things the guide has sourced.
 *
 * Returns an empty list when the guide states neither. That is the correct
 * output for a senior role whose entry is "several years of relevant
 * experience": inventing three steps for it would be exactly the fabrication
 * this section is supposed to avoid.
 */
export function entrySteps(
  p: Profession,
  resolveEducation: (
    id: string,
  ) => { name: Bi; provider?: Bi; officialSource?: { url?: string; label: Bi } } | undefined,
): readonly EntryStep[] {
  const steps: EntryStep[] = [];

  for (const requirement of p.formalRequirements ?? []) {
    steps.push({ kind: "requirement", text: requirement });
  }

  for (const id of p.educationPathways ?? []) {
    const education = resolveEducation(id);
    if (!education) continue;
    steps.push({
      kind: "education",
      text: education.name,
      ...(education.officialSource?.url
        ? { href: education.officialSource.url, hrefLabel: education.officialSource.label }
        : {}),
    });
  }

  return steps;
}
