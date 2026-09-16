import { ArrowRight, CheckCircle2, FileText, Lock, MapPin, PencilLine } from "lucide-react";
import type { ReactNode } from "react";
import { PUBLIC_MARKET_SCALE } from "./passport-market-scale";
import { useT } from "@/i18n/context";

const LEVELS = [
  {
    key: "home.trust.registered",
    icon: PencilLine,
    style: "border-dashed border-primary-foreground/35",
  },
  { key: "home.trust.documented", icon: FileText, style: "border-primary-foreground/55" },
  {
    key: "home.trust.sourceConfirmed",
    icon: CheckCircle2,
    style: "border-primary-foreground bg-primary-foreground/10",
  },
] as const;

/** A generic product preview: no holder, credential, score, identifier, or claim. */
export function HomePassportPreview({ action }: { action?: ReactNode }) {
  const { t } = useT();

  return (
    <article
      aria-label={t("home.markets.eyebrow")}
      className="relative isolate overflow-hidden rounded-xl bg-primary p-5 text-primary-foreground shadow-[var(--shadow-lg)] sm:p-7"
      data-home-passport-preview
      data-home-entry="passport"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-primary-foreground/40"
      />

      <header className="flex items-start justify-between gap-4 border-b border-primary-foreground/15 pb-5">
        <div>
          <p className="text-base font-semibold text-primary-foreground">CQrityjob</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/65">
            Security Passport
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 text-xs text-primary-foreground/80">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("home.passportPreview.private")}
        </span>
      </header>

      <div className="py-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/60">
          {t("home.passportPreview.record")}
        </p>
        <h2 className="mt-2 max-w-[24ch] text-2xl font-semibold leading-tight !text-primary-foreground sm:text-[1.75rem]">
          {t("home.entry.passport.title")}
        </h2>
        <p className="mt-2 max-w-[40ch] text-sm leading-relaxed text-primary-foreground/70">
          {t("home.entry.passport.body")}
        </p>
      </div>

      <div className="grid grid-cols-2 border-y border-primary-foreground/15 py-4 text-xs sm:grid-cols-4">
        {[
          [t("home.passportPreview.issuer"), t("home.passportPreview.source")],
          [t("home.passportPreview.jurisdiction"), t("home.passportPreview.marketScope")],
          [t("home.passportPreview.trustState"), t("home.trust.documented")],
          [t("home.passportPreview.sharing"), t("home.passportPreview.private")],
        ].map(([label, value]) => (
          <dl
            key={label}
            className="min-w-0 px-3 py-2 first:pl-0 sm:border-l sm:border-primary-foreground/15 sm:first:border-l-0 sm:last:pr-0"
          >
            <dt className="text-primary-foreground/50">{label}</dt>
            <dd className="mt-1 break-words font-medium text-primary-foreground/90">{value}</dd>
          </dl>
        ))}
      </div>

      <ul className="space-y-2.5 py-5">
        {LEVELS.map(({ key, icon: Icon, style }) => (
          <li
            key={key}
            className={`flex min-h-11 items-center gap-3 border-l-2 px-3.5 text-sm ${style}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      <footer className="border-t border-primary-foreground/15 pt-5">
        <p className="text-xs font-medium text-primary-foreground/65">
          {t("home.passportPreview.markets")}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {PUBLIC_MARKET_SCALE.map((market) => (
            <li
              key={market.code}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary-foreground/[0.07] px-3 text-xs text-primary-foreground/85"
            >
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {t(market.labelKey)}
            </li>
          ))}
        </ul>
        {action ? (
          <div className="mt-5 flex min-h-11 items-center justify-between gap-4 border-t border-primary-foreground/15 pt-5">
            {action}
            <ArrowRight
              className="h-4 w-4 shrink-0 text-primary-foreground/70"
              aria-hidden="true"
            />
          </div>
        ) : null}
      </footer>
    </article>
  );
}
