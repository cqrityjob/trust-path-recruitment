// Phase D.2 — Candidate Experience Polish.
//
// Engine-driven assessment result view. Restructures the result page into
// a clear narrative: primary result -> why -> career profile -> career
// family -> comparison -> strengths/development -> formal requirements ->
// education & certifications -> action plan -> next steps -> save prompt
// -> methodology. Reuses the existing engine output; no scoring, engine
// or schema changes.

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Award,
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Compass,
  ExternalLink,
  GraduationCap,
  HelpCircle,
  Info,
  ListChecks,
  Lock,
  RotateCcw,
  Share2,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Lang } from "@/i18n/dictionaries";
import { getFamily, getProfession } from "@/lib/career-center";
import { dimensionById } from "@/lib/career-assessment";
import type {
  CareerProfile,
  EngineResultV1,
  FamilyRankingEntry,
  Match,
  StructuredExplanation,
} from "@/lib/career-intelligence-engine/types";
import { cn } from "@/lib/utils";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import {
  backgroundOptions,
  buildActionPlan,
  careerProfileLabel,
  currentFitBand,
  currentFitLabel,
  emptyCertificationsCopy,
  emptyEducationCopy,
  guidanceSignalHelp,
  insufficientEvidenceHelp,
  insufficientEvidenceLabel,
  levelLabel,
  matchStrengthBand,
  matchStrengthLabel,
  methodologyBullets,
  overallEvidenceHelp,
  overallEvidenceLabel,
  overallEvidenceLevel,
  pick,
  potentialBand,
  potentialLabel,
  regulatedLabel,
  regulatedHelp,
  scoreTooltips,
  type BackgroundKey,
  type Bi,
} from "./labels";

// -------------------- primitives --------------------

function professionTitle(match: Match, lang: Lang): string {
  const bi: Bi = {
    sv: match.titleSv ?? match.professionKey,
    en: match.titleEn ?? match.professionKey,
  };
  return pick(bi, lang);
}

function familyLabel(familyKey: string, lang: Lang): string {
  const fam = getFamily(familyKey);
  return fam ? pick(fam.name, lang) : familyKey;
}

function familyDescription(familyKey: string, lang: Lang): string {
  const fam = getFamily(familyKey);
  return fam ? pick(fam.description, lang) : "";
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
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
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
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
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

function ScoreWithHelp({
  label,
  help,
  value,
  interpretation,
  tone = "accent",
  insufficient = false,
  insufficientHelp,
}: {
  label: string;
  help: string;
  value: number | string;
  interpretation?: string;
  tone?: "accent" | "muted";
  insufficient?: boolean;
  insufficientHelp?: string;
}) {
  const [open, setOpen] = useState(false);
  const effectiveHelp = insufficient && insufficientHelp ? insufficientHelp : help;
  return (
    <div className="rounded-md border border-border/60 bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${label}: ${effectiveHelp}`}
          className="rounded-full p-1 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums tracking-tight",
          tone === "accent" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {insufficient ? (
          <span className="text-sm font-medium normal-case tracking-normal text-muted-foreground">
            {insufficientHelp ? "—" : "—"}
          </span>
        ) : typeof value === "number" ? (
          <>
            {value}
            <span className="ml-0.5 text-base text-muted-foreground">%</span>
          </>
        ) : (
          <span className="text-lg">{value}</span>
        )}
      </p>
      {insufficient ? (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-foreground">
          {/* Insufficient evidence label is provided via `interpretation` when present. */}
          {interpretation}
        </p>
      ) : interpretation ? (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-foreground">
          {interpretation}
        </p>
      ) : null}
      {open && (
        <p className="mt-2 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
          {effectiveHelp}
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
      <div
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
      >
        <div
          className={cn(
            "h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500",
            tone === "accent" ? "bg-accent" : "bg-muted-foreground/40",
          )}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

function Accordion({
  title,
  eyebrow,
  defaultOpen = false,
  children,
  icon,
}: {
  title: string;
  eyebrow?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 p-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:p-8"
      >
        <span className="min-w-0">
          {eyebrow && (
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-accent">
              {icon}
              {eyebrow}
            </span>
          )}
          <span
            className="mt-1 block text-xl font-semibold tracking-tight text-foreground md:text-2xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground motion-safe:transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={1.75}
        />
      </button>
      {open && <div className="border-t border-border p-6 md:p-8">{children}</div>}
    </section>
  );
}

// -------------------- Hero --------------------

function Hero({
  result,
  primary,
  profile,
  lang,
  onRetake,
}: {
  result: EngineResultV1;
  primary: Match;
  profile: CareerProfile;
  lang: Lang;
  onRetake: () => void;
}) {
  const profileLbl = careerProfileLabel(profile);
  const evidenceLevel = overallEvidenceLevel(result.overallEvidenceScore);
  const evidenceLbl = overallEvidenceLabel(evidenceLevel);
  const fitBand = currentFitBand(primary.currentFit, primary.confidence);
  const fitLbl = currentFitLabel(fitBand);
  const potBand = potentialBand(primary.potential, primary.confidence);
  const potLbl = potentialLabel(potBand);
  const insufficientFit = primary.confidence === "limited" || primary.currentFit <= 0;
  const insufficientPot = primary.confidence === "limited" || primary.potential <= 0;
  const primaryHref = primary.legacySlug ? `/career-center/${primary.legacySlug}` : "/career-center";
  const [regOpen, setRegOpen] = useState(false);
  const [evOpen, setEvOpen] = useState(false);
  const scrollTo = (id: string) => {
    if (typeof document !== "undefined") {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  return (
    <section className="rounded-lg border border-border bg-gradient-to-br from-muted/40 via-background to-background p-8 md:p-10">
      <div className="flex flex-wrap items-center gap-2">
        <TokenBadge tone="accent">
          <Sparkles className="mr-1 h-3 w-3" strokeWidth={2} />
          {lang === "sv" ? "Karriärvägledning" : "Career guidance"}
        </TokenBadge>
        {/* Phase D.2.1: single overall evidence status with tooltip. */}
        <span className="relative inline-flex">
          <button
            type="button"
            onClick={() => setEvOpen((v) => !v)}
            aria-expanded={evOpen}
            aria-label={`${pick(evidenceLbl, lang)}: ${pick(overallEvidenceHelp, lang)}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {pick(evidenceLbl, lang)}
            <HelpCircle className="h-3 w-3" strokeWidth={1.75} />
          </button>
          {evOpen && (
            <span
              role="tooltip"
              className="absolute left-0 top-full z-10 mt-1 w-72 rounded-md border border-border bg-background p-3 text-[11px] normal-case tracking-normal leading-relaxed text-muted-foreground shadow-lg"
            >
              {pick(overallEvidenceHelp, lang)}
            </span>
          )}
        </span>
        {primary.regulated && (
          <span className="relative inline-flex">
            <button
              type="button"
              onClick={() => setRegOpen((v) => !v)}
              aria-expanded={regOpen}
              aria-label={`${pick(regulatedLabel, lang)}: ${pick(regulatedHelp, lang)}`}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber-700 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:text-amber-300"
            >
              {pick(regulatedLabel, lang)}
              <HelpCircle className="h-3 w-3" strokeWidth={1.75} />
            </button>
            {regOpen && (
              <span
                role="tooltip"
                className="absolute left-0 top-full z-10 mt-1 w-72 rounded-md border border-border bg-background p-3 text-[11px] normal-case tracking-normal leading-relaxed text-muted-foreground shadow-lg"
              >
                {pick(regulatedHelp, lang)}
              </span>
            )}
          </span>
        )}
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
        {lang === "sv"
          ? "Din möjliga väg inom säkerhet"
          : "Your possible path in security"}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
        {lang === "sv"
          ? "En vägledande bild av vilka yrken och riktningar som kan passa dig — inte ett anställnings- eller behörighetsbeslut."
          : "A guidance snapshot of professions and directions that may suit you — not a hiring or eligibility decision."}
      </p>

      <div className="mt-8 rounded-md border border-border bg-background/70 p-5">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {lang === "sv" ? "Din karriärprofil" : "Your career profile"}
        </p>
        <p
          className="mt-1 text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pick(profileLbl.label, lang)}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {pick(profileLbl.blurb, lang)}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 rounded-md border border-border bg-background/70 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Starkaste yrke" : "Top profession"}
          </p>
          <p
            className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {professionTitle(primary, lang)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {familyLabel(primary.family.key, lang)}
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">
            {insufficientFit ? pick(insufficientEvidenceLabel, lang) : pick(fitLbl, lang)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:w-64">
          <ScoreWithHelp
            label={pick(scoreTooltips.currentFit.label, lang)}
            help={`${pick(guidanceSignalHelp, lang)} ${pick(scoreTooltips.currentFit.help, lang)} (${lang === "sv" ? "internt värde" : "internal value"}: ${primary.currentFit}%)`}
            value={insufficientFit ? pick(insufficientEvidenceLabel, lang) : pick(fitLbl, lang)}
            insufficient={insufficientFit}
            insufficientHelp={pick(insufficientEvidenceHelp, lang)}
            interpretation={insufficientFit ? pick(insufficientEvidenceLabel, lang) : undefined}
          />
          <ScoreWithHelp
            label={pick(scoreTooltips.potential.label, lang)}
            help={`${pick(guidanceSignalHelp, lang)} ${pick(scoreTooltips.potential.help, lang)} (${lang === "sv" ? "internt värde" : "internal value"}: ${primary.potential}%)`}
            value={insufficientPot ? pick(insufficientEvidenceLabel, lang) : pick(potLbl, lang)}
            tone="muted"
            insufficient={insufficientPot}
            insufficientHelp={pick(insufficientEvidenceHelp, lang)}
            interpretation={insufficientPot ? pick(insufficientEvidenceLabel, lang) : undefined}
          />
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "Resultatet är vägledning för karriärval. Det avgör inte behörighet, kompetens eller anställning. Formella krav måste alltid verifieras separat."
          : "The result is guidance for career choices. It does not determine eligibility, competence or employment. Formal requirements must always be verified separately."}
      </p>

      {/* Phase D.2.1: Discover → Understand → Grow action hierarchy. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a
          href={primaryHref}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <Target className="mr-2 h-4 w-4" strokeWidth={1.75} />
          {lang === "sv" ? "Utforska yrket" : "Explore this profession"}
        </a>
        <button
          type="button"
          onClick={() => scrollTo("compare")}
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {lang === "sv" ? "Jämför karriärvägar" : "Compare career paths"}
        </button>
        <button
          type="button"
          onClick={() => scrollTo("action-plan")}
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {lang === "sv" ? "Se din utvecklingsplan" : "View your action plan"}
        </button>
        <button
          type="button"
          onClick={onRetake}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
          {lang === "sv" ? "Gör om testet" : "Retake assessment"}
        </button>
      </div>
    </section>
  );
}

// -------------------- Why this result --------------------

function WhyThisResult({ match, lang }: { match: Match; lang: Lang }) {
  // Phase D.2.1: hide internal-model wording (archetype, baseline signal,
  // supporting profile). Structured explanations of kind profile_archetype
  // are rewritten in place; family_rationale is kept but rephrased when it
  // starts with the "Baseline signals" pattern.
  const seen = new Set<string>();
  const strongest = match.strongestDimensions
    .filter((d) => {
      if (seen.has(d)) return false;
      seen.add(d);
      return dimensionById[d];
    })
    .slice(0, 3);

  const weakEvidence = match.developmentAreas
    .filter((d) => !seen.has(d) && dimensionById[d])
    .slice(0, 2);

  const kinds: StructuredExplanation["kind"][] = [
    "family_rationale",
    "current_vs_potential",
    "regulated_notice",
    "gate_pass",
    "gate_fail",
  ];
  // Plain-language rewriter: strips internal terminology.
  const rewrite = (text: Bi): Bi => {
    const soften = (s: string) =>
      s
        .replace(/baseline signal[s]?[^.]*\./i, "The assessment did not find sufficiently clear information across all areas that are relevant to this profession.")
        .replace(/basvärde[t]?[^.]*inte tydligt[^.]*\./i, "Testet gav inte tillräckligt tydlig information inom alla områden som är relevanta för yrket.")
        .replace(/\barchetype[s]?\b/gi, lang === "sv" ? "profil" : "profile")
        .replace(/\barketyp(?:er)?\b/gi, "profil")
        .replace(/supporting profile/gi, lang === "sv" ? "stödjande profil" : "supporting signal")
        .replace(/strongest contributing dimensions?/gi, "areas that stood out in your answers");
    return { sv: soften(text.sv), en: soften(text.en) };
  };
  const seenText = new Set<string>();
  const contextual = match.reason
    .filter((r) => kinds.includes(r.kind))
    .map((r) => ({ ...r, text: rewrite(r.text) }))
    .filter((r) => {
      const key = `${r.kind}:${r.text.sv}`;
      if (seenText.has(key)) return false;
      seenText.add(key);
      return true;
    })
    .slice(0, 3);

  return (
    <SectionCard
      id="why"
      eyebrow={lang === "sv" ? "Varför detta resultat" : "Why this result"}
      icon={<Info className="h-3.5 w-3.5" strokeWidth={2} />}
      title={lang === "sv" ? "Så tog vi fram din vägledning" : "How we produced your guidance"}
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "Vägledningen bygger på dina svar och de dimensioner som starkast bidrog till resultatet."
          : "The guidance is built from your answers and the dimensions that contributed most to the result."}
      </p>

      {strongest.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Områden som framträdde i dina svar" : "Areas that stood out in your answers"}
          </h3>
          <ul className="mt-3 space-y-3">
            {strongest.map((d) => {
              const dim = dimensionById[d];
              return (
                <li key={d} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{pick(dim.name, lang)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {pick(dim.description, lang)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {contextual.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Sammanhang" : "Context"}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-foreground">
            {contextual.map((r, i) => (
              <li key={`${r.kind}-${i}`} className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="leading-relaxed">{pick(r.text, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {weakEvidence.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Där underlaget är svagare" : "Where evidence is weaker"}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {weakEvidence.map((d) => {
              const dim = dimensionById[d];
              return (
                <li key={d} className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>
                    {lang === "sv"
                      ? `Underlaget för ${pick(dim.name, lang).toLowerCase()} är svagare i dina svar. Detta är inte en bedömning av din förmåga.`
                      : `Evidence for ${pick(dim.name, lang).toLowerCase()} is weaker in your answers. This is not a judgement of your ability.`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionCard>
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
      title={lang === "sv" ? "Din bredare karriärprofil" : "Your broader career profile"}
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "En övergripande bild av dina styrkor, drivkrafter och arbetssätt — härledd från dina svar."
          : "A high-level view of your strengths, motivations and working style — derived from your answers."}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Framträdande arketyper" : "Prominent archetypes"}
          </h3>
          <div className="mt-3 space-y-3">
            {topArchs.map((a) => (
              <Bar key={a.key} label={pick(a.label, lang)} value={a.strength} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Starkaste drivkrafter" : "Strongest motivations"}
          </h3>
          <div className="mt-3 space-y-3">
            {topMots.map((m) => (
              <Bar key={m.key} label={pick(m.label, lang)} value={m.strength} tone="muted" />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScoreWithHelp
          label={lang === "sv" ? "Självständighet" : "Independence"}
          help={lang === "sv" ? "Hur självständigt du föredrar att arbeta enligt dina svar." : "How independently you prefer to work based on your answers."}
          value={profile.workingStyle.independence}
          tone="muted"
        />
        <ScoreWithHelp
          label={lang === "sv" ? "Samarbete" : "Teamwork"}
          help={lang === "sv" ? "Hur mycket du föredrar att arbeta i team enligt dina svar." : "How much you prefer working in teams based on your answers."}
          value={profile.workingStyle.teamwork}
          tone="muted"
        />
        <ScoreWithHelp
          label={lang === "sv" ? "Struktur" : "Structure"}
          help={lang === "sv" ? "Hur mycket du föredrar tydliga rutiner och struktur." : "How much you prefer clear routines and structure."}
          value={profile.workingStyle.structurePreference}
          tone="muted"
        />
        <ScoreWithHelp
          label={lang === "sv" ? "Risktolerans" : "Risk tolerance"}
          help={lang === "sv" ? "Hur bekväm du är med osäkerhet och pressade situationer." : "How comfortable you are with uncertainty and high-pressure situations."}
          value={profile.workingStyle.riskTolerance}
          tone="muted"
        />
      </div>
    </SectionCard>
  );
}

// -------------------- Career Family --------------------

function CareerFamilyBlock({
  ranking,
  matches,
  lang,
}: {
  ranking: FamilyRankingEntry[];
  matches: Match[];
  lang: Lang;
}) {
  const [top, ...rest] = ranking;
  if (!top) return null;
  const topProfession = matches.find((m) => m.family.key === top.familyKey) ?? matches[0];

  return (
    <SectionCard
      id="career-family"
      eyebrow={lang === "sv" ? "Karriärfamilj" : "Career Family"}
      icon={<Compass className="h-3.5 w-3.5" strokeWidth={2} />}
      title={familyLabel(top.familyKey, lang)}
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {familyDescription(top.familyKey, lang) ||
          (lang === "sv"
            ? "Yrkesfamiljen där dina svar passar starkast, samt närliggande alternativ att utforska."
            : "The profession family where your answers align most strongly, plus adjacent options worth exploring.")}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <ScoreWithHelp
          label={pick(scoreTooltips.currentFit.label, lang)}
          help={pick(scoreTooltips.currentFit.help, lang)}
          value={top.currentFit}
        />
        <ScoreWithHelp
          label={pick(scoreTooltips.potential.label, lang)}
          help={pick(scoreTooltips.potential.help, lang)}
          value={top.potential}
          tone="muted"
        />
        {topProfession && (
          <div className="rounded-md border border-border/60 bg-background p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {lang === "sv" ? "Topproll i familjen" : "Top profession in family"}
            </p>
            <p className="mt-2 text-sm font-semibold tracking-tight text-foreground">
              {professionTitle(topProfession, lang)}
            </p>
            {topProfession.legacySlug && (
              <a
                href={`/career-center/${topProfession.legacySlug}`}
                className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:text-foreground"
              >
                {lang === "sv" ? "Öppna yrkesguiden" : "Open profession guide"}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {rest.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Närliggande familjer" : "Adjacent families"}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {rest.slice(0, 4).map((f) => (
              <li key={f.familyKey}>
                <TokenBadge>{familyLabel(f.familyKey, lang)}</TokenBadge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <Link
          to="/career-center"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-foreground"
        >
          {lang === "sv" ? "Utforska familjen i Career Center" : "Explore the family in the Career Center"}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </SectionCard>
  );
}

// -------------------- Comparison --------------------

function CompareCard({ match, rank, lang }: { match: Match; rank: number; lang: Lang }) {
  const band = matchStrengthBand(match.currentFit, match.confidence);
  const cc = getProfession(match.legacySlug);
  const level = cc ? levelLabel(cc.level) : undefined;
  const envs = cc?.workEnvironments?.slice(0, 2) ?? [];
  const nextRole = cc?.nextRoles?.[0];
  const nextRoleTitle = nextRole ? getProfession(nextRole) : undefined;
  const hasFormal = match.enrichment.formalRequirements.length > 0;

  return (
    <article className="flex h-full flex-col rounded-lg border border-border bg-background p-5">
      <header className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {lang === "sv" ? `Yrke #${rank}` : `Profession #${rank}`}
        </p>
        <h3
          className="mt-1 truncate text-base font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {professionTitle(match, lang)}
        </h3>
        <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
          {familyLabel(match.family.key, lang)}
        </p>
      </header>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <TokenBadge>{pick(matchStrengthLabel(band), lang)}</TokenBadge>
        {level && <TokenBadge>{pick(level, lang)}</TokenBadge>}
        {match.regulated && <TokenBadge tone="warn">{pick(regulatedLabel, lang)}</TokenBadge>}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">{pick(scoreTooltips.currentFit.label, lang)}</dt>
          <dd className="tabular-nums font-semibold text-foreground">{match.currentFit}%</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{pick(scoreTooltips.potential.label, lang)}</dt>
          <dd className="tabular-nums font-semibold text-foreground">{match.potential}%</dd>
        </div>
      </dl>

      {match.strongestDimensions.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Varför det kan passa" : "Why it may fit"}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {match.strongestDimensions.slice(0, 3).map((d) => {
              const dim = dimensionById[d];
              if (!dim) return null;
              return (
                <li key={d}>
                  <TokenBadge>{pick(dim.name, lang)}</TokenBadge>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {envs.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Typiska miljöer" : "Typical environments"}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {envs.map((e, i) => (
              <li key={i}>{pick(e as Bi, lang)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {lang === "sv" ? "Formella krav" : "Formal requirements"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFormal
            ? lang === "sv"
              ? "Verifierade krav finns i yrkesguiden."
              : "Verified requirements are in the profession guide."
            : lang === "sv"
              ? "Formella krav byggs ut löpande. Verifiera hos ansvarig myndighet."
              : "Formal requirements are being expanded. Verify with the responsible authority."}
        </p>
      </div>

      {nextRoleTitle && (
        <div className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Möjligt nästa steg" : "Possible next step"}
          </p>
          <p className="mt-1 text-xs text-foreground">
            {lang === "sv" ? nextRoleTitle.titleSv : nextRoleTitle.titleEn}
          </p>
        </div>
      )}

      <div className="mt-auto pt-5">
        {match.legacySlug ? (
          <a
            href={`/career-center/${match.legacySlug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {lang === "sv" ? "Öppna yrkesguiden" : "Open profession guide"}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function ComparisonBlock({ matches, lang }: { matches: Match[]; lang: Lang }) {
  const top = matches.slice(0, 3);
  if (top.length === 0) return null;
  return (
    <SectionCard
      id="compare"
      eyebrow={lang === "sv" ? "Jämför yrken" : "Compare professions"}
      icon={<Target className="h-3.5 w-3.5" strokeWidth={2} />}
      title={lang === "sv" ? "Dina starkaste yrkesmatchningar" : "Your strongest profession matches"}
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "En sida-vid-sida-jämförelse av dina tre starkaste yrkesmatchningar. Vi jämför inte lön eller anställningsutfall."
          : "A side-by-side comparison of your three strongest profession matches. We do not compare salary or employment outcomes."}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {top.map((m, i) => (
          <CompareCard key={m.professionKey} match={m} rank={i + 1} lang={lang} />
        ))}
      </div>
    </SectionCard>
  );
}

// -------------------- Strengths & development --------------------

function StrengthsBlock({ match, lang }: { match: Match; lang: Lang }) {
  const strengths = match.strongestDimensions.filter((d) => dimensionById[d]).slice(0, 4);
  const seen = new Set(strengths);
  const development = match.developmentAreas
    .filter((d) => dimensionById[d] && !seen.has(d))
    .slice(0, 4);

  return (
    <SectionCard
      id="strengths"
      eyebrow={lang === "sv" ? "Styrkor och utveckling" : "Strengths and development"}
      icon={<TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />}
      title={lang === "sv" ? "Vad du kan bygga vidare på" : "What you can build on"}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Dina observerade styrkor" : "Your observed strengths"}
          </h3>
          {strengths.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {lang === "sv" ? "Inte tillräckligt underlag" : "Insufficient evidence"}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {strengths.map((d) => {
                const dim = dimensionById[d];
                return (
                  <li key={d} className="rounded-md border border-border/60 bg-background p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{pick(dim.name, lang)}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {pick(dim.description, lang)}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Områden att utforska vidare" : "Areas to explore further"}
          </h3>
          {development.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {lang === "sv"
                ? "Inga tydliga utvecklingsområden i förhållande till denna roll utifrån ditt underlag."
                : "No clear development areas relative to this role based on your evidence."}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {development.map((d) => {
                const dim = dimensionById[d];
                return (
                  <li key={d} className="rounded-md border border-border/60 bg-background p-3">
                    <div className="flex items-start gap-2">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{pick(dim.name, lang)}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {lang === "sv"
                            ? "Ytterligare erfarenhet kan stärka din profil inom detta område."
                            : "Additional experience may strengthen your profile in this area."}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {lang === "sv"
              ? "Utvecklingsområden är inte omdömen om din förmåga. Vissa dimensioner har helt enkelt begränsat underlag i dina svar."
              : "Development areas are not judgements of your ability. Some dimensions simply have limited evidence in your answers."}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

// -------------------- Guiding profile detail --------------------

function GuidingProfileBlock({ result, lang }: { result: EngineResultV1; lang: Lang }) {
  const arch = result.careerProfile.archetypes;
  const prominent = arch.filter((a) => a.strength >= 65);
  const moderate = arch.filter((a) => a.strength >= 45 && a.strength < 65);
  const develop = arch.filter((a) => a.strength < 45);

  const bandBlock = (title: string, tone: "accent" | "muted", items: typeof arch) => (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {lang === "sv" ? "Inget att visa i denna kategori." : "Nothing to show in this band."}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((a) => (
            <Bar key={a.key} label={pick(a.label, lang)} value={a.strength} tone={tone} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <SectionCard
      id="guiding-profile"
      eyebrow={lang === "sv" ? "Vägledande profil" : "Guiding profile"}
      icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2} />}
      title={lang === "sv" ? "Din profil i detalj" : "Your profile in detail"}
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "Arketyperna presenteras uppdelade efter styrka. Låga värden är inte automatiskt svagheter — det kan också bero på begränsat underlag."
          : "The archetypes are grouped by strength. Low values are not automatically weaknesses — they may also reflect limited evidence."}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {bandBlock(lang === "sv" ? "Framträdande" : "Prominent", "accent", prominent)}
        {bandBlock(lang === "sv" ? "Måttliga" : "Moderate", "muted", moderate)}
        {bandBlock(lang === "sv" ? "Områden att utforska vidare" : "Areas to explore further", "muted", develop)}
      </div>
      {result.careerProfile.evidenceCoverage < 0.5 && (
        <div className="mt-6 flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
          <p className="leading-relaxed">
            {lang === "sv"
              ? "Delar av profilen bygger på begränsat underlag. Fler svar ger en tydligare vägledning."
              : "Parts of the profile rest on limited evidence. More answers give clearer guidance."}
          </p>
        </div>
      )}
    </SectionCard>
  );
}

// -------------------- Formal requirements --------------------

function FormalRequirementsBlock({ match, lang }: { match: Match; lang: Lang }) {
  const e = match.enrichment;
  const hasFormal = e.formalRequirements.length > 0;
  return (
    <SectionCard
      id="formal"
      eyebrow={lang === "sv" ? "Formella krav" : "Formal requirements"}
      icon={<ListChecks className="h-3.5 w-3.5" strokeWidth={2} />}
      title={lang === "sv" ? "Vad som gäller formellt" : "What formally applies"}
    >
      {match.regulated && e.disclaimer && (
        <div className="mb-5 flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.75} />
          <p className="leading-relaxed">{pick(e.disclaimer, lang)}</p>
        </div>
      )}
      {hasFormal ? (
        <ul className="space-y-2">
          {e.formalRequirements.map((r, i) => (
            <li
              key={`${r.label.sv}-${i}`}
              className="flex items-start gap-2 rounded-md border border-border/60 bg-background p-3 text-sm text-foreground"
            >
              <ShieldAlert
                className={cn("mt-0.5 h-4 w-4 shrink-0", r.isLegal ? "text-amber-600" : "text-muted-foreground")}
                strokeWidth={1.75}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{pick(r.label, lang)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.isLegal && <TokenBadge tone="warn">{lang === "sv" ? "Lagkrav" : "Legal"}</TokenBadge>}
                  {r.isEmployer && <TokenBadge>{lang === "sv" ? "Arbetsgivarkrav" : "Employer"}</TokenBadge>}
                  {r.jurisdiction && <TokenBadge>{r.jurisdiction}</TokenBadge>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {lang === "sv"
            ? "Formella krav byggs ut löpande. Se yrkesguiden och verifiera alltid hos ansvarig myndighet eller arbetsgivare."
            : "Formal requirements are being expanded. See the profession guide and always verify with the responsible authority or employer."}
        </p>
      )}
    </SectionCard>
  );
}

// -------------------- Education & certifications --------------------

function EducationCertsBlock({ match, lang }: { match: Match; lang: Lang }) {
  const e = match.enrichment;
  const hasEdu = e.educationPathways.length > 0;
  const hasCerts = e.certifications.length > 0;
  const guideHref = match.legacySlug ? `/career-center/${match.legacySlug}` : "/career-center";

  return (
    <SectionCard
      id="education-certs"
      eyebrow={lang === "sv" ? "Utbildning och certifieringar" : "Education and certifications"}
      icon={<GraduationCap className="h-3.5 w-3.5" strokeWidth={2} />}
      title={lang === "sv" ? "Möjliga vägar framåt" : "Possible pathways forward"}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} />
            {lang === "sv" ? "Utbildningsvägar" : "Education pathways"}
          </h3>
          {hasEdu ? (
            <ul className="mt-3 space-y-2">
              {e.educationPathways.map((p) => (
                <li
                  key={p.slug}
                  className="flex items-start gap-2 rounded-md border border-border/60 bg-background p-3 text-sm text-foreground"
                >
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p className="font-medium">{pick(p.title, lang)}</p>
                    {p.level && <p className="mt-0.5 text-xs text-muted-foreground">{p.level}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
              <p className="leading-relaxed">{pick(emptyEducationCopy, lang)}</p>
              <a
                href={guideHref}
                className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:text-foreground"
              >
                {lang === "sv" ? "Öppna yrkesguiden" : "Open profession guide"}
                <ExternalLink className="h-3 w-3" />
              </a>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                {lang === "sv" ? "Under uppbyggnad" : "Being expanded"}
              </p>
            </div>
          )}
        </div>

        <div>
          <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <Award className="h-3.5 w-3.5" strokeWidth={2} />
            {lang === "sv" ? "Certifieringar" : "Certifications"}
          </h3>
          {hasCerts ? (
            <ul className="mt-3 space-y-2">
              {e.certifications.map((c) => (
                <li
                  key={c.slug}
                  className="flex items-start gap-2 rounded-md border border-border/60 bg-background p-3 text-sm text-foreground"
                >
                  <Award className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p className="font-medium">{pick(c.title, lang)}</p>
                    {c.issuer && <p className="mt-0.5 text-xs text-muted-foreground">{c.issuer}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
              <p className="leading-relaxed">{pick(emptyCertificationsCopy, lang)}</p>
              <a
                href={guideHref}
                className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:text-foreground"
              >
                {lang === "sv" ? "Öppna yrkesguiden" : "Open profession guide"}
                <ExternalLink className="h-3 w-3" />
              </a>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                {lang === "sv" ? "Under uppbyggnad" : "Being expanded"}
              </p>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// -------------------- Related & transitions --------------------

function RelatedAndTransitionsBlock({ match, lang }: { match: Match; lang: Lang }) {
  const e = match.enrichment;
  const hasRelated = e.relatedProfessions.length > 0;
  const hasTransitions = e.transitions.length > 0;
  if (!hasRelated && !hasTransitions) return null;

  return (
    <SectionCard
      id="related"
      eyebrow={lang === "sv" ? "Närliggande och övergångar" : "Related and transitions"}
      icon={<Users className="h-3.5 w-3.5" strokeWidth={2} />}
      title={lang === "sv" ? "Vart det kan leda" : "Where it can lead"}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Närliggande yrken" : "Related professions"}
          </h3>
          {hasRelated ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {e.relatedProfessions.map((r) => (
                <li key={r.slug}>
                  <TokenBadge>{pick(r.title, lang)}</TokenBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {lang === "sv" ? "Data för närliggande yrken byggs ut." : "Data for related professions is being expanded."}
            </p>
          )}
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Karriärövergångar" : "Career transitions"}
          </h3>
          {hasTransitions ? (
            <ul className="mt-3 space-y-2">
              {e.transitions.slice(0, 4).map((t, i) => (
                <li key={`${t.otherSlug}-${i}`} className="rounded-md border border-border/60 bg-background p-3 text-sm text-foreground">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TokenBadge tone={t.direction === "to" ? "accent" : "default"}>
                      {t.direction === "to"
                        ? lang === "sv" ? "Framåt" : "Onward"
                        : lang === "sv" ? "Från" : "From"}
                    </TokenBadge>
                    {t.effort && <TokenBadge>{t.effort}</TokenBadge>}
                  </div>
                  {t.notes && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{pick(t.notes, lang)}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {lang === "sv" ? "Data för karriärövergångar byggs ut." : "Data for career transitions is being expanded."}
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// -------------------- Action plan --------------------

function ActionPlanBlock({
  match,
  background,
  onBackgroundChange,
  lang,
}: {
  match: Match;
  background: BackgroundKey;
  onBackgroundChange: (b: BackgroundKey) => void;
  lang: Lang;
}) {
  const plan = useMemo(() => buildActionPlan(match, background), [match, background]);

  const horizon = (title: string, items: typeof plan.now) => (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</h3>
      <ul className="mt-3 space-y-3">
        {items.map((it, i) => (
          <li key={i} className="rounded-md border border-border/60 bg-background p-4">
            <p className="text-sm font-medium text-foreground">{pick(it.title, lang)}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{pick(it.body, lang)}</p>
            {it.href && (
              <a
                href={it.href}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {lang === "sv" ? "Öppna" : "Open"}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <SectionCard
      id="action-plan"
      eyebrow={lang === "sv" ? "Karriärplan" : "Career plan"}
      icon={<Briefcase className="h-3.5 w-3.5" strokeWidth={2} />}
      title={lang === "sv" ? "Din praktiska plan" : "Your practical plan"}
      actions={
        <div className="min-w-[180px]">
          <label htmlFor="cq-bg" className="block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {lang === "sv" ? "Din bakgrund" : "Your background"}
          </label>
          <select
            id="cq-bg"
            value={background}
            onChange={(e) => onBackgroundChange(e.target.value as BackgroundKey)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {backgroundOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {pick(o.label, lang)}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "Bakgrunden anpassar formuleringar och åtgärdsförslag. Den påverkar inte yrkesmatchningen och sparas inte om du inte är inloggad."
          : "Your background tailors the wording and suggested actions. It does not affect the profession matching and is not saved unless you are logged in."}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {horizon(lang === "sv" ? "Börja nu" : "Begin now", plan.now)}
        {horizon(lang === "sv" ? "Nästa 3–12 månader" : "Next 3–12 months", plan.near)}
        {horizon(lang === "sv" ? "Långsiktig riktning" : "Long-term direction", plan.long)}
      </div>
    </SectionCard>
  );
}

// -------------------- Next steps --------------------

function NextStepsBlock({ match, lang }: { match: Match; lang: Lang }) {
  const primaryHref = match.legacySlug ? `/career-center/${match.legacySlug}` : "/career-center";
  const cards: Array<{ title: Bi; body: Bi; href: string; icon: ReactNode; note?: Bi }> = [
    {
      title: { sv: "Utforska yrket i detalj", en: "Explore the profession in detail" },
      body: {
        sv: "Öppna yrkesguiden med ansvar, krav och möjliga vägar framåt.",
        en: "Open the profession guide with responsibilities, requirements and possible paths forward.",
      },
      href: primaryHref,
      icon: <Target className="h-5 w-5" strokeWidth={1.75} />,
    },
    {
      title: { sv: "Utforska karriärfamiljen", en: "Explore the career family" },
      body: { sv: "Se breda alternativ inom samma fält.", en: "See broad alternatives within the same field." },
      href: "/career-center",
      icon: <Compass className="h-5 w-5" strokeWidth={1.75} />,
    },
    {
      title: { sv: "Jämför fler karriärer", en: "Compare more careers" },
      body: {
        sv: "Bläddra bland alla yrkesguider i Career Center.",
        en: "Browse all profession guides in the Career Center.",
      },
      href: "/career-center",
      icon: <ListChecks className="h-5 w-5" strokeWidth={1.75} />,
    },
    {
      title: { sv: "Titta på jobb", en: "Browse jobs" },
      body: {
        sv: "Vi bygger jobbupplevelsen. Titta på jobbsidan för aktuell status.",
        en: "We are building out the jobs experience. See the jobs page for current status.",
      },
      href: "/jobs",
      icon: <Briefcase className="h-5 w-5" strokeWidth={1.75} />,
      note: { sv: "Under utveckling", en: "In development" },
    },
  ];

  return (
    <SectionCard
      id="next-steps"
      eyebrow={lang === "sv" ? "Nästa steg" : "Next step"}
      icon={<TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />}
      title={lang === "sv" ? "Fortsätt din karriärresa" : "Continue your career journey"}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <a
            key={c.href + c.title.en}
            href={c.href}
            className="group flex h-full flex-col gap-3 rounded-md border border-border bg-background p-4 transition-colors hover:border-accent/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between">
              <span className="text-accent">{c.icon}</span>
              {c.note && <TokenBadge tone="warn">{pick(c.note, lang)}</TokenBadge>}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight text-foreground">{pick(c.title, lang)}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{pick(c.body, lang)}</p>
            </div>
          </a>
        ))}
      </div>
    </SectionCard>
  );
}

// -------------------- Save prompt --------------------

function SavePromptBlock({ lang }: { lang: Lang }) {
  return (
    <SectionCard
      id="save"
      eyebrow="Career Journey"
      icon={<Lock className="h-3.5 w-3.5" strokeWidth={2} />}
      title={
        lang === "sv"
          ? "Spara resultatet och fortsätt din karriärresa"
          : "Save your result and continue your career journey"
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "Logga in för att spara din vägledning, välja mål och följa din utveckling över tid."
          : "Log in to save your guidance, choose career goals and follow your development over time."}
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "Endast implementerad funktionalitet utlovas. Planerade delar av Career Journey är markerade som under utveckling."
          : "Only implemented functionality is promised. Planned parts of the Career Journey are marked as in development."}
      </p>
      <div className="mt-4">
        <a
          href="/auth"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {lang === "sv" ? "Logga in för att spara" : "Log in to save"}
        </a>
      </div>
    </SectionCard>
  );
}

// -------------------- Share preview --------------------

function SharePreviewBlock({ match, lang }: { match: Match; lang: Lang }) {
  const band = matchStrengthBand(match.currentFit, match.confidence);
  return (
    <section className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-5 text-sm">
      <div className="flex items-center gap-2">
        <Share2 className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {lang === "sv" ? "Delningsförhandsvisning · Kommande" : "Share preview · Upcoming"}
        </p>
      </div>
      <div className="mt-3 rounded-md border border-border/60 bg-background p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {lang === "sv" ? "CQrityjob · Karriärvägledning" : "CQrityjob · Career guidance"}
        </p>
        <p
          className="mt-1 text-lg font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {professionTitle(match, lang)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {familyLabel(match.family.key, lang)} · {pick(matchStrengthLabel(band), lang)}
        </p>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {lang === "sv"
          ? "Delning är inte aktiverad ännu. Endast icke-känsliga fält (yrke, familj och matchningsstyrka) visas — inga svar eller kontodata."
          : "Sharing is not yet enabled. Only non-sensitive fields (profession, family and match strength) are shown — no answers or account data."}
      </p>
    </section>
  );
}

// -------------------- Methodology --------------------

function MethodologyBlock({ result, lang }: { result: EngineResultV1; lang: Lang }) {
  return (
    <Accordion
      title={lang === "sv" ? "Så fungerar vägledningen" : "How the guidance works"}
      eyebrow={lang === "sv" ? "Metod" : "Methodology"}
      icon={<HelpCircle className="h-3.5 w-3.5" strokeWidth={2} />}
      defaultOpen={false}
    >
      <ul className="space-y-3 text-sm text-foreground">
        {methodologyBullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
            <span className="leading-relaxed">{pick(b.text, lang)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        {lang === "sv" ? "Motorversion" : "Engine version"}: {result.engineVersion}
      </p>
    </Accordion>
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
  const [background, setBackground] = useState<BackgroundKey>("exploring");
  const primary = result.matches[0];
  if (!primary) return null;

  return (
    <div className="space-y-8 md:space-y-10">
      <Hero result={result} primary={primary} profile={result.careerProfile} lang={lang} onRetake={onRetake} />
      <WhyThisResult match={primary} lang={lang} />
      <CareerProfileBlock profile={result.careerProfile} lang={lang} />
      <CareerFamilyBlock ranking={result.familyRanking} matches={result.matches} lang={lang} />
      <ComparisonBlock matches={result.matches} lang={lang} />
      <StrengthsBlock match={primary} lang={lang} />
      <GuidingProfileBlock result={result} lang={lang} />
      <FormalRequirementsBlock match={primary} lang={lang} />
      <EducationCertsBlock match={primary} lang={lang} />
      <RelatedAndTransitionsBlock match={primary} lang={lang} />
      <ActionPlanBlock match={primary} background={background} onBackgroundChange={setBackground} lang={lang} />
      <NextStepsBlock match={primary} lang={lang} />
      <SavePromptBlock lang={lang} />
      <SharePreviewBlock match={primary} lang={lang} />

      {result.disclaimers.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-5 text-sm text-foreground">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.75} />
            <div className="min-w-0 space-y-2">
              {result.disclaimers.map((d, i) => (
                <p key={i} className="leading-relaxed">
                  {pick(d, lang)}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      <MethodologyBlock result={result} lang={lang} />

      <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
        <p>
          {lang === "sv"
            ? "Detta är vägledande karriärintelligens, inte behörighet eller anställningsbeslut. Formella krav gäller alltid."
            : "This is guidance career intelligence, not eligibility or a hiring decision. Formal requirements always apply."}
        </p>
      </div>
    </div>
  );
}
