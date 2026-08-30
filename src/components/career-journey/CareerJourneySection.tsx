// The Career Journey, as a candidate reads it.
//
// ── WHAT THIS SECTION IS FOR ───────────────────────────────────────────
//
// The report above it answers "what fits how I think". This answers the
// different question people actually came with: "and where does that leave
// ME, today". Those are separate questions with separate evidence, and the
// single most important thing this component does is keep them visibly
// separate — a candidate must be able to see that their background moved
// the JOURNEY and left the Career DNA exactly where it was.
//
// ── THE FAILURE IT IS BUILT AROUND ─────────────────────────────────────
//
// A report that says "we do not know your current situation" in one panel
// and "your possible next step" in the next is not a rough edge; it is the
// product contradicting itself about the one thing the reader is trying to
// establish. So there is no partial state here. Either the journey is known
// and every section renders, or it is not and the only thing shown is an
// honest account of what is missing and how to supply it. `journey.known`
// is the single switch, decided in the engine, not here.
//
// ── NO NUMBERS ─────────────────────────────────────────────────────────
//
// No percentage, no bar, no meter, no score. Not a stylistic preference:
// the inputs are a coarse experience band, a catalogued career level and a
// graph edge that either exists or does not, and none of them can support a
// number. Words that can be defended, or nothing.

import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleDashed, Compass, Flag, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  CareerJourney,
  JourneyProfession,
  JourneySectionId,
  ReadinessCategory,
} from "@/lib/career-journey/types";
import {
  currentStatusOptions,
  yearsOfExperienceOptions,
} from "@/lib/security-career-profile/options";
import { pickText } from "@/lib/assessment-content";

/** The Journey renders in the locale of the REPORT it sits inside, not the
 *  live site toggle — same rule V31ReportView follows for frozen content,
 *  because a Swedish report with an English journey section reads as two
 *  documents stapled together. */
type Locale = "sv" | "en";

const SECTION_ORDER: readonly JourneySectionId[] = [
  "explore_now",
  "possible_next_steps",
  "longer_term",
];

const SECTION_TITLE_KEY: Readonly<Record<JourneySectionId, TranslationKey>> = {
  explore_now: "cj.section.exploreNow",
  possible_next_steps: "cj.section.nextSteps",
  longer_term: "cj.section.longerTerm",
  unknown: "cj.section.unknown",
};

const SECTION_BODY_KEY: Readonly<Record<JourneySectionId, TranslationKey>> = {
  explore_now: "cj.section.exploreNow.body",
  possible_next_steps: "cj.section.nextSteps.body",
  longer_term: "cj.section.longerTerm.body",
  unknown: "cj.section.unknown.body",
};

const CATEGORY_LABEL_KEY: Readonly<Record<ReadinessCategory, TranslationKey>> = {
  explore_now: "cj.category.exploreNow",
  possible_next_step: "cj.category.possibleNextStep",
  development_needed: "cj.category.developmentNeeded",
  longer_term_direction: "cj.category.longerTermDirection",
  formal_pathway_required: "cj.category.formalPathway",
  not_enough_information: "cj.category.notEnoughInformation",
};

/** One reason, one sentence. The engine emits reason CODES precisely so the
 *  wording lives here and can be translated, and so a rule change cannot
 *  quietly alter what the report claims. */
const REASON_KEY: Readonly<Record<string, TranslationKey>> = {
  no_professional_profile: "cj.reason.noProfile",
  situation_unknown: "cj.reason.situationUnknown",
  regulated_without_verified_credential: "cj.reason.regulated",
  stage_at_or_below_baseline: "cj.reason.stageAtOrBelow",
  stage_one_level_ahead: "cj.reason.stageOneAhead",
  stage_two_or_more_levels_ahead: "cj.reason.stageTwoAhead",
  adjacent_via_published_transition: "cj.reason.adjacentTransition",
  adjacent_within_current_career_area: "cj.reason.adjacentArea",
  entry_role_open_to_newcomers: "cj.reason.entryRole",
  not_adjacent_to_current_work: "cj.reason.notAdjacent",
  verified_evidence_present: "cj.reason.verifiedEvidence",
};

function titleOf(p: JourneyProfession, locale: Locale): string {
  return locale === "sv" ? p.titleSv : p.titleEn;
}

function CategoryChip({
  category,
  t,
}: {
  category: ReadinessCategory;
  t: (k: TranslationKey) => string;
}) {
  return (
    <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {t(CATEGORY_LABEL_KEY[category])}
    </span>
  );
}

function ProfessionRow({
  profession,
  locale,
  t,
}: {
  profession: JourneyProfession;
  locale: Locale;
  t: (k: TranslationKey) => string;
}) {
  return (
    <li className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{titleOf(profession, locale)}</span>
        <CategoryChip category={profession.category} t={t} />
      </div>
      <ul className="mt-2 space-y-1">
        {profession.reasons
          .filter((r) => REASON_KEY[r])
          .map((r) => (
            <li key={r} className="text-sm leading-relaxed text-muted-foreground">
              {t(REASON_KEY[r])}
            </li>
          ))}
      </ul>
    </li>
  );
}

export function CareerJourneySection({
  journey,
  locale,
  /** "anonymous" hides links that would 401 — same contract V31ReportView
   *  already uses for the rest of the report. */
  mode = "authenticated",
}: {
  readonly journey: CareerJourney | null;
  readonly locale: Locale;
  readonly mode?: "authenticated" | "anonymous";
}) {
  const { t } = useT();

  // ── 2 · WHERE YOU ARE TODAY ─────────────────────────────────────────
  //
  // Rendered first inside the journey, and honestly labelled: everything in
  // it is something the candidate said about themselves. The Passport line
  // below is the only place verification is mentioned, and it says that
  // evidence EXISTS — never what it is, and never that it makes this
  // profile verified.
  const where = journey?.whereYouAreToday ?? null;
  const statusLabel =
    where?.currentStatus != null
      ? pickText(currentStatusOptions.find((o) => o.id === where.currentStatus)!.label, locale)
      : null;
  const yearsLabel =
    where?.yearsOfExperience != null
      ? pickText(
          yearsOfExperienceOptions.find((o) => o.id === where.yearsOfExperience)!.label,
          locale,
        )
      : null;
  const professionLabel = where
    ? ((locale === "sv" ? where.professionTitleSv : where.professionTitleEn) ??
      where.professionOther ??
      null)
    : null;

  const known = journey?.known === true;

  return (
    <section className="mt-16" aria-labelledby="cj-heading">
      <h2
        id="cj-heading"
        className="text-xl font-semibold tracking-tight text-foreground md:text-2xl"
      >
        {t("cj.title")}
      </h2>
      {/* The boundary sentence, on the surface a candidate actually reads
          rather than only in a tooltip they may never open. */}
      <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {t("cj.doesNotChangeDna")}
      </p>

      {/* ── WHERE YOU ARE TODAY ──────────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-border bg-[color:var(--secondary)] p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("cj.whereYouAre")}
        </h3>

        {known && (statusLabel || professionLabel || yearsLabel) ? (
          <>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              {statusLabel ? (
                <div>
                  <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {t("cj.field.status")}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">{statusLabel}</dd>
                </div>
              ) : null}
              {professionLabel ? (
                <div>
                  <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {t("cj.field.profession")}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">{professionLabel}</dd>
                </div>
              ) : null}
              {yearsLabel ? (
                <div>
                  <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {t("cj.field.experience")}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">{yearsLabel}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t("cj.selfReported")}
            </p>
            {journey?.provenance === "self_reported_with_verified_evidence" ? (
              <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent"
                  aria-hidden="true"
                />
                {t("cj.passportSupported")}
              </p>
            ) : null}
          </>
        ) : (
          // ── THE HONEST EMPTY STATE ──────────────────────────────────
          //
          // Not a degraded version of the journey: the journey is absent,
          // and this says so and says what would produce one. No profession
          // is listed under any path heading, because there are no path
          // headings on this branch at all.
          <>
            <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
              {t("cj.unknown.body")}
            </p>
            {mode === "authenticated" ? (
              <Link
                to="/my-career"
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground no-underline transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("cj.unknown.cta")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              // Anonymous: there is no profile to go to yet, and sending
              // somebody to a page that would bounce them to a login wall is
              // worse than telling them what the account is FOR. The save CTA
              // the flow already renders below is the actual route in.
              <p className="mt-4 text-sm font-medium text-foreground">
                {t("cj.unknown.anonymousCta")}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── THE THREE PATH SECTIONS ──────────────────────────────────── */}
      {known
        ? SECTION_ORDER.map((sectionId) => {
            const rows = (journey?.professions ?? []).filter((p) => p.section === sectionId);
            if (rows.length === 0) return null;
            return (
              <div key={sectionId} className="mt-8">
                <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
                  {sectionId === "longer_term" ? (
                    <Flag className="h-4 w-4 text-accent" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="h-4 w-4 text-accent" aria-hidden="true" />
                  )}
                  {t(SECTION_TITLE_KEY[sectionId])}
                </h3>
                <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                  {t(SECTION_BODY_KEY[sectionId])}
                </p>
                <ul className="mt-3">
                  {rows.map((p) => (
                    <ProfessionRow key={p.professionId} profession={p} locale={locale} t={t} />
                  ))}
                </ul>
              </div>
            );
          })
        : null}

      {/* ── WHAT CAN HELP YOU GET THERE ──────────────────────────────── */}
      {known ? (
        <div className="mt-8 rounded-xl border border-border p-6">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {t("cj.whatHelps")}
          </h3>
          <ul className="mt-3 space-y-2">
            <li className="text-sm leading-relaxed text-muted-foreground">
              {t("cj.whatHelps.profile")}
            </li>
            {(journey?.professions ?? []).some((p) => p.regulated) ? (
              <li className="text-sm leading-relaxed text-muted-foreground">
                {t("cj.whatHelps.regulated")}
              </li>
            ) : null}
            {journey?.provenance !== "self_reported_with_verified_evidence" ? (
              <li className="text-sm leading-relaxed text-muted-foreground">
                {t("cj.whatHelps.passport")}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
