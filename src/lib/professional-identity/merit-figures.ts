// The ONE presentation contract for "how many merits, and of what standing".
//
// ── THE DEFECT THIS EXISTS TO END ──────────────────────────────────────
//
// `countMeritRows` already gave both surfaces one DERIVATION. It did not
// give them one PRESENTATION, and that was enough for them to contradict
// each other about the same person:
//
//   Passport     0 Registrerade · 1 Dokumenterad
//   My Career    1 Registrerad merit · 1 Dokumenterad merit
//
// Both were reading the same rows. The Passport had taken "Registrerade" to
// mean the bottom RUNG; My Career had taken it to mean `addedCount`, which
// is the TOTAL and therefore contains the documented one. One word, two
// meanings, two screens, one holder.
//
// ── WHAT THIS FIXES, AND HOW ───────────────────────────────────────────
//
// Five MUTUALLY EXCLUSIVE figures, and one total that is named as a total:
//
//   self_reported     stated by the holder, nobody has assessed it —
//                     including an attached document nobody has read
//   documented        a CQrityjob document review
//   source_confirmed  the source confirmed a fact it was party to
//   open_cases        a review is open: waiting on the reviewer, or waiting
//                     on the holder's answer
//   lapsed            confirmed once by SOME method; its validity has ended
//   ─────────────────────────────────────────────────────────────────────
//   total_current     every current merit. NOT a rung. Labelled
//                     "Aktuella meriter totalt" wherever it appears, so it
//                     can never be mistaken for one.
//
// The five exclusive figures sum to the total when every one of them is
// known. `figuresPartition` states that, and the guards assert it on both
// surfaces from the same fixtures.
//
// ── AND ONE WORD PER FIGURE ────────────────────────────────────────────
//
// `MERIT_FIGURE_WORDS` is the canonical Swedish and English for each key.
// My Career reads it directly. The Passport keeps its strings in its own
// domain-local copy module (nothing user-facing may live outside it), and
// `passport-workspace:check` asserts each of those equals the word here.
// Two surfaces, one vocabulary, and a build that fails when they drift.
//
// ── NULL IS NOT ZERO ───────────────────────────────────────────────────
//
// `selfReported` and `openCases` are statements about the verification
// request table. When that read did not answer they are null, and a surface
// must render "temporarily unavailable" rather than a figure. The other
// three are functions of stored provenance and lifecycle and stay true.

import type { MeritCounts } from "./passport-merits";

export const MERIT_FIGURE_CONTRACT = "merit-figures-v1" as const;

export type MeritFigureKey =
  "self_reported" | "documented" | "source_confirmed" | "open_cases" | "lapsed" | "total_current";

/** The five that do not overlap. A merit is in exactly one of them. */
export const EXCLUSIVE_FIGURES = [
  "self_reported",
  "documented",
  "source_confirmed",
  "open_cases",
  "lapsed",
] as const satisfies readonly MeritFigureKey[];

/** The one that is a sum. Never rendered beside the five without a label
 *  that says it is a total. */
export const TOTAL_FIGURE = "total_current" satisfies MeritFigureKey;

export interface MeritFigures {
  /** Null when the verification read did not answer: "nobody is reviewing
   *  these" is exactly what could not be established. */
  readonly selfReported: number | null;
  readonly documented: number;
  readonly sourceConfirmed: number;
  /** Open review cases — waiting on the reviewer AND waiting on the holder.
   *  Null when the verification read did not answer. */
  readonly openCases: number | null;
  readonly lapsed: number;
  /** Every current merit. A TOTAL, and labelled as one. */
  readonly totalCurrent: number;
}

export function meritFigures(counts: MeritCounts): MeritFigures {
  // `pendingCount === null` is the counter's own signal that the review read
  // did not answer. Both review-derived figures follow it, so a surface
  // cannot show one as a number and the other as unknown.
  const reviewKnown = counts.pendingCount !== null;
  return {
    selfReported: reviewKnown ? counts.selfReportedCount + counts.documentProvidedCount : null,
    documented: counts.documentedCount,
    sourceConfirmed: counts.verifiedCount,
    openCases: reviewKnown ? counts.pendingCount! + counts.clarificationCount : null,
    lapsed: counts.expiredCount,
    totalCurrent: counts.addedCount,
  };
}

/**
 * Do the five exclusive figures add up to the total?
 *
 * False when any of them is unknown — an unknown figure cannot be summed,
 * and a surface that treated null as 0 here would report a partition that
 * does not hold. Asserted by both surfaces' guards over the same fixtures.
 */
export function figuresPartition(f: MeritFigures): boolean {
  if (f.selfReported === null || f.openCases === null) return false;
  return (
    f.selfReported + f.documented + f.sourceConfirmed + f.openCases + f.lapsed === f.totalCurrent
  );
}

/**
 * The canonical word for each figure, in both languages.
 *
 * ── WHY THE WORDS ARE HERE AND NOT IN TWO COPY FILES ───────────────────
 *
 * Because two copy files is exactly how "Registrerade" came to mean two
 * things. My Career reads these directly. The Passport, whose copy may not
 * live outside its own domain module, keeps its keys and has its check
 * assert equality against this table — so a divergence is a failing build
 * rather than a screenshot somebody notices in a pilot.
 *
 * `open_cases` says CASES, not "under verification": one of them may be
 * waiting on the holder's own answer, and a word that implies somebody else
 * is handling all of them would be wrong about that one.
 */
export const MERIT_FIGURE_WORDS: Readonly<
  Record<MeritFigureKey, { readonly sv: string; readonly en: string }>
> = {
  self_reported: { sv: "Registrerade", en: "Registered" },
  documented: { sv: "Dokumenterade", en: "Documented" },
  source_confirmed: { sv: "Källbekräftade", en: "Source-confirmed" },
  open_cases: { sv: "Pågående granskningsärenden", en: "Open review cases" },
  lapsed: { sv: "Giltigheten har löpt ut", en: "Validity has ended" },
  total_current: { sv: "Aktuella meriter totalt", en: "Current merits in total" },
};

/** The explanatory line under each figure. Same rule, same reason. */
export const MERIT_FIGURE_HELP: Readonly<
  Record<MeritFigureKey, { readonly sv: string; readonly en: string }>
> = {
  self_reported: {
    sv: "Du har lagt in dem själv. Ingen har granskat dem ännu.",
    en: "You entered them yourself. Nobody has reviewed them yet.",
  },
  documented: {
    sv: "CQrityjob har granskat ett dokument. Källan har inte bekräftat.",
    en: "CQrityjob reviewed a document. The source has not confirmed.",
  },
  source_confirmed: {
    sv: "Den faktiska källan har bekräftat uppgiften.",
    en: "The actual source confirmed the entry.",
  },
  // Says both halves, because the figure holds both. "Någon annan tittar på
  // dem just nu" was wrong about every clarification inside it.
  open_cases: {
    sv: "Öppna granskningsärenden. Några kan vänta på ditt svar.",
    en: "Open review cases. Some may be waiting for your answer.",
  },
  // ── NO CLAIM ABOUT WHAT CONFIRMED IT ─────────────────────────────────
  //
  // This figure holds a lapsed CQrityjob document review and a lapsed source
  // confirmation alike. "Var bekräftad en gång" is true of the second and
  // false of the first — PR #189's whole point is that a document review is
  // not a source confirmation — so the line says only what is true of both:
  // the validity period ended.
  lapsed: {
    sv: "Giltighetstiden har löpt ut. Kontrollera om meriten behöver förnyas.",
    en: "The validity period has ended. Check whether this merit needs renewing.",
  },
  total_current: {
    sv: "Summan av alla aktuella meriter i ditt Passport.",
    en: "The sum of every current merit in your Passport.",
  },
};

/** What a surface says instead of a figure it could not read. Never "0",
 *  and never a second copy of the heading. */
export const FIGURE_UNAVAILABLE = {
  sv: "Tillfälligt otillgängligt",
  en: "Temporarily unavailable",
} as const;
