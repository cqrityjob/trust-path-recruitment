// Unified report history — Security Career Discovery v3 alongside legacy v2.1.
//
// ONE list, two report types, with an explicit discriminator. The candidate
// should not have to know that the product changed instruments; they should
// see their reports, newest first, each labelled with what produced it.
//
// ── IMMUTABILITY ───────────────────────────────────────────────────────
//
// Every row renders ONLY from data stored at completion: the type, the
// version string and the completion date. It deliberately does NOT render a
// career-area name, because area names live in versioned content that can
// change — a history row must not silently re-title itself when a
// translation or an area description is updated. The area names belong to
// the report, which is immutable, and that is where they are shown.
//
// ── SEPARATION ─────────────────────────────────────────────────────────
//
// Legacy rows link to /my-career/reports/$runId and are rendered from the
// runs the dashboard already loaded. v3 rows link to the canonical report
// route. Neither source is mutated, merged or converted — they are two
// independent histories presented in one chronological list.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ClipboardCheck, Compass } from "lucide-react";
import { useT } from "@/i18n/context";
import { listMyDiscoveryReports } from "@/lib/career-discovery/discovery.functions";

/** A legacy run as the My Career dashboard already has it. */
export interface LegacyRunRow {
  id: string;
  completed_at?: string | null;
  started_at?: string | null;
}

type Row =
  | { kind: "discovery"; id: string; at: string; version: string; internalTest: boolean }
  | { kind: "legacy"; id: string; at: string };

export function ReportHistoryList({ legacyRuns }: { legacyRuns: LegacyRunRow[] }) {
  const { t, lang } = useT();
  const load = useServerFn(listMyDiscoveryReports);
  const [discovery, setDiscovery] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    load({})
      .then((d) => {
        if (!alive) return;
        setDiscovery(
          d.reports.map((r) => ({
            kind: "discovery" as const,
            id: r.snapshotId,
            at: r.generatedAt,
            version: r.definitionVersion,
            // Surfaced so a tester always knows which reports came from the
            // unreviewed internal-test instrument.
            internalTest: true,
          })),
        );
        setLoaded(true);
      })
      // A failure to load v3 must never hide the legacy history.
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [load]);

  const rows: Row[] = [
    ...discovery,
    ...legacyRuns.map((r) => ({
      kind: "legacy" as const,
      id: r.id,
      at: r.completed_at ?? r.started_at ?? "",
    })),
  ]
    .filter((r) => r.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const fmt = new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (loaded && rows.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">{t("careerDiscovery.history.empty")}</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={`${row.kind}-${row.id}`} className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-start gap-3">
            {row.kind === "discovery" ? (
              <Compass className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
            ) : (
              <ClipboardCheck
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {row.kind === "discovery"
                  ? t("careerDiscovery.history.type.discovery")
                  : t("careerDiscovery.history.type.legacy")}
              </p>
              {/* Date and internal-test marker only. The definition version
                  used to sit between them in a monospace face, which made a
                  list of the candidate's own reports read like a build log.
                  It is kept as a data attribute for diagnostics. */}
              <p
                className="mt-0.5 text-xs text-muted-foreground"
                data-definition-version={row.kind === "discovery" ? row.version : undefined}
              >
                {fmt.format(new Date(row.at))}
                {row.kind === "discovery" &&
                  row.internalTest &&
                  ` · ${t("careerDiscovery.history.internalTest")}`}
              </p>
            </div>
          </div>

          {row.kind === "discovery" ? (
            <Link
              to="/security-career-assessment/report/$snapshotId"
              params={{ snapshotId: row.id }}
              className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              {t("careerDiscovery.history.open")}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          ) : (
            <Link
              to="/my-career/reports/$runId"
              params={{ runId: row.id }}
              className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              {t("careerDiscovery.history.open")}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
