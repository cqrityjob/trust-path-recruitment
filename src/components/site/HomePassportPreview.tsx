import { CheckCircle2, FileText, Lock, MapPin, PencilLine } from "lucide-react";
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
export function HomePassportPreview() {
  const { t } = useT();

  return (
    <aside
      aria-label={t("home.markets.eyebrow")}
      className="relative isolate overflow-hidden rounded-2xl border border-primary/15 bg-primary p-5 text-primary-foreground shadow-[var(--shadow-lg)] sm:p-7"
      data-home-passport-preview
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-primary-foreground/[0.04]"
      />

      <header className="flex items-start justify-between gap-4 border-b border-primary-foreground/15 pb-5">
        <div>
          <p className="text-lg font-semibold text-primary-foreground">CQrityjob</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/65">
            Security Passport
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-primary-foreground/25 px-3 text-xs text-primary-foreground/80">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("home.passportPreview.private")}
        </span>
      </header>

      <div className="py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/60">
          {t("home.passportPreview.record")}
        </p>
        <p className="mt-2 max-w-[26ch] text-xl font-semibold leading-tight text-primary-foreground sm:text-2xl">
          {t("home.passportPreview.title")}
        </p>
        <p className="mt-2 max-w-[40ch] text-sm leading-relaxed text-primary-foreground/70">
          {t("home.passportPreview.body")}
        </p>
      </div>

      <ul className="space-y-2.5 border-y border-primary-foreground/15 py-5">
        {LEVELS.map(({ key, icon: Icon, style }) => (
          <li
            key={key}
            className={`flex min-h-11 items-center gap-3 rounded-lg border px-3.5 text-sm ${style}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      <footer className="pt-5">
        <p className="text-xs font-medium text-primary-foreground/65">
          {t("home.passportPreview.markets")}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {PUBLIC_MARKET_SCALE.map((market) => (
            <li
              key={market.code}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-primary-foreground/20 px-3 text-xs text-primary-foreground/85"
            >
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {t(market.labelKey)}
            </li>
          ))}
        </ul>
      </footer>
    </aside>
  );
}
