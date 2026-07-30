// The option matrix — 32 candidate-facing options and their dimension loadings.
//
// Owner-approved as "Core Question Options v3.1-draft-1". Wording, option ids,
// dimension spans, values, role assignments and translations may not be
// altered without a new content or scoring version (owner decision A-1).
//
// ── THE FORCED-CHOICE MODEL ────────────────────────────────────────────
//
// A single-choice item is a trade-off across a fixed SPAN of dimensions.
// Every option assigns a normalised value in [0,1] to EVERY dimension in the
// span, so choosing option A is not only a statement about A — it is a
// statement about A rather than B, C and D, and it yields an observation on
// every dimension the item spans. That is why an unchosen dimension is never
// missing evidence.
//
// ── ROLE WEIGHTS ───────────────────────────────────────────────────────
//
// primary 0.70 · secondary 0.30 · tertiary 0.15 (owner decision A-2).
// Primary and secondary restate the locked workbook. Tertiary is the
// option-level extension approved in A-3, and every tertiary loading carries
// a written rationale because A-2 requires one and forbids loadings added
// only to improve coverage statistics.
//
// This module is mirrored into public.cd_option_loadings. The guard script
// asserts the two are identical, row for row.

import type { DimensionId } from "./dimensions";
import type { Bilingual } from "./version";

export type LoadingRole = "primary" | "secondary" | "tertiary";

export const ROLE_WEIGHTS: Readonly<Record<LoadingRole, number>> = {
  primary: 0.7,
  secondary: 0.3,
  tertiary: 0.15,
};

export interface Loading {
  readonly dimension: DimensionId;
  readonly role: LoadingRole;
  /** Normalised value in [0,1] for THIS option on THIS dimension. */
  readonly value: number;
  /** Why this option is evidence for this dimension. Required: the system
   *  must always be able to explain a contribution (owner decision A-3). */
  readonly rationale: string;
}

export interface Option {
  readonly id: string;
  readonly text: Bilingual;
  readonly loadings: readonly Loading[];
}

export interface OptionSet {
  readonly questionId: string;
  readonly options: readonly Option[];
}

// Shorthand: the span is declared once per question and the values are given
// per option in span order, which keeps the matrix readable as a table and
// makes a missing value a type error rather than a silent zero.
function optionSet(
  questionId: string,
  span: readonly { dimension: DimensionId; role: LoadingRole; rationale: string }[],
  rows: readonly { id: string; text: Bilingual; values: readonly number[] }[],
): OptionSet {
  return {
    questionId,
    options: rows.map((row) => {
      if (row.values.length !== span.length) {
        throw new Error(
          `${row.id}: expected ${span.length} values for the span, got ${row.values.length}`,
        );
      }
      return {
        id: row.id,
        text: row.text,
        loadings: span.map((s, i) => ({
          dimension: s.dimension,
          role: s.role,
          value: row.values[i],
          rationale: s.rationale,
        })),
      };
    }),
  };
}

export const OPTION_SETS: readonly OptionSet[] = [
  // -----------------------------------------------------------------------
  // CQ02 · Which task would you prefer?
  // -----------------------------------------------------------------------
  optionSet(
    "CQ02",
    [
      {
        dimension: "CID04",
        role: "primary",
        rationale:
          "Declared primary. The item is a trade-off between four kinds of work, and the technical option is the one that engages with a system directly.",
      },
      {
        dimension: "CID03",
        role: "secondary",
        rationale:
          "Declared secondary. Every option involves some degree of working out what is going on, which is analysis.",
      },
      {
        dimension: "CID11",
        role: "tertiary",
        rationale:
          "One option is explicitly about making work traceable through procedures and records, which is the structure dimension stated as a preferred task.",
      },
      {
        dimension: "CID07",
        role: "tertiary",
        rationale:
          "One option moves the work away from its object and onto the person receiving it, which is communication chosen over subject matter.",
      },
      {
        dimension: "CID08",
        role: "tertiary",
        rationale:
          "Choosing to help someone understand something difficult is service motivation expressed as a task preference rather than as a stated value.",
      },
    ],
    [
      {
        id: "CQ02_A",
        values: [1.0, 0.8, 0.35, 0.2, 0.2],
        text: {
          sv: "Ta reda på varför ett system inte fungerar som det ska.",
          en: "Work out why a system isn't behaving the way it should.",
        },
      },
      {
        id: "CQ02_B",
        values: [0.45, 1.0, 0.55, 0.25, 0.15],
        text: {
          sv: "Gå igenom ett underlag och hitta mönstret som förklarar det.",
          en: "Go through a body of material and find the pattern that explains it.",
        },
      },
      {
        id: "CQ02_C",
        values: [0.35, 0.5, 1.0, 0.35, 0.4],
        text: {
          sv: "Få ordning på rutiner och underlag så att arbetet blir spårbart.",
          en: "Get procedures and records in order so the work is traceable.",
        },
      },
      {
        id: "CQ02_D",
        values: [0.15, 0.35, 0.3, 1.0, 1.0],
        text: {
          sv: "Hjälpa någon att förstå något som känns svårt.",
          en: "Help someone understand something they're finding difficult.",
        },
      },
    ],
  ),

  // -----------------------------------------------------------------------
  // CQ03 · A control was skipped to save time. What do you do first?
  // -----------------------------------------------------------------------
  optionSet(
    "CQ03",
    [
      {
        dimension: "CID15",
        role: "primary",
        rationale:
          "Declared primary. All four options are responsible, so the item measures which responsible instinct fires first, not whether the candidate acts.",
      },
      {
        dimension: "CID06",
        role: "secondary",
        rationale:
          "Declared secondary. A skipped control is a risk event, and the options differ in how directly they address the exposure it created.",
      },
      {
        dimension: "CID10",
        role: "tertiary",
        rationale:
          "Establishing what may have been affected before deciding anything is investigative work: gather the facts, then judge.",
      },
      {
        dimension: "CID11",
        role: "tertiary",
        rationale:
          "Reporting and documenting according to procedure is the structure dimension observed as behaviour rather than self-reported as a preference.",
      },
      {
        dimension: "CID07",
        role: "tertiary",
        rationale:
          "Raising it directly with the person responsible requires initiating a difficult conversation, which is communication under real cost.",
      },
      {
        dimension: "CID09",
        role: "tertiary",
        rationale:
          "Telling a colleague their step was skipped means accepting resistance rather than routing around it, which is the boundary-setting dimension.",
      },
    ],
    [
      {
        id: "CQ03_A",
        values: [0.65, 0.85, 1.0, 0.4, 0.2, 0.3],
        text: {
          sv: "Tar reda på vad som kan ha påverkats.",
          en: "Find out what may have been affected.",
        },
      },
      {
        id: "CQ03_B",
        values: [0.8, 0.55, 0.45, 0.3, 1.0, 1.0],
        text: {
          sv: "Tar upp det direkt med den som ansvarar för momentet.",
          en: "Raise it directly with the person responsible for that step.",
        },
      },
      {
        id: "CQ03_C",
        values: [1.0, 0.7, 0.6, 1.0, 0.4, 0.55],
        text: {
          sv: "Rapporterar och dokumenterar enligt rutin.",
          en: "Report it and document it according to procedure.",
        },
      },
      {
        id: "CQ03_D",
        values: [0.85, 1.0, 0.55, 0.55, 0.3, 0.7],
        text: {
          sv: "Ser till att kontrollen görs om innan arbetet går vidare.",
          en: "Make sure the control is redone before the work continues.",
        },
      },
    ],
  ),

  // -----------------------------------------------------------------------
  // CQ06 · Two people give conflicting accounts under pressure
  // -----------------------------------------------------------------------
  optionSet(
    "CQ06",
    [
      {
        dimension: "CID16",
        role: "primary",
        rationale:
          "Declared primary. The options differ in how much pressure each response absorbs before offloading the decision to someone else or to a group.",
      },
      {
        dimension: "CID10",
        role: "secondary",
        rationale:
          "Declared secondary. Conflicting accounts are an evidence problem, and the options differ in how much they try to establish before acting.",
      },
      {
        dimension: "CID12",
        role: "tertiary",
        rationale:
          "Deciding how to proceed and owning the outcome is independent decision-making observed at the moment it costs something.",
      },
      {
        dimension: "CID09",
        role: "tertiary",
        rationale:
          "Two people contradicting each other is a live disagreement, and the options differ in willingness to engage with it directly.",
      },
      {
        dimension: "CID02",
        role: "tertiary",
        rationale:
          "Taking direction of a situation, or convening the people in it, is leadership expressed as behaviour rather than as stated ambition.",
      },
    ],
    [
      {
        id: "CQ06_A",
        values: [0.9, 1.0, 0.45, 0.55, 0.35],
        text: {
          sv: "Ber dem var för sig beskriva vad de själva såg.",
          en: "Ask each of them separately to describe what they saw.",
        },
      },
      {
        id: "CQ06_B",
        values: [1.0, 0.6, 0.85, 0.45, 0.4],
        text: {
          sv: "Utgår från det som går att bekräfta just nu och agerar på det.",
          en: "Work from what can be confirmed right now and act on that.",
        },
      },
      {
        id: "CQ06_C",
        values: [0.8, 0.25, 1.0, 0.85, 1.0],
        text: {
          sv: "Bestämmer hur vi går vidare och tar ansvar för beslutet.",
          en: "Decide how we proceed and take responsibility for the decision.",
        },
      },
      {
        id: "CQ06_D",
        values: [0.6, 0.55, 0.3, 1.0, 0.85],
        text: {
          sv: "Samlar de berörda och stämmer av läget tillsammans.",
          en: "Bring the people involved together and align on the situation.",
        },
      },
    ],
  ),

  // -----------------------------------------------------------------------
  // CQ09 · A recurring problem. What feels most natural?
  // -----------------------------------------------------------------------
  optionSet(
    "CQ09",
    [
      {
        dimension: "CID05",
        role: "primary",
        rationale:
          "Declared primary. The options run from solving the instance to removing the cause, which is exactly the short-to-long horizon this dimension describes.",
      },
      {
        dimension: "CID06",
        role: "secondary",
        rationale:
          "Declared secondary. A recurring problem is an unmanaged risk, and the options differ in how much they treat it as one.",
      },
      {
        dimension: "CID02",
        role: "tertiary",
        rationale:
          "Convening the affected people and driving to a resolution is coordination and influence, measured without asking whether the candidate wants to manage.",
      },
      {
        dimension: "CID11",
        role: "tertiary",
        rationale:
          "Building a routine so the problem cannot recur is the structure dimension applied preventively rather than administratively.",
      },
      {
        dimension: "CID01",
        role: "tertiary",
        rationale:
          "Solving it on the spot every time is hands-on, situation-near work: responsiveness rather than an absence of strategy.",
      },
    ],
    [
      {
        id: "CQ09_A",
        values: [0.15, 0.4, 0.25, 0.2, 1.0],
        text: {
          sv: "Att lösa det på plats varje gång det dyker upp.",
          en: "Solving it on the spot each time it comes up.",
        },
      },
      {
        id: "CQ09_B",
        values: [1.0, 0.85, 0.35, 0.55, 0.35],
        text: {
          sv: "Att ta reda på grundorsaken och få bort den.",
          en: "Finding the underlying cause and removing it.",
        },
      },
      {
        id: "CQ09_C",
        values: [0.7, 0.55, 1.0, 0.45, 0.5],
        text: {
          sv: "Att samla de som berörs och driva fram en lösning tillsammans.",
          en: "Bringing the affected people together and driving it to a resolution.",
        },
      },
      {
        id: "CQ09_D",
        values: [0.85, 1.0, 0.4, 1.0, 0.3],
        text: {
          sv: "Att bygga en rutin som gör att det inte händer igen.",
          en: "Building a routine that stops it happening again.",
        },
      },
    ],
  ),

  // -----------------------------------------------------------------------
  // CQ12 · New information suggests your first judgement was wrong
  // -----------------------------------------------------------------------
  optionSet(
    "CQ12",
    [
      {
        dimension: "CID15",
        role: "primary",
        rationale:
          "Declared primary. All four responses to being wrong are creditable, so the item distinguishes style — verify, revise openly, consult, or understand the original reasoning.",
      },
      {
        dimension: "CID14",
        role: "secondary",
        rationale:
          "Declared secondary. Being corrected is a learning event, and the options differ in how much they treat it as one.",
      },
      {
        dimension: "CID12",
        role: "tertiary",
        rationale:
          "Working through the new information alone before changing anything is independent judgement; asking someone to look at it together is deliberately not.",
      },
      {
        dimension: "CID13",
        role: "tertiary",
        rationale:
          "Bringing in a second perspective on your own possible error is collaboration chosen at the point where it is least comfortable.",
      },
    ],
    [
      {
        id: "CQ12_A",
        values: [0.85, 0.65, 1.0, 0.25],
        text: {
          sv: "Går igenom den nya informationen innan jag ändrar något.",
          en: "Go through the new information before changing anything.",
        },
      },
      {
        id: "CQ12_B",
        values: [1.0, 0.85, 0.85, 0.55],
        text: {
          sv: "Ändrar min bedömning och förklarar varför.",
          en: "Change my assessment and explain why.",
        },
      },
      {
        id: "CQ12_C",
        values: [0.8, 0.9, 0.2, 1.0],
        text: {
          sv: "Ber någon annan titta på det tillsammans med mig.",
          en: "Ask someone else to look at it with me.",
        },
      },
      {
        id: "CQ12_D",
        values: [0.75, 1.0, 0.6, 0.35],
        text: {
          sv: "Vill förstå varför jag bedömde som jag gjorde från början.",
          en: "Want to understand why I judged it the way I did in the first place.",
        },
      },
    ],
  ),

  // -----------------------------------------------------------------------
  // CQ15 · Which work environment feels most natural?
  // -----------------------------------------------------------------------
  optionSet(
    "CQ15",
    [
      {
        dimension: "CID01",
        role: "primary",
        rationale:
          "Declared primary. The options differ in distance from the daily operation, which is what this dimension measures.",
      },
      {
        dimension: "CID13",
        role: "secondary",
        rationale:
          "Declared secondary. Environment and company are inseparable: choosing a team is choosing shared responsibility.",
      },
      {
        dimension: "CID12",
        role: "tertiary",
        rationale:
          "Preferring own responsibility and uninterrupted time is autonomy stated as a working condition rather than as a decision-making claim.",
      },
      {
        dimension: "CID04",
        role: "tertiary",
        rationale:
          "Choosing to be close to systems you are responsible for is technical orientation expressed as where you want to sit, not as what you enjoy.",
      },
      {
        dimension: "CID08",
        role: "tertiary",
        rationale:
          "Environments close to daily operations and to a team are where being useful to people is most immediate. Supporting evidence only; no environment is the strongest possible statement of service motivation.",
      },
      {
        dimension: "CID02",
        role: "tertiary",
        rationale:
          "Preferring a shared-goal environment with close contact is consistent with leadership orientation without being decisive for it. Supporting evidence only.",
      },
    ],
    [
      {
        id: "CQ15_A",
        values: [1.0, 0.55, 0.4, 0.3, 0.7, 0.35],
        text: {
          sv: "Där det händer, nära den dagliga verksamheten.",
          en: "Where things happen, close to day-to-day operations.",
        },
      },
      {
        id: "CQ15_B",
        values: [0.55, 1.0, 0.3, 0.3, 0.65, 0.7],
        text: {
          sv: "I ett team med gemensamma mål och tät kontakt.",
          en: "In a team with shared goals and close contact.",
        },
      },
      {
        id: "CQ15_C",
        values: [0.3, 0.2, 1.0, 0.6, 0.25, 0.2],
        text: {
          sv: "Med eget ansvar och tid att arbeta koncentrerat.",
          en: "With my own responsibility and time to work with focus.",
        },
      },
      {
        id: "CQ15_D",
        values: [0.45, 0.35, 0.65, 1.0, 0.3, 0.3],
        text: {
          sv: "Nära system och teknik som jag ansvarar för.",
          en: "Close to systems and technology I'm responsible for.",
        },
      },
    ],
  ),

  // -----------------------------------------------------------------------
  // CQ17 · Incident resolved, cause still unclear. What do you prioritise?
  // -----------------------------------------------------------------------
  optionSet(
    "CQ17",
    [
      {
        dimension: "CID10",
        role: "primary",
        rationale:
          "Declared primary. The options differ in how much each prioritises establishing what actually happened over other legitimate follow-ups.",
      },
      {
        dimension: "CID03",
        role: "secondary",
        rationale:
          "Declared secondary. Both establishing the cause and judging recurrence require reasoning from incomplete information.",
      },
      {
        dimension: "CID14",
        role: "tertiary",
        rationale:
          "Turning an incident into something the organisation learns from is the learning dimension applied outward rather than to oneself.",
      },
      {
        dimension: "CID11",
        role: "tertiary",
        rationale:
          "Securing the record before memory degrades is a genuinely expert instinct and is the structure dimension under time pressure.",
      },
      {
        dimension: "CID06",
        role: "tertiary",
        rationale:
          "Asking whether it can happen again and what that would mean is risk awareness applied to a concrete event rather than in the abstract.",
      },
    ],
    [
      {
        id: "CQ17_A",
        values: [1.0, 0.85, 0.6, 0.45, 0.7],
        text: {
          sv: "Att ta reda på vad som faktiskt hände.",
          en: "Finding out what actually happened.",
        },
      },
      {
        id: "CQ17_B",
        values: [0.7, 0.45, 0.4, 1.0, 0.6],
        text: {
          sv: "Att dokumentera händelsen medan den är färsk.",
          en: "Documenting the event while it's still fresh.",
        },
      },
      {
        id: "CQ17_C",
        values: [0.55, 0.9, 0.5, 0.5, 1.0],
        text: {
          sv: "Att bedöma om det kan hända igen och vad det skulle innebära.",
          en: "Judging whether it could happen again and what that would mean.",
        },
      },
      {
        id: "CQ17_D",
        values: [0.45, 0.6, 1.0, 0.55, 0.75],
        text: {
          sv: "Att se till att vi lär oss något av det.",
          en: "Making sure we learn something from it.",
        },
      },
    ],
  ),

  // -----------------------------------------------------------------------
  // CQ20 · Which outcome feels most meaningful after a working day?
  // -----------------------------------------------------------------------
  optionSet(
    "CQ20",
    [
      {
        dimension: "CID08",
        role: "primary",
        rationale:
          "Declared primary. The options differ in how much the satisfaction comes from someone else being better off.",
      },
      {
        dimension: "CID05",
        role: "secondary",
        rationale:
          "Declared secondary. Finding meaning in something working better tomorrow than yesterday is a long-horizon orientation.",
      },
      {
        dimension: "CID02",
        role: "tertiary",
        rationale:
          "Satisfaction from having supported someone who then moved forward is the 'developing others' clause of this dimension, observed as motivation rather than ambition.",
      },
      {
        dimension: "CID14",
        role: "tertiary",
        rationale:
          "Finding a day meaningful because you learned something you could not do before is the learning dimension stated without apology.",
      },
      {
        dimension: "CID13",
        role: "tertiary",
        rationale:
          "Locating meaning in what the team delivered rather than in personal output is collaboration expressed as what counts as a good day.",
      },
    ],
    [
      {
        id: "CQ20_A",
        values: [1.0, 0.25, 0.3, 0.35, 0.55],
        text: {
          sv: "Att någon fick hjälp när det behövdes.",
          en: "That someone got help when they needed it.",
        },
      },
      {
        id: "CQ20_B",
        values: [0.55, 1.0, 0.5, 0.65, 0.45],
        text: {
          sv: "Att något fungerar bättre imorgon än det gjorde igår.",
          en: "That something works better tomorrow than it did yesterday.",
        },
      },
      {
        id: "CQ20_C",
        values: [0.75, 0.6, 1.0, 0.7, 1.0],
        text: {
          sv: "Att teamet levererade och någon jag stöttat tog ett steg framåt.",
          en: "That the team delivered and someone I supported moved forward.",
        },
      },
      {
        id: "CQ20_D",
        values: [0.3, 0.45, 0.25, 1.0, 0.25],
        text: {
          sv: "Att jag själv lärde mig något jag inte kunde innan.",
          en: "That I learned something I couldn't do before.",
        },
      },
    ],
  ),
];

export const OPTION_SET_BY_QUESTION: Readonly<Record<string, OptionSet>> = Object.fromEntries(
  OPTION_SETS.map((s) => [s.questionId, s]),
);

export const ALL_OPTIONS: readonly Option[] = OPTION_SETS.flatMap((s) => s.options);

export const OPTION_BY_ID: Readonly<Record<string, Option>> = Object.fromEntries(
  ALL_OPTIONS.map((o) => [o.id, o]),
);

/** Flat form, matching the shape of public.cd_option_loadings row for row.
 *  The guard script compares this against the table. */
export interface FlatLoading {
  readonly questionId: string;
  readonly optionId: string;
  readonly dimensionId: DimensionId;
  readonly role: LoadingRole;
  readonly roleWeight: number;
  readonly value: number;
  readonly rationale: string;
}

export const FLAT_LOADINGS: readonly FlatLoading[] = OPTION_SETS.flatMap((set) =>
  set.options.flatMap((opt) =>
    opt.loadings.map((l) => ({
      questionId: set.questionId,
      optionId: opt.id,
      dimensionId: l.dimension,
      role: l.role,
      roleWeight: ROLE_WEIGHTS[l.role],
      value: l.value,
      rationale: l.rationale,
    })),
  ),
);
