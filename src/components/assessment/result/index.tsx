import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Compass,
  Eye,
  GraduationCap,
  Info,
  Layers,
  ListChecks,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { useT } from "@/i18n/context";
import type { Lang } from "@/i18n/dictionaries";
import { pickText } from "@/lib/assessment-content";
import type { Bi } from "@/lib/career-center/types";
import { getProfession, getCompetency, getEducation, getCertification, professionFamilies, getFamily } from "@/lib/career-center";
import { cn } from "@/lib/utils";
import { PrimaryButton, PrimaryLink } from "@/components/site/PrimaryButton";
import {
  confidenceLabel,
  dimensionById,
  earlyModelNote,
  formalRequirementsNote,
  matchIndicatorLabel,
  matchTooltip,
  placeholderProfessionNotice,
  researchedProfessionNotice,
  unansweredReducesEvidence,
  whyThisResult,
  type ActionItem,
  type ActionPlan,
  type CompareRow,
  type DimensionId,
  type DimensionScore,
  type ExperienceBackground,
  type MatchResult,
  type PathwayStep,
  type ResultSession,
  experienceBackgrounds,
} from "@/lib/career-assessment";

// -------------------- Small helpers --------------------

function TokenBadge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warn" | "accent" }) {
  const cls =
    tone === "warn"
      ? "border-border bg-muted/40 text-muted-foreground"
      : tone === "accent"
        ? "border-accent/40 bg-accent/10 text-accent"
        : "border-border bg-background text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest", cls)}>
      {children}
    </span>
  );
}

function SectionCard({
  title,
  eyebrow,
  children,
  actions,
  id,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="rounded-lg border border-border bg-background p-6 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-widest text-accent">{eyebrow}</p>
          )}
          <h2
            className="mt-1 text-xl font-semibold tracking-tight text-foreground md:text-2xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h2>
        </div>
        {actions}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// -------------------- ResultHero --------------------

export function ResultHero({
  session,
  active,
  lang,
}: {
  session: ResultSession;
  active: MatchResult;
  lang: Lang;
}) {
  const { t } = useT();
  const profession = getProfession(active.professionId);
  const title: Bi = profession
    ? { sv: profession.titleSv, en: profession.titleEn }
    : { sv: active.professionId, en: active.professionId };
  const status = active.professionContentStatus;
  const isPlaceholder = status === "placeholder";
  const isResearched = status === "researched" || status === "reviewed" || status === "published";
  const unansweredCount = session.unobservedDimensions.length; // rough proxy — used only for wording

  const familyId = profession?.family ?? active.family;
  const familyLabel = getFamily(familyId)?.name;

  return (
    <section className="rounded-lg border border-border bg-gradient-to-br from-muted/40 via-background to-background p-8 md:p-10">
      <div className="flex flex-wrap items-center gap-2">
        <TokenBadge tone="accent">
          <CheckCircle2 className="mr-1 h-3 w-3" strokeWidth={2} /> {t("sca.results.eyebrow")}
        </TokenBadge>
        <TokenBadge>{pickText(confidenceLabel[active.confidence], lang)}</TokenBadge>
        {isPlaceholder && (
          <TokenBadge tone="warn">
            {lang === "sv" ? "Under uppbyggnad" : "In development"}
          </TokenBadge>
        )}
        {active.regulated && (
          <TokenBadge tone="warn">
            {lang === "sv" ? "Reglerad roll" : "Regulated role"}
          </TokenBadge>
        )}
      </div>
      <h1
        className="mt-6 text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t("sca.hero.title")}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
        {t("sca.hero.lead")}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 rounded-md border border-border bg-background/70 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("sca.hero.top_label")}
          </p>
          <p
            className="mt-1 text-2xl font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {pickText(title, lang)}
          </p>
          {familyLabel && (
            <p className="mt-1 text-sm text-muted-foreground">{pickText(familyLabel, lang)}</p>
          )}
        </div>
        <div className="text-right">
          <p
            className="text-5xl font-semibold tracking-tight text-foreground tabular-nums"
            title={pickText(matchTooltip, lang)}
          >
            {active.displayedMatch}
            <span className="ml-0.5 text-xl text-muted-foreground">%</span>
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            {pickText(matchIndicatorLabel, lang)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {pickText(active.confidenceReason, lang)}
      </p>
      {unansweredCount > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {pickText(unansweredReducesEvidence, lang)}
        </p>
      )}
      {isPlaceholder && (
        <p className="mt-3 rounded-md border border-border/60 bg-background px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {pickText(placeholderProfessionNotice, lang)}
        </p>
      )}
      {isResearched && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {pickText(researchedProfessionNotice, lang)}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {profession && (
          <PrimaryLink to={`/career-center/${profession.slug}`}>
            {t("sca.hero.cta.primary")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </PrimaryLink>
        )}
        <a
          href="#compare"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {t("sca.hero.cta.secondary")}
        </a>
      </div>
      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground/80">
        {pickText(matchTooltip, lang)}
      </p>
    </section>
  );
}

// -------------------- CareerMatchOverview + CareerMatchCard --------------------

export function CareerMatchCard({
  match,
  rank,
  active,
  onSelect,
  lang,
  showAsAlternative = false,
}: {
  match: MatchResult;
  rank: number;
  active?: boolean;
  onSelect?: () => void;
  lang: Lang;
  showAsAlternative?: boolean;
}) {
  const p = getProfession(match.professionId);
  const title: Bi = p ? { sv: p.titleSv, en: p.titleEn } : { sv: match.professionId, en: match.professionId };
  const fam = p ? getFamily(p.family) : undefined;
  const isPlaceholder = match.professionContentStatus === "placeholder";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      title={pickText(matchTooltip, lang)}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-lg border bg-background p-5 text-left transition-colors",
        active ? "border-accent ring-1 ring-accent/40" : "border-border hover:border-accent/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
            showAsAlternative
              ? "border-border bg-muted/40 text-foreground"
              : "border-accent/40 bg-accent/10 text-accent",
          )}>{rank}</span>
          <div>
            <p
              className="text-sm font-semibold tracking-tight text-foreground md:text-base"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pickText(title, lang)}
            </p>
            {fam && (
              <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                {pickText(fam.name, lang)}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
            {match.displayedMatch}
            <span className="ml-0.5 text-xs text-muted-foreground">%</span>
          </p>
          <p className="mt-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
            {pickText(matchIndicatorLabel, lang)}
          </p>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <TokenBadge>{pickText(confidenceLabel[match.confidence], lang)}</TokenBadge>
        {p?.level && <TokenBadge>{p.level}</TokenBadge>}
        {(match.regulated || p?.regulated) && (
          <TokenBadge tone="warn">{lang === "sv" ? "Reglerad" : "Regulated"}</TokenBadge>
        )}
        {isPlaceholder && (
          <TokenBadge tone="warn">{lang === "sv" ? "Under uppbyggnad" : "In development"}</TokenBadge>
        )}
      </div>
    </button>
  );
}

export function CareerMatchOverview({
  matches,
  activeId,
  onSelect,
  lang,
}: {
  matches: MatchResult[];
  activeId: string;
  onSelect: (id: string) => void;
  lang: Lang;
}) {
  const { t } = useT();
  const [primary, ...alternatives] = matches;
  if (!primary) return null;
  return (
    <SectionCard title={t("sca.overview.title")} eyebrow={t("sca.overview.eyebrow")}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("sca.overview.lead")}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4">
        <CareerMatchCard
          match={primary}
          rank={1}
          active={activeId === primary.professionId}
          onSelect={() => onSelect(primary.professionId)}
          lang={lang}
        />
        {alternatives.length > 0 && (
          <>
            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("sca.overview.alternatives")}
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {alternatives.map((m, i) => (
                <CareerMatchCard
                  key={m.professionId}
                  match={m}
                  rank={i + 2}
                  active={activeId === m.professionId}
                  onSelect={() => onSelect(m.professionId)}
                  lang={lang}
                  showAsAlternative
                />
              ))}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}

// -------------------- WhyThisResult --------------------

export function WhyThisResult({ match, lang }: { match: MatchResult; lang: Lang }) {
  const { t } = useT();
  const profession = getProfession(match.professionId);
  const title: Bi = profession
    ? { sv: profession.titleSv, en: profession.titleEn }
    : { sv: match.professionId, en: match.professionId };
  const why = whyThisResult(match, title);

  return (
    <SectionCard title={t("sca.why.title")} eyebrow={t("sca.why.eyebrow")}>
      <p className="text-sm leading-relaxed text-foreground">{pickText(why, lang)}</p>
      {match.topDimensions.length > 0 && (
        <>
          <h3 className="mt-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("sca.why.reasons")}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-foreground">
            {match.topDimensions.map((d) => (
              <li key={d} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
                <span>
                  <span className="font-medium">{pickText(dimensionById[d].name, lang)}</span>
                  <span className="text-muted-foreground"> — {pickText(dimensionById[d].description, lang)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {match.gaps.length > 0 && (
        <>
          <h3 className="mt-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("sca.why.limits")}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {match.gaps.slice(0, 2).map((d) => (
              <li key={d} className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
                <span>
                  {lang === "sv"
                    ? `Underlaget för ${pickText(dimensionById[d].name, lang).toLowerCase()} är svagare i dina svar.`
                    : `Evidence for ${pickText(dimensionById[d].name, lang).toLowerCase()} is weaker in your answers.`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

// -------------------- GuidanceDimensionBar + Profile --------------------

export function GuidanceDimensionBar({
  dimension,
  score,
  lang,
}: {
  dimension: DimensionId;
  score: DimensionScore;
  lang: Lang;
}) {
  const dim = dimensionById[dimension];
  const value = Math.round(score.normalized);
  const observed = score.observed;
  const bandLabel = !observed
    ? lang === "sv"
      ? "Ej observerad"
      : "Not observed"
    : value >= 65
      ? lang === "sv"
        ? "Framträdande"
        : "Prominent"
      : value >= 45
        ? lang === "sv"
          ? "Måttlig"
          : "Moderate"
        : lang === "sv"
          ? "Låg"
          : "Low";
  return (
    <div className="rounded-md border border-border/60 bg-background p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{pickText(dim.name, lang)}</p>
        <p className="text-xs text-muted-foreground tabular-nums" aria-hidden>
          {observed ? `${value} / 100` : "—"}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuenow={observed ? value : 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pickText(dim.name, lang)}: ${bandLabel}${observed ? `, ${value}` : ""}`}
        className={cn("mt-2 h-2 w-full overflow-hidden rounded-full", observed ? "bg-muted/60" : "bg-muted/30")}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            observed ? "bg-accent" : "bg-transparent",
          )}
          style={{ width: observed ? `${value}%` : "0%" }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{bandLabel}</span>
        {!observed && (
          <TokenBadge tone="warn">
            {lang === "sv" ? "Begränsat underlag" : "Limited evidence"}
          </TokenBadge>
        )}
      </div>
    </div>
  );
}

export function CareerGuidanceProfile({
  vector,
  lang,
}: {
  vector: DimensionScore[];
  lang: Lang;
}) {
  const { t } = useT();
  const observed = vector.filter((v) => v.observed).sort((a, b) => b.normalized - a.normalized);
  const unobserved = vector.filter((v) => !v.observed);
  return (
    <SectionCard title={t("sca.profile.title")} eyebrow={t("sca.profile.eyebrow")}>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("sca.profile.lead")}</p>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {observed.map((v) => (
          <GuidanceDimensionBar key={v.dimension} dimension={v.dimension} score={v} lang={lang} />
        ))}
      </div>
      {unobserved.length > 0 && (
        <div className="mt-6 rounded-md border border-border/60 bg-muted/30 p-4">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("sca.profile.unobserved")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("sca.profile.unobserved.lead")}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unobserved.map((v) => (
              <li key={v.dimension}>
                <TokenBadge>{pickText(dimensionById[v.dimension].name, lang)}</TokenBadge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

// -------------------- CareerComparison --------------------

export function CareerComparison({
  rows,
  lang,
}: {
  rows: CompareRow[];
  lang: Lang;
}) {
  const { t } = useT();
  if (rows.length === 0) return null;
  return (
    <SectionCard id="compare" title={t("sca.compare.title")} eyebrow={t("sca.compare.eyebrow")}>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("sca.compare.lead")}</p>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, i) => (
          <article key={r.professionId} className="flex flex-col gap-3 rounded-md border border-border bg-background p-5">
            <header>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                #{i + 1} · {pickText(r.familyLabel, lang)}
              </p>
              <h3
                className="mt-1 text-base font-semibold tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {pickText(r.title, lang)}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <TokenBadge>{r.displayedMatch}% · {pickText(matchIndicatorLabel, lang)}</TokenBadge>
                <TokenBadge>{pickText(confidenceLabel[r.confidence], lang)}</TokenBadge>
                {r.level && <TokenBadge>{r.level}</TokenBadge>}
                {r.regulated && <TokenBadge tone="warn">{lang === "sv" ? "Reglerad" : "Regulated"}</TokenBadge>}
                {r.contentStatus === "placeholder" && (
                  <TokenBadge tone="warn">{lang === "sv" ? "Under uppbyggnad" : "In development"}</TokenBadge>
                )}
              </div>
            </header>

            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {t("sca.compare.why")}
              </p>
              <p className="mt-1 text-sm text-foreground">{pickText(r.whyItMayFit, lang)}</p>
            </div>

            {r.workEnvironments.length > 0 && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {t("sca.compare.env")}
                </p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {r.workEnvironments.slice(0, 2).map((w, k) => (
                    <li key={k}>· {pickText(w, lang)}</li>
                  ))}
                </ul>
              </div>
            )}

            {r.competencies.length > 0 && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {t("sca.compare.competencies")}
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {r.competencies.map((c) => {
                    const comp = getCompetency(c);
                    if (!comp) return null;
                    return (
                      <li key={c}>
                        <TokenBadge>{pickText(comp.name, lang)}</TokenBadge>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {r.formalRequirements.length > 0 && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {t("sca.compare.formal")}
                </p>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {r.formalRequirements.slice(0, 2).map((req, k) => (
                    <li key={k}>· {pickText(req, lang)}</li>
                  ))}
                </ul>
              </div>
            )}

            {r.nextRoleTitle && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {t("sca.compare.next_role")}
                </p>
                <p className="mt-1 text-sm text-foreground">{pickText(r.nextRoleTitle, lang)}</p>
              </div>
            )}

            {r.slug && (
              <Link
                to="/career-center/$profession"
                params={{ profession: r.slug }}
                className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
              >
                {t("cc.cta.explore")} <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </article>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/80">
        {pickText(matchTooltip, lang)}
      </p>
    </SectionCard>
  );
}

// -------------------- ExperienceBackgroundSelector --------------------

export function ExperienceBackgroundSelector({
  value,
  onChange,
  lang,
}: {
  value?: ExperienceBackground;
  onChange: (v: ExperienceBackground) => void;
  lang: Lang;
}) {
  const { t } = useT();
  return (
    <SectionCard title={t("sca.bg.title")} eyebrow={t("sca.bg.eyebrow")}>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("sca.bg.lead")}</p>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={t("sca.bg.title")}>
        {experienceBackgrounds.map((b) => {
          const active = value === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(b.id)}
              className={cn(
                "text-left rounded-md border p-4 transition-colors",
                active ? "border-accent bg-accent/5 ring-1 ring-accent/40" : "border-border bg-background hover:border-accent/60",
              )}
            >
              <p className="text-sm font-medium text-foreground">{pickText(b.label, lang)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{pickText(b.description, lang)}</p>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{t("sca.bg.note")}</p>
    </SectionCard>
  );
}

// -------------------- CareerPathPosition --------------------

export function CareerPathPosition({
  pathway,
  lang,
}: {
  pathway: PathwayStep[];
  lang: Lang;
}) {
  const { t } = useT();
  if (pathway.length <= 1) return null;
  return (
    <SectionCard title={t("sca.path.title")} eyebrow={t("sca.path.eyebrow")}>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("sca.path.lead")}</p>
      <ol className="mt-6 flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
        {pathway.map((step, i) => {
          const isLast = i === pathway.length - 1;
          const isCurrent = step.role === "current";
          return (
            <Fragment key={step.professionId + i}>
              <li
                className={cn(
                  "flex-1 rounded-md border p-4",
                  isCurrent ? "border-accent bg-accent/5" : "border-border bg-background",
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {step.role === "previous"
                    ? t("sca.path.role.previous")
                    : step.role === "current"
                      ? t("sca.path.role.current")
                      : t("sca.path.role.next")}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">{pickText(step.title, lang)}</p>
              </li>
              {!isLast && (
                <div className="hidden md:flex items-center justify-center px-2 text-muted-foreground" aria-hidden>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Fragment>
          );
        })}
      </ol>
      <p className="mt-4 text-[11px] text-muted-foreground">{t("sca.path.disclaimer")}</p>
    </SectionCard>
  );
}

// -------------------- StrengthInsight + DevelopmentInsight --------------------

export function StrengthInsight({
  dimensionIds,
  competencyIds,
  lang,
}: {
  dimensionIds: DimensionId[];
  competencyIds: string[];
  lang: Lang;
}) {
  const { t } = useT();
  return (
    <SectionCard title={t("sca.strengths.title")} eyebrow={t("sca.strengths.eyebrow")}>
      {dimensionIds.length === 0 && competencyIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sca.strengths.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {dimensionIds.map((d) => (
            <div key={d} className="rounded-md border border-border/60 bg-background p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.75} />
                <p className="text-sm font-semibold text-foreground">{pickText(dimensionById[d].name, lang)}</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {pickText(dimensionById[d].description, lang)}
              </p>
            </div>
          ))}
          {competencyIds.map((c) => {
            const comp = getCompetency(c);
            if (!comp) return null;
            return (
              <div key={c} className="rounded-md border border-border/60 bg-background p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <p className="text-sm font-semibold text-foreground">{pickText(comp.name, lang)}</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {pickText(comp.definition, lang)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export function DevelopmentInsight({
  dimensionIds,
  competencyIds,
  lang,
}: {
  dimensionIds: DimensionId[];
  competencyIds: string[];
  lang: Lang;
}) {
  const { t } = useT();
  return (
    <SectionCard title={t("sca.dev.title")} eyebrow={t("sca.dev.eyebrow")}>
      <p className="text-sm text-muted-foreground">{t("sca.dev.lead")}</p>
      {dimensionIds.length === 0 && competencyIds.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("sca.dev.empty")}</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {dimensionIds.map((d) => (
            <div key={d} className="rounded-md border border-border/60 bg-background p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" strokeWidth={1.75} />
                <p className="text-sm font-semibold text-foreground">{pickText(dimensionById[d].name, lang)}</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {pickText(dimensionById[d].description, lang)}
              </p>
              <p className="mt-2 text-[11px] text-accent">
                {lang === "sv"
                  ? "Prova en konkret aktivitet – kurs, projekt eller uppdrag – som ger dig träning inom det här området."
                  : "Try one concrete activity — a course, project or assignment — that gives you practice in this area."}
              </p>
            </div>
          ))}
          {competencyIds.map((c) => {
            const comp = getCompetency(c);
            if (!comp) return null;
            return (
              <div key={c} className="rounded-md border border-border/60 bg-background p-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <p className="text-sm font-semibold text-foreground">{pickText(comp.name, lang)}</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {pickText(comp.definition, lang)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// -------------------- Education & Certification --------------------

export function EducationRecommendation({
  ids,
  lang,
  isPlaceholder,
}: {
  ids: string[];
  lang: Lang;
  isPlaceholder: boolean;
}) {
  const { t } = useT();
  const items = ids.map((id) => getEducation(id)).filter((x) => x);
  return (
    <SectionCard title={t("sca.edu.title")} eyebrow={t("sca.edu.eyebrow")}>
      {isPlaceholder ? (
        <p className="text-sm text-muted-foreground">{t("sca.edu.placeholder")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sca.edu.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((e) => (
            <li key={e!.id} className="rounded-md border border-border/60 bg-background p-4">
              <div className="flex items-start gap-2">
                <GraduationCap className="mt-0.5 h-4 w-4 text-accent" strokeWidth={1.75} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{pickText(e!.name, lang)}</p>
                  {e!.provider && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{pickText(e!.provider, lang)}</p>
                  )}
                  <p className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                    {e!.scope.join(" · ")}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{pickText(formalRequirementsNote, lang)}</p>
    </SectionCard>
  );
}

export function CertificationRecommendation({
  ids,
  lang,
  isPlaceholder,
}: {
  ids: string[];
  lang: Lang;
  isPlaceholder: boolean;
}) {
  const { t } = useT();
  const items = ids.map((id) => getCertification(id)).filter((x) => x);
  return (
    <SectionCard title={t("sca.cert.title")} eyebrow={t("sca.cert.eyebrow")}>
      {isPlaceholder ? (
        <p className="text-sm text-muted-foreground">{t("sca.cert.placeholder")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sca.cert.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((c) => (
            <li key={c!.id} className="rounded-md border border-border/60 bg-background p-4">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-accent" strokeWidth={1.75} />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {c!.shortName ? `${c!.shortName} · ` : ""}{pickText(c!.fullName, lang)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{pickText(c!.issuer, lang)}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                    {c!.scope.join(" · ")}
                    {c!.mandatory ? " · " + (lang === "sv" ? "Obligatorisk" : "Required") : ""}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// -------------------- Career Action Plan --------------------

export function ActionPlanHorizon({
  title,
  eyebrow,
  items,
  lang,
  icon,
}: {
  title: string;
  eyebrow: string;
  items: ActionItem[];
  lang: Lang;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-md border border-border bg-background p-5">
      <div className="flex items-center gap-2 text-accent">
        {icon}
        <p className="text-[10px] font-medium uppercase tracking-widest">{eyebrow}</p>
      </div>
      <h3
        className="mt-2 text-base font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <ul className="mt-4 space-y-2 text-sm text-foreground">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
            <span>{pickText(item.text, lang)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function CareerActionPlan({ plan, lang }: { plan: ActionPlan; lang: Lang }) {
  const { t } = useT();
  return (
    <SectionCard id="plan" title={t("sca.plan.title")} eyebrow={t("sca.plan.eyebrow")}>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("sca.plan.lead")}</p>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <ActionPlanHorizon
          title={t("sca.plan.now.title")}
          eyebrow={t("sca.plan.now.eyebrow")}
          items={plan.now}
          lang={lang}
          icon={<CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />}
        />
        <ActionPlanHorizon
          title={t("sca.plan.mid.title")}
          eyebrow={t("sca.plan.mid.eyebrow")}
          items={plan.midTerm}
          lang={lang}
          icon={<Layers className="h-4 w-4" strokeWidth={1.75} />}
        />
        <ActionPlanHorizon
          title={t("sca.plan.long.title")}
          eyebrow={t("sca.plan.long.eyebrow")}
          items={plan.longTerm}
          lang={lang}
          icon={<TrendingUp className="h-4 w-4" strokeWidth={1.75} />}
        />
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{t("sca.plan.note")}</p>
    </SectionCard>
  );
}

// -------------------- Career Family Exploration --------------------

export function CareerFamilyExploration({
  topFamily,
  relatedFamilies,
  lang,
}: {
  topFamily?: string;
  relatedFamilies: string[];
  lang: Lang;
}) {
  const { t } = useT();
  const top = topFamily ? professionFamilies.find((f) => f.id === topFamily) : undefined;
  const related = relatedFamilies
    .map((id) => professionFamilies.find((f) => f.id === id))
    .filter((x) => x);
  if (!top && related.length === 0) return null;
  return (
    <SectionCard title={t("sca.family.title")} eyebrow={t("sca.family.eyebrow")}>
      {top && (
        <div className="rounded-md border border-accent/40 bg-accent/5 p-5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-accent">
            {t("sca.family.top")}
          </p>
          <p className="mt-1 text-base font-semibold tracking-tight text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            {pickText(top.name, lang)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{pickText(top.description, lang)}</p>
          <Link
            to="/career-center"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            {t("sca.family.explore")} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
      {related.length > 0 && (
        <>
          <p className="mt-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("sca.family.related")}
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {related.map((f) => (
              <li key={f!.id}>
                <Link
                  to="/career-center"
                  className="block rounded-md border border-border bg-background p-4 transition-colors hover:border-accent/60"
                >
                  <p className="text-sm font-semibold text-foreground">{pickText(f!.name, lang)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pickText(f!.description, lang)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

// -------------------- Continue journey --------------------

export function ContinueJourney({
  onRetake,
  topSlug,
}: {
  onRetake: () => void;
  topSlug?: string;
}) {
  const { t } = useT();
  return (
    <SectionCard title={t("sca.next.title2")} eyebrow={t("sca.next.eyebrow")}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {topSlug && (
          <Link
            to="/career-center/$profession"
            params={{ profession: topSlug }}
            className="group flex flex-col gap-3 rounded-md border border-border bg-background p-5 transition-colors hover:border-accent/60"
          >
            <BookOpen className="h-5 w-5 text-accent" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-semibold text-foreground">{t("sca.next.guide.title")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("sca.next.guide.body")}</p>
            </div>
          </Link>
        )}
        <Link
          to="/career-center"
          className="group flex flex-col gap-3 rounded-md border border-border bg-background p-5 transition-colors hover:border-accent/60"
        >
          <Compass className="h-5 w-5 text-accent" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("sca.next.explore.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("sca.next.explore.body")}</p>
          </div>
        </Link>
        <Link
          to="/jobs"
          className="group flex flex-col gap-3 rounded-md border border-border bg-background p-5 transition-colors hover:border-accent/60"
        >
          <Briefcase className="h-5 w-5 text-accent" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("sca.next.jobs.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("sca.next.jobs.body")}</p>
          </div>
        </Link>
        <button
          type="button"
          onClick={onRetake}
          className="group flex flex-col gap-3 rounded-md border border-border bg-background p-5 text-left transition-colors hover:border-accent/60"
        >
          <RotateCcw className="h-5 w-5 text-accent" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("sca.next.retake.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("sca.next.retake.body")}</p>
          </div>
        </button>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-5 opacity-80">
          <div className="flex items-center justify-between">
            <UserPlus className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            <TokenBadge tone="warn">{t("sca.next.soon")}</TokenBadge>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{t("sca.next.save.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("sca.next.save.body")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-5 opacity-80">
          <div className="flex items-center justify-between">
            <Users className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            <TokenBadge tone="warn">{t("sca.next.soon")}</TokenBadge>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{t("sca.next.profile.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("sca.next.profile.body")}</p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// -------------------- Share summary preview --------------------

export function ShareSummaryPreview({
  session,
  lang,
}: {
  session: ResultSession;
  lang: Lang;
}) {
  const { t } = useT();
  const top = session.matches[0];
  const profession = top ? getProfession(top.professionId) : undefined;
  const family = profession ? getFamily(profession.family) : undefined;
  const strengths = session.strengthDimensionIds.slice(0, 3);
  return (
    <SectionCard title={t("sca.share.title")} eyebrow={t("sca.share.eyebrow")}>
      <p className="text-sm text-muted-foreground">{t("sca.share.lead")}</p>
      <div className="mt-6 rounded-lg border border-border bg-gradient-to-br from-accent/5 via-background to-muted/40 p-8">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-widest text-accent">
            CQrityjob
          </span>
          <TokenBadge tone="warn">{t("sca.share.preview")}</TokenBadge>
        </div>
        <p
          className="mt-6 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {family ? pickText(family.name, lang) : profession ? (lang === "sv" ? profession.titleSv : profession.titleEn) : ""}
        </p>
        {profession && family && (
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "sv" ? "Möjlig karriärväg: " : "Possible career path: "}
            {lang === "sv" ? profession.titleSv : profession.titleEn}
          </p>
        )}
        {strengths.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {strengths.map((d) => (
              <li key={d}>
                <TokenBadge tone="accent">{pickText(dimensionById[d].name, lang)}</TokenBadge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-xs italic text-muted-foreground">
          {lang === "sv" ? "Där förtroende kommer först." : "Where trust comes first."}
        </p>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{t("sca.share.note")}</p>
    </SectionCard>
  );
}

// -------------------- Result Transparency --------------------

export function ResultTransparency({ lang }: { lang: Lang }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const points: Bi[] = [
    { sv: "Resultatet baseras på dina svar i den aktuella bedömningen.", en: "The result is based on your answers in the current assessment." },
    { sv: "Svaren mappas till vägledande dimensioner (till exempel operativ, analytisk, strategisk).", en: "Answers map to guidance dimensions (for example operational, analytical, strategic)." },
    { sv: "Dimensionerna jämförs med provisoriska yrkesprofiler.", en: "The dimensions are compared with provisional profession profiles." },
    { sv: "Säkerheten (confidence) beror på hur många relevanta frågor du besvarat.", en: "Confidence depends on how many relevant questions you answered." },
    { sv: "Resultatet är karriärvägledning – inte en psykologisk diagnos.", en: "The result is career guidance — not a psychological diagnosis." },
    { sv: "Det avgör inte behörighet eller yrkesmässig kompetens.", en: "It does not determine eligibility or professional competence." },
    { sv: "CQrityjob fattar inga anställningsbeslut.", en: "CQrityjob does not make any employment decisions." },
    { sv: "Formella krav måste kontrolleras separat mot berörda myndigheter och arbetsgivare.", en: "Formal requirements must be verified separately with the relevant authorities and employers." },
    { sv: "Modellen är en tidig version och kommer att kalibreras genom testning och expertgranskning.", en: "The current model is an early version and will be calibrated through testing and expert review." },
    { sv: "Resultatet kan förändras när dina intressen och erfarenheter utvecklas.", en: "Results may change as your interests and experience evolve." },
  ];
  return (
    <SectionCard title={t("sca.trans.title")} eyebrow={t("sca.trans.eyebrow")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Eye className="h-4 w-4" />
        {open ? t("sca.trans.hide") : t("sca.trans.show")}
      </button>
      {open && (
        <ul className="mt-5 space-y-2 text-sm leading-relaxed text-foreground">
          {points.map((p, i) => (
            <li key={i} className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
              <span>{pickText(p, lang)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{pickText(earlyModelNote, lang)}</p>
    </SectionCard>
  );
}

// -------------------- Sticky mobile nav --------------------

export function ResultStickyNav() {
  const { t } = useT();
  const items = [
    { href: "#result", label: t("sca.nav.result") },
    { href: "#profile", label: t("sca.nav.profile") },
    { href: "#compare", label: t("sca.nav.compare") },
    { href: "#plan", label: t("sca.nav.plan") },
  ];
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 flex items-center gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:hidden">
      {items.map((i) => (
        <a
          key={i.href}
          href={i.href}
          className="whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {i.label}
        </a>
      ))}
    </div>
  );
}

// Silence unused imports on strict TS in case some helpers are added incrementally.
export const __resultInternals = { useMemo, MapPin };