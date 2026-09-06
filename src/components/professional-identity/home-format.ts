// The career home's shared link class and date formatters. Kept out of
// home-primitives.tsx so that file exports components only (fast refresh).

import type { Lang } from "./copy";

export const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function formatDay(iso: string | null, l: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(l === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "long",
  }).format(d);
}

export function formatDate(iso: string | null, l: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(l === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
