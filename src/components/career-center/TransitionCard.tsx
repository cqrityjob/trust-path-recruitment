import { Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, Landmark, MoveRight, ShieldAlert } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  L,
  getCompetency,
  jobsProfessionSlug,
  proficiencyLabels,
  type ProfessionTransition,
  type TransitionKind,
} from "@/lib/career-center";

// One recorded move between two professions, explained.
//
// ── WHAT THIS REPLACED ─────────────────────────────────────────────────
//
// A row in a list of role names. "Ordningsvakt" and "Säkerhetschef" rendered
// identically under "Vanliga steg härifrån", which told a first-year väktare
// that a senior leadership function is one step away.
//
// ── EVERY LINE IS CONDITIONAL ON ITS OWN DATA ──────────────────────────
//
// A transition with no reviewed prose shows no prose and says so. A
// destination with no formal requirements says that too, in as many words —
// "inga formella krav är registrerade" is information, and leaving the
// heading out entirely would let a reader assume we simply had not looked.
//
// Nothing here is per-reader. The card describes two ROLES; whether the
// reader is ready for the move is not a question this product answers.

const KIND_ICON: Record<TransitionKind, typeof MoveRight> = {
  adjacent: MoveRight,
  formal_gate: ShieldAlert,
  long_term: Landmark,
};

/** Colour carries no meaning on its own — every badge also states its kind in
 *  words, so a reader who cannot separate the three tones loses nothing. */
const KIND_TONE: Record<TransitionKind, string> = {
  adjacent: "border-border bg-secondary text-foreground",
  formal_gate: "border-accent/40 bg-accent/10 text-accent",
  long_term: "border-border bg-background text-muted-foreground",
};

/** Beyond four the list stops being read. The cap is on the RENDER, never on
 *  the data: the underlying arrays stay complete for the guard to assert. */
const MAX_ITEMS = 4;

export function TransitionCard({
  transition,
  direction = "onward",
  headingLevel = 3,
  onOpen,
}: {
  transition: ProfessionTransition;
  /** `onward` describes the destination; `inbound` describes where people
   *  came from. The facts are the same; the sentence that frames them is not. */
  direction?: "onward" | "inbound";
  /** The card's title level. Cards under a section heading are h3; cards
   *  under the "Vanliga vägar hit" sub-heading are h4, so the document
   *  outline nests instead of flattening. */
  headingLevel?: 3 | 4;
  onOpen?: (slug: string) => void;
}) {
  const { t, lang } = useT();
  const { from, to, kind } = transition;
  const subject = direction === "onward" ? to : from;
  const Icon = KIND_ICON[kind];

  const title = lang === "sv" ? subject.titleSv : subject.titleEn;
  const fromTitle = lang === "sv" ? from.titleSv : from.titleEn;
  const toTitle = lang === "sv" ? to.titleSv : to.titleEn;

  const competencyName = (id: string) => {
    const c = getCompetency(id);
    return c ? L(c.name, lang) : id;
  };

  const jobsSlug = jobsProfessionSlug(subject);
  const Heading = (headingLevel === 4 ? "h4" : "h3") as "h3" | "h4";

  return (
    <article
      data-transition
      data-transition-to={to.slug}
      data-transition-from={from.slug}
      data-transition-kind={kind}
      className="flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight ${KIND_TONE[kind]}`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t(`cc.step.${kind}` as TranslationKey)}
        </span>
        {transition.likelihood && (
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t(`cc.step.likelihood.${transition.likelihood}` as TranslationKey)}
          </span>
        )}
      </div>

      {/* The pair, always in reading order from -> to, whichever direction the
          card is describing. A reader looking at "Vanliga vägar hit" still
          needs to see which way the arrow points. */}
      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        <span>{fromTitle}</span>
        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span className="font-semibold text-foreground">{toTitle}</span>
      </p>

      <Heading className="mt-1 text-lg font-semibold tracking-tight text-foreground">
        <Link
          to="/career-center/$profession"
          params={{ profession: subject.slug }}
          onClick={() => onOpen?.(subject.slug)}
          className="underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {title}
        </Link>
      </Heading>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t(`cc.step.${kind}.help` as TranslationKey)}
      </p>

      {transition.notes.map((n, i) => (
        <p key={i} className="mt-3 text-sm leading-relaxed text-foreground">
          {L(n, lang)}
        </p>
      ))}
      {transition.evidence === "implicit" && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t("cc.step.evidence.implicit")}
        </p>
      )}

      <dl className="mt-5 space-y-4 border-t border-border pt-5 text-sm">
        <Block label={t("cc.step.why")}>
          {transition.transferable.length > 0 ? (
            <>
              <p className="text-muted-foreground">{t("cc.step.why.body")}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {transition.transferable.slice(0, MAX_ITEMS).map((id) => (
                  <li
                    key={id}
                    className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {competencyName(id)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">{t("cc.step.why.none")}</p>
          )}
        </Block>

        {transition.experienceRequired.length > 0 && (
          <Block label={t("cc.step.experience")}>
            {transition.experienceRequired.map((e, i) => (
              <p key={i} className="text-foreground">
                {L(e, lang)}
              </p>
            ))}
          </Block>
        )}

        <Block label={t("cc.step.formal")}>
          {transition.formalRequirements.length > 0 ? (
            <ul className="space-y-1.5">
              {transition.formalRequirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-foreground">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                  />
                  {L(r, lang)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("cc.step.formal.none")}</p>
          )}
        </Block>

        {transition.raised.length > 0 && (
          <Block label={t("cc.step.build")}>
            <ul className="flex flex-wrap gap-1.5">
              {transition.raised.slice(0, MAX_ITEMS).map((d) => (
                <li
                  key={d.competencyId}
                  className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  {competencyName(d.competencyId)}
                  <span className="ml-1.5 text-muted-foreground">
                    {L(proficiencyLabels[d.to], lang)}
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {transition.via.length > 0 && (
          <Block label={t("cc.step.via")}>
            <p className="text-muted-foreground">{t("cc.step.via.body")}</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {transition.via.map((p) => (
                <li key={p.slug}>
                  <Link
                    to="/career-center/$profession"
                    params={{ profession: p.slug }}
                    onClick={() => onOpen?.(p.slug)}
                    data-transition-via={p.slug}
                    className="inline-flex min-h-11 items-center font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {lang === "sv" ? p.titleSv : p.titleEn}
                  </Link>
                </li>
              ))}
            </ul>
          </Block>
        )}
      </dl>

      {/* One primary action per card. The jobs link only exists when the
          profession has a CIG node the job catalogue can actually be queried
          on — otherwise it would always render "no openings", which reads as
          "nobody is hiring" rather than "we cannot ask yet". */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-5">
        <Link
          to="/career-center/$profession"
          params={{ profession: subject.slug }}
          onClick={() => onOpen?.(subject.slug)}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("cc.step.next.guide")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        {jobsSlug && (
          <Link
            to="/jobs/profession/$professionSlug"
            params={{ professionSlug: jobsSlug }}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Briefcase className="h-3.5 w-3.5" aria-hidden />
            {t("cc.step.next.jobs")}
          </Link>
        )}
      </div>
    </article>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1.5 leading-relaxed">{children}</dd>
    </div>
  );
}
