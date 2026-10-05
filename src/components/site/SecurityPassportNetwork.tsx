// Security Passport Network — a small, quiet proof section.
//
// Draws ONLY what the database approved to publish (see
// src/lib/public-stats/passport-network.ts). It is not a dashboard and not a
// scoreboard: two figures at most, and the markets as a plain sentence in
// alphabetical order of their ISO code — no counts, no ranks, no comparison.
//
// Metric name and value are one <dt>/<dd> pair in source order, so a screen
// reader hears "Security Passports created, 1,247" whatever the visual size.
// The markets are text. While the statistics are unavailable, hidden, or the
// owner has not enabled this surface, the component renders NOTHING.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import {
  formatCount,
  formatUpdatedAt,
  marketName,
  mayShowNetworkStats,
  NETWORK_STATS_QUERY,
  type NetworkStats,
} from "@/lib/public-stats/passport-network";

const DISPLAY = { fontFamily: "var(--font-display)" } as const;

/** Presentation only: takes the approved aggregate, performs no fetch. */
export function SecurityPassportNetworkView({
  stats,
  showLink = false,
  updatedAt = null,
}: {
  stats: NetworkStats;
  showLink?: boolean;
  /** When the figures were last read (epoch ms), or null when not known. */
  updatedAt?: number | null;
}) {
  const { t, lang } = useT();
  const markets = stats.markets.map((code) => marketName(code, lang));
  if (stats.otherMarkets) markets.push(t("network.markets.other"));

  const figures = [
    {
      key: "passports",
      value: stats.passports,
      label: t(stats.passports === 1 ? "network.passports.label.one" : "network.passports.label"),
    },
    // A credentials figure beside zero Passports would only be noise.
    ...(stats.credentials > 0
      ? [
          {
            key: "credentials",
            value: stats.credentials,
            label: t(
              stats.credentials === 1
                ? "network.credentials.label.one"
                : "network.credentials.label",
            ),
          },
        ]
      : []),
  ];

  return (
    <Section id="security-passport-network" bordered className="scroll-mt-20 py-12 md:py-16">
      <div
        data-passport-network
        aria-labelledby="passport-network-title"
        role="group"
        className="mx-auto max-w-3xl text-center"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t("network.eyebrow")}
        </p>
        <h2
          id="passport-network-title"
          className="mt-3 text-balance text-[1.4rem] font-semibold leading-[1.2] tracking-tight text-foreground md:text-[1.75rem]"
          style={DISPLAY}
        >
          {t("network.title")}
        </h2>

        <dl className="mt-8 flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-16">
          {figures.map(({ key, value, label }) => (
            <div key={key} data-network-figure={key} className="flex flex-col-reverse items-center">
              <dt className="mt-1 text-sm text-muted-foreground">{label}</dt>
              <dd
                className="text-[2.75rem] font-semibold leading-none tracking-tight text-foreground tabular-nums md:text-[3.25rem]"
                style={DISPLAY}
              >
                {formatCount(value, lang)}
              </dd>
            </div>
          ))}
        </dl>

        {markets.length > 0 ? (
          <p data-network-markets className="mt-8 text-sm leading-relaxed text-foreground">
            <span className="text-muted-foreground">{t("network.markets.lead")}</span>{" "}
            <span className="font-medium">{markets.join(" · ")}</span>
          </p>
        ) : null}

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{t("network.note")}</p>
        {updatedAt ? (
          <p data-network-updated className="mt-1 text-xs tabular-nums text-muted-foreground">
            {t("network.updated")} {formatUpdatedAt(updatedAt, lang)}
          </p>
        ) : null}

        {showLink ? (
          <Link
            to="/security-passport"
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("network.cta")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </Section>
  );
}

/** Fetches (one cached request) and draws nothing unless the owner has
 *  enabled this surface. */
export function SecurityPassportNetwork({ surface }: { surface: "homepage" | "passport_page" }) {
  const query = useQuery(NETWORK_STATS_QUERY);
  const stats = query.data ?? null;
  if (!mayShowNetworkStats(stats, surface)) return null;
  return (
    <SecurityPassportNetworkView
      stats={stats}
      showLink={surface === "homepage"}
      updatedAt={query.dataUpdatedAt || null}
    />
  );
}
