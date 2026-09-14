/**
 * Sketch 4's hero aside: the two ways into a career path, side by side.
 *
 * ── THESE ARE DOORS, NOT SECTIONS ──────────────────────────────────────
 *
 * Both destinations already exist on this page and are unchanged:
 * "Från ditt yrke" (#fran-mitt-yrke) and "Din riktning" (#min-riktning).
 * What the page lacked was any statement, at the top, that there ARE two
 * routes in — one from the profession the reader has recorded, one from
 * the analysis they have taken. A reader who had done neither could not
 * tell the two apart by scrolling, because both render as a heading over a
 * list of professions.
 *
 * So these cards name the two and link to them. They render no professions
 * of their own and hold no state: duplicating either section's content here
 * would give one fact two places to disagree about itself, and would put
 * roughly two screens of cards above the fold on a phone.
 *
 * The hero aside previously held TrustRail. That content did not belong to
 * the hero specifically — it describes the profession catalogue — so it
 * moves down to the section that renders the catalogue rather than being
 * dropped.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, TrendingUp, BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";

export function CareerEntryCards({
  pathAnchor,
  personalAnchor,
}: {
  readonly pathAnchor: string;
  readonly personalAnchor: string;
}) {
  return (
    <div className="space-y-4" data-career-entry-cards>
      <EntryCard
        icon={<TrendingUp className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        titleKey="cc.entry.fromProfession.title"
        bodyKey="cc.entry.fromProfession.body"
        hash={pathAnchor}
        cta="career-entry-profession"
      />
      <EntryCard
        icon={<BarChart3 className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        titleKey="cc.entry.fromAnalysis.title"
        bodyKey="cc.entry.fromAnalysis.body"
        hash={personalAnchor}
        cta="career-entry-analysis"
      />
    </div>
  );
}

function EntryCard({
  icon,
  titleKey,
  bodyKey,
  hash,
  cta,
}: {
  readonly icon: ReactNode;
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
  readonly hash: string;
  readonly cta: string;
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
          <Link
            to="/career-center"
            hash={hash}
            data-cta={cta}
            className="mt-4 inline-flex items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("cc.entry.cta")}
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
