import { useEffect, useState } from "react";
import { useT } from "@/i18n/context";

/**
 * Compact relative timestamp ("2 min ago") that refreshes every 60s while
 * mounted. Uses existing i18n language ("sv" | "en") — no new data.
 */
export function RelativeTime({
  value,
  className,
  prefix,
}: {
  value: string | Date | null | undefined;
  className?: string;
  prefix?: string;
}) {
  const { lang } = useT();
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;

  const label = formatRelative(date, lang === "sv" ? "sv" : "en");
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()} className={className}>
      {prefix ? `${prefix} ` : ""}
      {label}
    </time>
  );
}

function formatRelative(date: Date, lang: "sv" | "en"): string {
  const diffMs = Date.now() - date.getTime();
  const abs = Math.abs(diffMs);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  const past = diffMs >= 0;
  const en = (n: number, unit: string) =>
    past ? `${n} ${unit}${n === 1 ? "" : "s"} ago` : `in ${n} ${unit}${n === 1 ? "" : "s"}`;
  const sv = (n: number, unit: string) => (past ? `för ${n} ${unit} sedan` : `om ${n} ${unit}`);

  if (sec < 45) return lang === "sv" ? (past ? "nyss" : "strax") : past ? "just now" : "in a moment";
  if (min < 60) return lang === "sv" ? sv(min, min === 1 ? "minut" : "minuter") : en(min, "minute");
  if (hr < 24) return lang === "sv" ? sv(hr, hr === 1 ? "timme" : "timmar") : en(hr, "hour");
  if (day < 30) return lang === "sv" ? sv(day, day === 1 ? "dag" : "dagar") : en(day, "day");
  const months = Math.round(day / 30);
  if (months < 12)
    return lang === "sv" ? sv(months, months === 1 ? "månad" : "månader") : en(months, "month");
  const years = Math.round(day / 365);
  return lang === "sv" ? sv(years, years === 1 ? "år" : "år") : en(years, "year");
}