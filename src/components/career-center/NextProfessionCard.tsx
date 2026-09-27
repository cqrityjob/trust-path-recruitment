import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
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
  proficiencyLabels,
  type ProfessionTransition,
  type TransitionKind,
} from "@/lib/career-center";
import { connectionText } from "./connection-text";

// One possible next profession: named, its connection to where the reader
// stands in one sentence, what it formally requires, and ONE click to its
// information.
//
// ── WHAT THE CARD BEFORE IT GOT WRONG ──────────────────────────────────
//
// TransitionCard linked the destination through its heading and nothing
// else. The only things on the card that LOOKED like actions were "Vad
// steget innebär ▾", a disclosure, and "Se lediga jobb". A reader who chose
// Väktare and wanted to open Ordningsvakt looked for a button, found a
// disclosure, and read the promise "Möjliga nästa steg" as a dead end.
//
// So the card now ends in the action it promises — "Läs om {yrke}" — and
// that link covers the whole card (its ::after is stretched over it), so a
// tap anywhere on the card opens the profession. The link is the only
// focusable thing on the card unless the detail disclosure is shown, and
// that disclosure sits ABOVE the stretched link, so it stays operable and is
// never nested inside it.
//
// ── EVERY WORD ABOUT THE CONNECTION IS DERIVED ─────────────────────────
//
// The sentence under the name compares the two guides: the destination's
// level against the origin's, whether it is a separately regulated
// profession with its own requirements, whether it asks for more
// leadership. Each is read from the guides themselves (`levelDelta`,
// `kind`, `leadershipRaised`), so it can be said about a move whose own
// evidence is still under review — it says nothing about how common the
// move is or what it takes beyond what the destination's own guide states.
// A move under review says so in a badge; the list explains the badge once.
//
// Reviewed prose, shared competencies, the destination's full formal
// requirements, intermediate roles and the move's own sources are the
// fördjupning: the profession guide shows them behind "Vad steget
// innebär" (`detail`); the hub leaves them to the guide.

const KIND_ICON: Record<TransitionKind, typeof MoveRight> = {
  adjacent: MoveRight,
  formal_gate: ShieldAlert,
  long_term: Landmark,
};

/** Colour carries no meaning on its own — every badge states its kind in
 *  words, so a reader who cannot separate the three tones loses nothing. */
const KIND_TONE: Record<TransitionKind, string> = {
  adjacent: "border-border bg-secondary text-foreground",
  formal_gate: "border-accent/40 bg-accent/10 text-accent",
  long_term: "border-border bg-background text-muted-foreground",
};

/** Beyond four the lists inside the detail stop being read. The cap is on
 *  the RENDER, never on the data. */
const MAX_ITEMS = 4;

export function NextProfessionCard({
  transition,
  direction = "onward",
  headingLevel = 3,
  detail = false,
  onOpen,
}: {
  transition: ProfessionTransition;
  /** `onward` describes the destination; `inbound` names where people come
   *  FROM on the way to this profession. */
  direction?: "onward" | "inbound";
  headingLevel?: 3 | 4;
  /** Render the move's reviewed prose, sources and competency comparison
   *  behind a disclosure — on the profession guide, not on the hub. */
  detail?: boolean;
  /** Fired alongside navigation, with the Career Center slug opened. */
  onOpen?: (slug: string) => void;
}) {
  const { t, lang } = useT();
  const { from, to, kind } = transition;
  const subject = direction === "onward" ? to : from;
  const Icon = KIND_ICON[kind];
  const underReview = transition.evidenceLevel === "under_review";
  const title = lang === "sv" ? subject.titleSv : subject.titleEn;
  const Heading = (headingLevel === 4 ? "h4" : "h3") as "h3" | "h4";
  const firstRequirement = subject.formalRequirements?.[0];

  return (
    <article
      data-transition
      data-next-profession={subject.slug}
      data-transition-to={to.slug}
      data-transition-from={from.slug}
      data-transition-kind={kind}
      data-transition-evidence={transition.evidenceLevel}
      className="group relative flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-within:border-accent/60 md:p-6"
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
            {t("cc.next.underReview")}
          </span>
        )}
      </div>

      {direction === "inbound" && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span>{lang === "sv" ? from.titleSv : from.titleEn}</span>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span className="font-semibold text-foreground">
            {lang === "sv" ? to.titleSv : to.titleEn}
          </span>
        </p>
      )}

      <Heading className="mt-3 text-lg font-semibold tracking-tight text-foreground">
        {title}
      </Heading>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {L(subject.description, lang)}
      </p>
      {direction === "onward" && (
        <p data-next-connection className="mt-3 text-sm leading-relaxed text-foreground">
          {connectionText(transition, t, lang)}
        </p>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("cc.card.formal")}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground">
          {firstRequirement ? L(firstRequirement, lang) : t("cc.card.formal.none")}
        </p>
      </div>

      {/* THE action. Its ::after covers the card, so the whole card opens
          the profession; the disclosure below is lifted above it. */}
      <Link
        to="/career-center/$profession"
        params={{ profession: subject.slug }}
        onClick={() => onOpen?.(subject.slug)}
        data-next-profession-link={subject.slug}
        className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-3 text-sm font-semibold text-accent underline-offset-4 after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-[color:var(--accent-hover)] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2"
      >
        {t("cc.info.read").replace("{role}", title)}
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>

      {detail && <TransitionDetail transition={transition} onOpen={onOpen} />}
    </article>
  );
}

/** "Vad steget innebär" — the fördjupning behind a native <details>, which
 *  keeps keyboard support and in-page search without a line of script. */
function TransitionDetail({
  transition,
  onOpen,
}: {
  transition: ProfessionTransition;
  onOpen?: (slug: string) => void;
}) {
  const { t, lang } = useT();
  const competencyName = (id: string) => {
    const c = getCompetency(id);
    return c ? L(c.name, lang) : id;
  };

  return (
    <details data-transition-detail className="group/detail relative z-10 mt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        {t("cc.step.detail")}
        <ChevronDown
          className="h-4 w-4 transition-transform duration-200 group-open/detail:rotate-180"
          aria-hidden
        />
      </summary>

      <dl className="mt-3 space-y-4 border-t border-border pt-4 text-sm">
        {/* What the badge means. A move under review gets the review
            caveat INSTEAD of the kind's wording: "bygger vidare på
            erfarenhet…" is a claim about the move, which an unreviewed
            record may not make. */}
        {transition.evidenceLevel === "under_review" ? (
          <Block label={t("cc.step.under_review")}>
            <p className="text-muted-foreground">{t("cc.step.under_review.help")}</p>
          </Block>
        ) : (
          <Block label={t(`cc.step.${transition.kind}` as TranslationKey)}>
            <p className="text-muted-foreground">
              {t(`cc.step.${transition.kind}.help` as TranslationKey)}
            </p>
          </Block>
        )}

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
