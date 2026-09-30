/**
 * The career page's hero aside: the two ways in, side by side (owner review,
 * 2026-09-30).
 *
 *   "Utgå från mitt nuvarande yrke"  → the pathFrom section (#fran-mitt-yrke)
 *   "Utforska säkerhetsyrken"        → the list of every profession, with the
 *                                      career analysis as its second action
 *
 * Once the reader's own analysis result is in hand, the second door leads to
 * THEIR recommendation (#min-riktning) instead. Without one, the analysis
 * is a direct link to the analysis itself — never a jump to an invitation
 * further down this page.
 *
 * ── THESE ARE DOORS, NOT SECTIONS ──────────────────────────────────────
 *
 * Every destination is a section of this page. The cards render no
 * professions of their own and hold no state: duplicating a section's
 * content here would give one fact two places to disagree about itself.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Compass, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";

export function CareerEntryCards({
  pathAnchor,
  personalAnchor,
  listAnchor,
  personalised = false,
}: {
  readonly pathAnchor: string;
  readonly personalAnchor: string;
  readonly listAnchor: string;
  /** The reader's own assessment result is in hand. */
  readonly personalised?: boolean;
}) {
  return (
    <div className="space-y-4" data-career-entry-cards>
      <EntryCard
        icon={<TrendingUp className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        titleKey="cc.entry.fromProfession.title"
        bodyKey="cc.entry.fromProfession.body"
        ctaKey="cc.entry.fromProfession.cta"
        hash={pathAnchor}
        cta="career-entry-profession"
      />
      {personalised ? (
        <EntryCard
          icon={<BarChart3 className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          titleKey="cc.entry.fromAnalysis.title"
          bodyKey="cc.entry.fromAnalysis.body"
          ctaKey="cc.entry.fromAnalysis.cta"
          hash={personalAnchor}
          cta="career-entry-analysis"
        />
      ) : (
        <EntryCard
          icon={<Compass className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          titleKey="cc.entry.explore.title"
          bodyKey="cc.entry.explore.body"
          ctaKey="cc.entry.explore.cta"
          hash={listAnchor}
          cta="career-entry-explore"
          secondary={{
            key: "cc.entry.explore.analysis",
            to: "/security-career-assessment",
            cta: "career-entry-assessment",
          }}
        />
      )}
    </div>
  );
}

function EntryCard({
  icon,
  titleKey,
  bodyKey,
  ctaKey,
  hash,
  cta,
  secondary,
}: {
  readonly icon: ReactNode;
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
  readonly ctaKey: TranslationKey;
  /** A section on this page. */
  readonly hash: string;
  readonly cta: string;
  /** A second, quieter jump on the same page. */
  readonly secondary?: {
    readonly key: TranslationKey;
    readonly to: "/security-career-assessment";
    readonly cta: string;
  };
}) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex-shrink-0 rounded-lg bg-accent/10 p-2 text-accent">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{t(titleKey)}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
          {/* Same-page link. The two sections are on this route, so this is
              a jump to them rather than navigation away from the hub. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5">
            <Link
              to="/career-center"
              hash={hash}
              data-cta={cta}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t(ctaKey)}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Link>
            {secondary && (
              <Link
                to={secondary.to}
                data-cta={secondary.cta}
                className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t(secondary.key)}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
