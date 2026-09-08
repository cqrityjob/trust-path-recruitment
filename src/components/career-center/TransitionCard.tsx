import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  ChevronDown,
  ExternalLink,
  FileSearch,
  Landmark,
  MoveRight,
  ShieldAlert,
} from "lucide-react";
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

// One recorded move between two professions.
//
// ── WHAT IS VISIBLE, AND WHAT IS ONE CLICK AWAY ────────────────────────
//
// The first version of this card put everything on the page at once: the
// competency overlap, the raised demands, the destination's full formal
// requirements, the intermediate roles and the reviewed prose, for every
// transition, unfolded. Four of them made a 4,200px section on a phone —
// which reproduced, in a new shape, exactly the "rörig" problem the rebuild
// was supposed to end.
//
// So the card is now a SUMMARY plus a disclosure. Visible without any
// interaction: what kind of step this is, which two roles, and the one
// sentence that says why that kind matters. Everything that answers "what
// exactly would I have to do" lives behind a native <details>, which keeps
// keyboard support and in-page search working without a line of script.
//
// ── AN UNREVIEWED MOVE SAYS LESS ───────────────────────────────────────
//
// `evidenceLevel` comes from transitions.ts. A move backed by a placeholder
// edge — no source, no jurisdiction, no review date — renders as a possible
// direction under review. It keeps the two role names and the competency
// overlap, because both of those are restatements of the guides themselves,
// and it loses every claim about the move: no likelihood, no experience
// statement, no progression wording. The model enforces that by returning
// empty arrays; this component could not print them if it tried.

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
  /** The card's title level, so the document outline nests instead of
   *  flattening under a sub-heading. */
  headingLevel?: 3 | 4;
  onOpen?: (slug: string) => void;
}) {
  const { t, lang } = useT();
  const { from, to, kind } = transition;
  const subject = direction === "onward" ? to : from;
  const Icon = KIND_ICON[kind];
  const underReview = transition.evidenceLevel === "under_review";

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
      data-transition-evidence={transition.evidenceLevel}
      className="flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight ${KIND_TONE[kind]}`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t(`cc.step.${kind}` as TranslationKey)}
        </span>
        {/* A frequency label needs frequency evidence. `likelihood` is null
            everywhere in the current dataset, so nothing renders here. */}
        {transition.likelihood && (
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t(`cc.step.likelihood.${transition.likelihood}` as TranslationKey)}
          </span>
        )}
        {underReview && (
          <span
            data-transition-under-review
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
          >
            <FileSearch className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {t("cc.step.under_review")}
          </span>
        )}
      </div>

      {/* The pair, in reading order. Rendered only for an INBOUND card, where
          the heading names the origin and the direction of travel would
          otherwise be ambiguous. On an onward card the section heading
          already says "steg härifrån" and the line is a repeat. */}
      {direction === "inbound" && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span>{fromTitle}</span>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span className="font-semibold text-foreground">{toTitle}</span>
        </p>
      )}

      <Heading className="mt-3 text-lg font-semibold tracking-tight text-foreground">
        {/* A heading link is still a tap target: `min-h-11` rather than the
            22px an inline link inherits from its line box. */}
        <Link
          to="/career-center/$profession"
          params={{ profession: subject.slug }}
          onClick={() => onOpen?.(subject.slug)}
          className="inline-flex min-h-11 items-center underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {title}
        </Link>
      </Heading>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {underReview ? t("cc.step.under_review.help") : t(`cc.step.${kind}.help` as TranslationKey)}
      </p>

      {/* ── DETAIL, BEHIND A DISCLOSURE ──────────────────────────────── */}
      <details data-transition-detail className="group mt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          {t("cc.step.detail")}
          <ChevronDown
            className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </summary>

        <dl className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
          {/* Reviewed prose. Empty unless the transition cleared the evidence
              bar — the model returns [] rather than leaving it to this file. */}
          {transition.notes.length > 0 && (
            <Block label={t("cc.step.what")}>
              {transition.notes.map((n, i) => (
                <p key={i} className="text-foreground">
                  {L(n, lang)}
                </p>
              ))}
            </Block>
          )}

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

          {/* The transition's OWN sources, and the jurisdiction they hold in.
              A guide's sources are about the role; these are about the move. */}
          {transition.sources.length > 0 && (
            <Block label={t("cc.step.sources")}>
              <ul className="space-y-1.5">
                {transition.sources.map((s, i) => (
                  <li key={i}>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 text-foreground underline-offset-4 hover:text-accent hover:underline"
                      >
                        {L(s.label, lang)}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : (
                      <span className="text-foreground">{L(s.label, lang)}</span>
                    )}
                    {s.publisher && <span className="text-muted-foreground"> — {s.publisher}</span>}
                  </li>
                ))}
              </ul>
              {transition.countries.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("cc.step.jurisdiction")}: {transition.countries.join(", ")}
                </p>
              )}
            </Block>
          )}
        </dl>
      </details>

      {/* ONE action here, not two. The card's heading is already the link to
          the guide; repeating it in a footer row was a second copy of the same
          destination and roughly 90px per card. The jobs link is the only
          thing this row adds, and it only exists when the profession has a CIG
          node the job catalogue can be queried on — otherwise it would always
          render "no openings", which reads as "nobody is hiring". */}
      {jobsSlug && (
        <div className="mt-auto border-t border-border pt-4">
          <Link
            to="/jobs/profession/$professionSlug"
            params={{ professionSlug: jobsSlug }}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Briefcase className="h-3.5 w-3.5" aria-hidden />
            {t("cc.step.next.jobs")}
          </Link>
        </div>
      )}
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
