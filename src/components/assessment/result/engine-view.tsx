// Phase D.1 — Engine-driven assessment result view.
//
// Renders EngineResultV1 straight from the Career Intelligence Engine:
// Career Profile, Career Family headline, top profession matches with
// Current Fit / Potential / Confidence / Evidence, structured explanations,
// formal requirements, related professions, transitions, education pathways
// and certifications. Reuses the existing token/card visual language
// (SectionCard / TokenBadge patterns) but replaces the legacy result
// composition wholesale.

import { useState, type ReactNode } from "react";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Compass,
  ExternalLink,
  GraduationCap,
  Info,
  Link as LinkIcon,
  ListChecks,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Lang } from "@/i18n/dictionaries";
import { getFamily, getProfession } from "@/lib/career-center";
import { dimensionById } from "@/lib/career-assessment";
import type { Bi } from "@/lib/career-assessment/types";
import type {
  CareerProfile,
  EngineResultV1,
  EnrichmentBundle,
  FamilyRankingEntry,
  Match,
  StructuredExplanation,
} from "@/lib/career-intelligence-engine/types";
import { cn } from "@/lib/utils";
import { PrimaryButton } from "@/components/site/PrimaryButton";

// -------------------- helpers --------------------

function pick(b: Bi | undefined | null, lang: Lang): string {
  if (!b) return "";
  return lang === "sv" ? b.sv || b.en : b.en || b.sv;
}

function professionTitle(match: Match, lang: Lang): string {
  if (match.titleSv || match.titleEn) {
    return pick({ sv: match.titleSv ?? "", en: match.titleEn ?? "" }, lang);
  }
  const cc = getProfession(match.legacySlug);
  if (cc) return lang === "sv" ? cc.titleSv : cc.titleEn;
  return match.professionKey;
}

function familyLabel(familyKey: string, lang: Lang): string {
  const fam = getFamily(familyKey);
  return fam ? pick(fam.name, lang) : familyKey;
}

function TokenBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "warn" | "accent";
}) {
  const cls =
    tone === "warn"
      ? "border-border bg-muted/40 text-muted-foreground"
      : tone === "accent"
        ? "border-accent/40 bg-accent/10 text-accent"
        : "border-border bg-background text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest",
        cls,
      )}
    >
      {children}
    </span>
  );
}

function SectionCard({
  title,
  eyebrow,
  icon,
  children,
  actions,
  id,
}: {
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="rounded-lg border border-border bg-background p-6 md:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-accent">
              {icon}
              {eyebrow}
            </p>
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

function ScoreDial({
  label,
  value,
  hint,
  tone = "accent",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "accent" | "muted";
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background p-4">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums tracking-tight",
          tone === "accent" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {value}
        <span className="ml-0.5 text-base text-muted-foreground">%</span>
      </p>
      {hint && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function Bar({
  label,
  value,
  tone = "accent",
}: {
  label: string;
  value: number;
  tone?: "accent" | "muted";
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">{v}</p>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "accent" ? "bg-accent" : "bg-muted-foreground/40",
          )}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

// -------------------- Career Profile --------------------

function CareerProfileBlock({
  profile,
  lang,
}: {
  profile: CareerProfile;
  lang: Lang;
}) {
  const topArchs = profile.archetypes.slice(0, 3);
  const topMots = profile.motivationSignals.slice(0, 3);
  return (
    <SectionCard
      id="career-profile"
      eyebrow={lang === "sv" ? "Karriärprofil" : "Career Profile"}
      icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2} />}
      title={
        lang === "sv"
          ? "Din karriärprofil"
          : "Your career profile"
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "En övergripande bild av dina styrkor, drivkrafter och arbetssätt — beräknad från dina svar."
          : "A high-level view of your strengths, motivations and working style — derived from your answers."}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Arketyper" : "Archetypes"}
          </h3>
          <div className="mt-3 space-y-3">
            {topArchs.map((a) => (
              <Bar key={a.key} label={pick(a.label, lang)} value={a.strength} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Drivkrafter" : "Motivations"}
          </h3>
          <div className="mt-3 space-y-3">
            {topMots.map((m) => (
              <Bar
                key={m.key}
                label={pick(m.label, lang)}
                value={m.strength}
                tone="muted"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScoreDial
          label={lang === "sv" ? "Självständighet" : "Independence"}
          value={profile.workingStyle.independence}
          tone="muted"
        />
        <ScoreDial
          label={lang === "sv" ? "Samarbete" : "Teamwork"}
          value={profile.workingStyle.teamwork}
          tone="muted"
        />
        <ScoreDial
          label={lang === "sv" ? "Struktur" : "Structure"}
          value={profile.workingStyle.structurePreference}
          tone="muted"
        />
        <ScoreDial
          label={lang === "sv" ? "Risktolerans" : "Risk tolerance"}
          value={profile.workingStyle.riskTolerance}
          tone="muted"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <ScoreDial
          label={lang === "sv" ? "Utvecklingskapacitet" : "Development capacity"}
          value={profile.developmentCapacity}
        />
        <ScoreDial
          label={lang === "sv" ? "Underlag" : "Evidence coverage"}
          value={Math.round(profile.evidenceCoverage * 100)}
          tone="muted"
        />
      </div>
    </SectionCard>
  );
}

// -------------------- Career Family --------------------

function CareerFamilyHeadline({
  ranking,
  lang,
}: {
  ranking: FamilyRankingEntry[];
  lang: Lang;
}) {
  const [top, ...rest] = ranking;
  if (!top) return null;
  return (
    <SectionCard
      id="career-family"
      eyebrow={lang === "sv" ? "Karriärfamilj" : "Career Family"}
      icon={<Compass className="h-3.5 w-3.5" strokeWidth={2} />}
      title={familyLabel(top.familyKey, lang)}
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "Yrkesfamiljen där dina svar passar starkast, samt närliggande alternativ att utforska."
          : "The profession family where your answers align most strongly, plus adjacent options worth exploring."}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <ScoreDial
          label={lang === "sv" ? "Nuvarande passform" : "Current Fit"}
          value={top.currentFit}
        />
        <ScoreDial
          label={lang === "sv" ? "Potential" : "Potential"}
          value={top.potential}
          tone="muted"
        />
      </div>
      {rest.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Närliggande familjer" : "Adjacent families"}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {rest.slice(0, 4).map((f) => (
              <li key={f.familyKey}>
                <TokenBadge>
                  {familyLabel(f.familyKey, lang)} · {f.currentFit}
                </TokenBadge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

// -------------------- Match card / details --------------------

function confidenceLabel(c: Match["confidence"], lang: Lang): string {
  if (c === "stronger") return lang === "sv" ? "Starkare underlag" : "Stronger evidence";
  if (c === "moderate") return lang === "sv" ? "Måttligt underlag" : "Moderate evidence";
  return lang === "sv" ? "Begränsat underlag" : "Limited evidence";
}

function MatchListItem({
  match,
  rank,
  active,
  onSelect,
  lang,
}: {
  match: Match;
  rank: number;
  active: boolean;
  onSelect: () => void;
  lang: Lang;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-lg border bg-background p-5 text-left transition-colors",
        active
          ? "border-accent ring-1 ring-accent/40"
          : "border-border hover:border-accent/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
              rank === 1
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-muted/40 text-foreground",
            )}
          >
            {rank}
          </span>
          <div>
            <p
              className="text-sm font-semibold tracking-tight text-foreground md:text-base"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {professionTitle(match, lang)}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              {familyLabel(match.family.key, lang)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
            {match.currentFit}
            <span className="ml-0.5 text-xs text-muted-foreground">%</span>
          </p>
          <p className="mt-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Nuvarande passform" : "Current Fit"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TokenBadge>
          {lang === "sv" ? "Potential" : "Potential"} · {match.potential}
        </TokenBadge>
        <TokenBadge>{confidenceLabel(match.confidence, lang)}</TokenBadge>
        <TokenBadge>
          {lang === "sv" ? "Underlag" : "Evidence"} · {match.evidenceScore}
        </TokenBadge>
        {match.regulated && (
          <TokenBadge tone="warn">
            {lang === "sv" ? "Reglerad" : "Regulated"}
          </TokenBadge>
        )}
        {!match.gatePassed && (
          <TokenBadge tone="warn">
            {lang === "sv" ? "Villkorad" : "Conditional"}
          </TokenBadge>
        )}
      </div>
    </button>
  );
}

function ExplanationList({
  items,
  lang,
}: {
  items: StructuredExplanation[];
  lang: Lang;
}) {
  if (items.length === 0) return null;
  const iconFor = (kind: StructuredExplanation["kind"]) => {
    switch (kind) {
      case "matched_dimension":
      case "profile_archetype":
      case "family_rationale":
        return <CheckCircle2 className="h-4 w-4 text-accent" strokeWidth={1.75} />;
      case "gap_dimension":
      case "low_evidence":
      case "evidence_note":
      case "why_ranked_lower":
        return <Info className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />;
      case "regulated_notice":
      case "gate_fail":
      case "formal_requirement":
        return <ShieldAlert className="h-4 w-4 text-amber-600" strokeWidth={1.75} />;
      case "gate_pass":
        return <Target className="h-4 w-4 text-accent" strokeWidth={1.75} />;
      case "current_vs_potential":
        return <TrendingUp className="h-4 w-4 text-accent" strokeWidth={1.75} />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />;
    }
  };
  return (
    <ul className="space-y-2 text-sm text-foreground">
      {items.map((e, i) => (
        <li key={`${e.kind}-${i}`} className="flex items-start gap-2">
          <span className="mt-0.5 flex-shrink-0">{iconFor(e.kind)}</span>
          <span className="leading-relaxed">{pick(e.text, lang)}</span>
        </li>
      ))}
    </ul>
  );
}

function DimensionChips({
  ids,
  lang,
}: {
  ids: readonly string[];
  lang: Lang;
}) {
  if (ids.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {ids.map((id) => {
        const dim = dimensionById[id as keyof typeof dimensionById];
        if (!dim) return null;
        return (
          <li key={id}>
            <TokenBadge>{pick(dim.name, lang)}</TokenBadge>
          </li>
        );
      })}
    </ul>
  );
}

function EnrichmentDetail({
  match,
  lang,
}: {
  match: Match;
  lang: Lang;
}) {
  const e: EnrichmentBundle = match.enrichment;
  const hasFormal = e.formalRequirements.length > 0;
  const hasRelated = e.relatedProfessions.length > 0;
  const hasTransitions = e.transitions.length > 0;
  const hasEducation = e.educationPathways.length > 0;
  const hasCerts = e.certifications.length > 0;
  const hasSources = e.sources.length > 0;

  const emptyMsg =
    lang === "sv"
      ? "Innehåll för denna kategori är under uppbyggnad."
      : "Content for this section is being expanded.";

  return (
    <div className="space-y-8">
      {/* Strengths + development */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Starkaste dimensioner" : "Strongest dimensions"}
          </h4>
          <div className="mt-3">
            <DimensionChips ids={match.strongestDimensions} lang={lang} />
          </div>
        </div>
        <div>
          <h4 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Utvecklingsområden" : "Development areas"}
          </h4>
          <div className="mt-3">
            <DimensionChips ids={match.developmentAreas} lang={lang} />
          </div>
        </div>
      </div>

      {/* Regulated notice */}
      {match.regulated && e.disclaimer && (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-foreground">
          <ShieldAlert
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600"
            strokeWidth={1.75}
          />
          <p className="leading-relaxed">{pick(e.disclaimer, lang)}</p>
        </div>
      )}

      {/* Formal requirements */}
      <div>
        <h4 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" strokeWidth={2} />
          {lang === "sv" ? "Formella krav" : "Formal requirements"}
        </h4>
        {hasFormal ? (
          <ul className="mt-3 space-y-2">
            {e.formalRequirements.map((r, i) => (
              <li
                key={`${r.label.sv}-${i}`}
                className="flex items-start gap-2 rounded-md border border-border/60 bg-background p-3 text-sm text-foreground"
              >
                <ShieldAlert
                  className={cn(
                    "mt-0.5 h-4 w-4 flex-shrink-0",
                    r.isLegal ? "text-amber-600" : "text-muted-foreground",
                  )}
                  strokeWidth={1.75}
                />
                <div className="flex-1">
                  <p className="font-medium">{pick(r.label, lang)}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.isLegal && (
                      <TokenBadge tone="warn">
                        {lang === "sv" ? "Lagkrav" : "Legal"}
                      </TokenBadge>
                    )}
                    {r.isEmployer && (
                      <TokenBadge>
                        {lang === "sv" ? "Arbetsgivarkrav" : "Employer"}
                      </TokenBadge>
                    )}
                    {r.kind && <TokenBadge>{r.kind}</TokenBadge>}
                    {r.jurisdiction && (
                      <TokenBadge>{r.jurisdiction}</TokenBadge>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{emptyMsg}</p>
        )}
      </div>

      {/* Related + Transitions */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            {lang === "sv" ? "Närliggande yrken" : "Related professions"}
          </h4>
          {hasRelated ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {e.relatedProfessions.map((r) => (
                <li key={r.slug}>
                  <TokenBadge>{pick(r.title, lang)}</TokenBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{emptyMsg}</p>
          )}
        </div>
        <div>
          <h4 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
            {lang === "sv" ? "Karriärövergångar" : "Career transitions"}
          </h4>
          {hasTransitions ? (
            <ul className="mt-3 space-y-2">
              {e.transitions.map((t, i) => (
                <li
                  key={`${t.otherSlug}-${i}`}
                  className="rounded-md border border-border/60 bg-background p-3 text-sm text-foreground"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TokenBadge tone={t.direction === "to" ? "accent" : "default"}>
                      {t.direction === "to"
                        ? lang === "sv"
                          ? "Framåt"
                          : "Onward"
                        : lang === "sv"
                          ? "Från"
                          : "From"}
                    </TokenBadge>
                    <span className="text-sm">{t.otherSlug}</span>
                    {t.effort && <TokenBadge>{t.effort}</TokenBadge>}
                  </div>
                  {t.notes && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {pick(t.notes, lang)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{emptyMsg}</p>
          )}
        </div>
      </div>

      {/* Education + Certifications */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} />
            {lang === "sv" ? "Utbildningsvägar" : "Education pathways"}
          </h4>
          {hasEducation ? (
            <ul className="mt-3 space-y-2">
              {e.educationPathways.map((p) => (
                <li
                  key={p.slug}
                  className="flex items-start gap-2 rounded-md border border-border/60 bg-background p-3 text-sm text-foreground"
                >
                  <BookOpen
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent"
                    strokeWidth={1.75}
                  />
                  <div>
                    <p className="font-medium">{pick(p.title, lang)}</p>
                    {p.level && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.level}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{emptyMsg}</p>
          )}
        </div>
        <div>
          <h4 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <Award className="h-3.5 w-3.5" strokeWidth={2} />
            {lang === "sv" ? "Certifieringar" : "Certifications"}
          </h4>
          {hasCerts ? (
            <ul className="mt-3 space-y-2">
              {e.certifications.map((c) => (
                <li
                  key={c.slug}
                  className="flex items-start gap-2 rounded-md border border-border/60 bg-background p-3 text-sm text-foreground"
                >
                  <Award
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent"
                    strokeWidth={1.75}
                  />
                  <div>
                    <p className="font-medium">{pick(c.title, lang)}</p>
                    {c.issuer && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.issuer}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{emptyMsg}</p>
          )}
        </div>
      </div>

      {/* Sources */}
      {hasSources && (
        <div>
          <h4 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <LinkIcon className="h-3.5 w-3.5" strokeWidth={2} />
            {lang === "sv" ? "Källor" : "Sources"}
          </h4>
          <ul className="mt-3 space-y-1 text-sm">
            {e.sources.map((s, i) => (
              <li key={`${s.label}-${i}`}>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:text-foreground"
                  >
                    {s.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{s.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MatchDetail({
  match,
  rank,
  lang,
}: {
  match: Match;
  rank: number;
  lang: Lang;
}) {
  return (
    <SectionCard
      id={`match-${match.professionKey}`}
      eyebrow={
        rank === 1
          ? lang === "sv"
            ? "Starkaste yrke"
            : "Strongest profession"
          : lang === "sv"
            ? `Yrkesmatch #${rank}`
            : `Match #${rank}`
      }
      icon={<Target className="h-3.5 w-3.5" strokeWidth={2} />}
      title={professionTitle(match, lang)}
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        {familyLabel(match.family.key, lang)}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScoreDial
          label={lang === "sv" ? "Nuvarande passform" : "Current Fit"}
          value={match.currentFit}
        />
        <ScoreDial
          label={lang === "sv" ? "Potential" : "Potential"}
          value={match.potential}
          tone="muted"
        />
        <ScoreDial
          label={lang === "sv" ? "Underlag" : "Evidence"}
          value={match.evidenceScore}
          tone="muted"
        />
        <div className="rounded-md border border-border/60 bg-background p-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Konfidens" : "Confidence"}
          </p>
          <p className="mt-2 text-sm font-semibold tracking-tight text-foreground">
            {confidenceLabel(match.confidence, lang)}
          </p>
        </div>
      </div>

      {match.gateNote && !match.gatePassed && (
        <div className="mt-6 flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-foreground">
          <ShieldAlert
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600"
            strokeWidth={1.75}
          />
          <p className="leading-relaxed">{pick(match.gateNote, lang)}</p>
        </div>
      )}

      {match.reason.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Varför denna matchning" : "Why this match"}
          </h4>
          <div className="mt-3">
            <ExplanationList items={match.reason} lang={lang} />
          </div>
        </div>
      )}

      <div className="mt-8">
        <EnrichmentDetail match={match} lang={lang} />
      </div>
    </SectionCard>
  );
}

// -------------------- Root --------------------

export function EngineResultView({
  result,
  lang,
  onRetake,
}: {
  result: EngineResultV1;
  lang: Lang;
  onRetake: () => void;
}) {
  const [activeKey, setActiveKey] = useState<string>(
    result.matches[0]?.professionKey ?? "",
  );
  const active =
    result.matches.find((m) => m.professionKey === activeKey) ??
    result.matches[0];
  const activeRank = active
    ? result.matches.findIndex((m) => m.professionKey === active.professionKey) + 1
    : 0;

  return (
    <div className="space-y-8 md:space-y-10">
      {/* Hero */}
      <section className="rounded-lg border border-border bg-gradient-to-br from-muted/40 via-background to-background p-8 md:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <TokenBadge tone="accent">
            <CheckCircle2 className="mr-1 h-3 w-3" strokeWidth={2} />
            {lang === "sv" ? "Karriärintelligens" : "Career Intelligence"}
          </TokenBadge>
          <TokenBadge>{result.engineVersion}</TokenBadge>
          <TokenBadge>
            {lang === "sv" ? "Underlag" : "Evidence"} ·{" "}
            {result.overallEvidenceScore}
          </TokenBadge>
          {result.dataStatus === "cig_enrichment_missing" && (
            <TokenBadge tone="warn">
              {lang === "sv" ? "Innehåll under uppbyggnad" : "Content in progress"}
            </TokenBadge>
          )}
        </div>
        <h1
          className="mt-6 text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {lang === "sv" ? "Ditt karriärresultat" : "Your career result"}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {lang === "sv"
            ? "En vägledande bild: profil, yrkesfamilj, dina starkaste yrken samt vad som krävs och vad som är nästa steg."
            : "A guidance snapshot: profile, family, strongest professions, and what it takes plus what's next."}
        </p>
        {active && (
          <div className="mt-8 grid grid-cols-1 gap-6 rounded-md border border-border bg-background/70 p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {lang === "sv" ? "Starkaste yrke" : "Top profession"}
              </p>
              <p
                className="mt-1 text-2xl font-semibold tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {professionTitle(active, lang)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {familyLabel(active.family.key, lang)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:w-64">
              <ScoreDial
                label={lang === "sv" ? "Passform" : "Current"}
                value={active.currentFit}
              />
              <ScoreDial
                label={lang === "sv" ? "Potential" : "Potential"}
                value={active.potential}
                tone="muted"
              />
            </div>
          </div>
        )}
        <div className="mt-6">
          <PrimaryButton onClick={onRetake} variant="ghost">
            <RotateCcw className="mr-2 h-4 w-4" />
            {lang === "sv" ? "Gör om testet" : "Retake assessment"}
          </PrimaryButton>
        </div>
      </section>

      {/* Career Profile */}
      <CareerProfileBlock profile={result.careerProfile} lang={lang} />

      {/* Family */}
      <CareerFamilyHeadline ranking={result.familyRanking} lang={lang} />

      {/* Match overview */}
      <SectionCard
        id="matches"
        eyebrow={lang === "sv" ? "Yrkesmatchningar" : "Profession matches"}
        icon={<Target className="h-3.5 w-3.5" strokeWidth={2} />}
        title={lang === "sv" ? "Dina starkaste yrken" : "Your strongest professions"}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          {lang === "sv"
            ? "Välj ett yrke nedan för att se förklaring, formella krav, närliggande yrken, övergångar, utbildningsvägar och certifieringar."
            : "Select a profession to see the explanation, formal requirements, related roles, transitions, education pathways and certifications."}
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {result.matches.map((m, i) => (
            <MatchListItem
              key={m.professionKey}
              match={m}
              rank={i + 1}
              active={m.professionKey === active?.professionKey}
              onSelect={() => setActiveKey(m.professionKey)}
              lang={lang}
            />
          ))}
        </div>
      </SectionCard>

      {active && <MatchDetail match={active} rank={activeRank || 1} lang={lang} />}

      {/* Aggregated disclaimers */}
      {result.disclaimers.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-5 text-sm text-foreground">
          <div className="flex items-start gap-2">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600"
              strokeWidth={1.75}
            />
            <div className="space-y-2">
              {result.disclaimers.map((d, i) => (
                <p key={i} className="leading-relaxed">
                  {pick(d, lang)}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        <Info
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent"
          strokeWidth={1.75}
        />
        <p>
          {lang === "sv"
            ? "Detta är vägledande karriärintelligens, inte behörighet eller anställningsbeslut. Formella krav gäller alltid."
            : "This is guidance career intelligence, not eligibility or a hiring decision. Formal requirements always apply."}
        </p>
      </div>
    </div>
  );
}