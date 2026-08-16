// Owner review / preview — Execution Mandate §2, §16.
//
// Lets a platform admin see exactly what a future APPROVED profession
// result will look like, on the real production recommendation code path
// (matchProfessions -> explainMatch -> ProfessionRecommendations ->
// CareerCardCreator), without setting approved_for_ranking=true anywhere.
// Nested under /_authenticated/admin, which already gates on
// is_platform_admin both client-side (AdminLayout) and, here again,
// server-side inside v31-owner-preview.functions.ts — a candidate route can
// never reach this data, and this route can never write to
// approved_for_ranking.

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { CareerCardCreator } from "@/components/career-discovery/v31/CareerCardCreator";
import { MoveForwardSection } from "@/components/career-discovery/v31/MoveForwardSection";
import { PossiblePathway } from "@/components/career-discovery/v31/PossiblePathway";
import { ProfessionRecommendations } from "@/components/career-discovery/v31/ProfessionRecommendations";
import { V31ReportView } from "@/components/career-discovery/v31/V31ReportView";
import { listCigProfessionsForPicker } from "@/lib/career-discovery/career-context.functions";
import { listMyDiscoveryReports } from "@/lib/career-discovery/discovery.functions";
import { DIMENSION_IDS, type DimensionId } from "@/lib/career-discovery/v31/dimensions";
import { GOLDEN_PERSONAS } from "@/lib/career-discovery/v31/golden-persona-fixtures";
import type {
  ProfessionAffinityDiagnostic,
  ProfessionMatch,
} from "@/lib/career-discovery/v31/professions";
import { DEFINITION_VERSION } from "@/lib/career-discovery/v31/version";
import {
  approveOwnerPreviewProfessions,
  listOwnerPreviewProfessions,
  runOwnerPreviewMatch,
  runOwnerPreviewMatchFromReport,
} from "@/lib/career-discovery/v31-owner-preview.functions";

/** The Profession Affinity vs Recommendation Priority diagnostics table —
 *  shared verbatim between "golden persona" and "my saved reports" mode so
 *  the two never drift into showing different columns for the same data. */
function DiagnosticsTable({ rows }: { rows: readonly ProfessionAffinityDiagnostic[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Profession</th>
            <th className="px-3 py-2 font-medium">Fit score (Affinity)</th>
            <th className="px-3 py-2 font-medium">Central z-score</th>
            <th className="px-3 py-2 font-medium">Central fit</th>
            <th className="px-3 py-2 font-medium">Supporting fit</th>
            <th className="px-3 py-2 font-medium">Central coverage</th>
            <th className="px-3 py-2 font-medium">Context bonus</th>
            <th className="px-3 py-2 font-medium">CIG pathway bonus</th>
            <th className="px-3 py-2 font-medium">Priority score</th>
            <th className="px-3 py-2 font-medium">Stage (pre-pivot)</th>
            <th className="px-3 py-2 font-medium">Final stage</th>
            <th className="px-3 py-2 font-medium">Priority changed?</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((d) => (
            <tr
              key={d.professionId}
              className={
                d.isCurrentProfession
                  ? "bg-amber-50"
                  : d.priorityChangedByPivot
                    ? "bg-accent/5"
                    : ""
              }
            >
              <td className="px-3 py-2 font-medium text-foreground">
                {d.professionId} — {d.titleEn}
                {d.isCurrentProfession && (
                  <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                    YOU ARE HERE — excluded from matches (item 8)
                  </span>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums text-foreground">
                {d.fitScore} ({d.fitTier})
              </td>
              <td className="px-3 py-2 tabular-nums font-medium text-foreground">
                {d.centralZ !== null
                  ? `${d.centralZ >= 0 ? "+" : ""}${d.centralZ.toFixed(2)}σ`
                  : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {d.centralFitScore ?? "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {d.supportingFitScore ?? "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {d.centralCoverage !== null ? `${Math.round(d.centralCoverage * 100)}%` : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {d.contextPriorityBonus > 0 ? `+${d.contextPriorityBonus}` : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {d.cigPathwayBonus > 0 ? `+${d.cigPathwayBonus}` : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums font-medium text-foreground">
                {d.priorityScore}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{d.stageBeforePivotCheck}</td>
              <td className="px-3 py-2 font-medium text-foreground">{d.finalStage}</td>
              <td className="px-3 py-2">
                {d.priorityChangedByPivot ? (
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    pivot applied
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/career-discovery-preview")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Layer 4 owner preview — CQrityjob admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CareerDiscoveryPreview,
});

function CareerDiscoveryPreview() {
  // Release Completion mandate §5: "the owner must be able to take or
  // select a real completed assessment result and inspect the FULL
  // profession output... The review should look like the final candidate
  // report." Golden-persona mode (below) stays exactly as it was — this
  // adds a second, independent source without touching it.
  const [source, setSource] = useState<"persona" | "report">("persona");
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");

  const listMyReports = useServerFn(listMyDiscoveryReports);
  const myReportsQuery = useQuery({
    queryKey: ["owner-preview", "my-reports"],
    queryFn: () => listMyReports(),
    enabled: source === "report",
  });
  const v31Reports = (myReportsQuery.data?.reports ?? []).filter(
    (r) => r.definitionVersion === DEFINITION_VERSION,
  );

  const runReportMatch = useServerFn(runOwnerPreviewMatchFromReport);
  const reportMatchQuery = useQuery({
    queryKey: ["owner-preview", "match-from-report", selectedSnapshotId],
    queryFn: () => runReportMatch({ data: { snapshotId: selectedSnapshotId } }),
    enabled: source === "report" && selectedSnapshotId !== "",
  });

  const [personaId, setPersonaId] = useState(GOLDEN_PERSONAS[0].id);
  const persona = GOLDEN_PERSONAS.find((p) => p.id === personaId) ?? GOLDEN_PERSONAS[0];
  // Independent of the site-wide language toggle, deliberately — an owner
  // reviewing calibration needs to check Swedish and English candidate-
  // facing copy side by side (Execution Mandate §37/§42), not whatever the
  // admin's own browsing language happens to be. A hardcoded "en" here in
  // an earlier pass was itself the exact defect §37 flags: candidate-facing
  // content silently staying English regardless of the requested locale.
  const [previewLocale, setPreviewLocale] = useState<"sv" | "en">("sv");
  // Master Completion Mandate item 3/14: lets the owner see, for the SAME
  // Career DNA, how Recommendation Priority changes when a current
  // profession is supplied vs. left unset (DNA-inferred fallback) — the
  // "why priority changed" comparison in one control.
  const [currentProfessionSlug, setCurrentProfessionSlug] = useState<string>("");
  // Owner Security Manager scenario fix: lets the owner preview
  // resolveStageBaseline's real effect (professions.ts) — a known senior
  // current profession + real experience must anchor career-stage on that
  // fact, not stay pinned to C1's coarse baseline.
  const [experienceBand, setExperienceBand] = useState<
    "" | "under_1y" | "1_3y" | "4_7y" | "8_plus_y"
  >("");

  const listCatalog = useServerFn(listOwnerPreviewProfessions);
  const catalogQuery = useQuery({
    queryKey: ["owner-preview", "catalog"],
    queryFn: () => listCatalog(),
  });

  // Release Completion mandate §13: owner approval workflow. Built and
  // wired to a real UPDATE — nothing in this file calls it. It only ever
  // fires from a click the owner makes in this UI.
  const queryClient = useQueryClient();
  const [selectedForApproval, setSelectedForApproval] = useState<Set<string>>(new Set());
  const [pendingApprovalAction, setPendingApprovalAction] = useState<"all" | "selected" | null>(
    null,
  );
  const approveFn = useServerFn(approveOwnerPreviewProfessions);
  const approveMutation = useMutation({
    mutationFn: (professionIds: string[]) => approveFn({ data: { professionIds } }),
    onSuccess: () => {
      setPendingApprovalAction(null);
      setSelectedForApproval(new Set());
      queryClient.invalidateQueries({ queryKey: ["owner-preview", "catalog"] });
    },
  });
  function toggleApprovalSelection(professionId: string) {
    setSelectedForApproval((prev) => {
      const next = new Set(prev);
      if (next.has(professionId)) next.delete(professionId);
      else next.add(professionId);
      return next;
    });
  }

  const listCigProfessions = useServerFn(listCigProfessionsForPicker);
  const cigProfessionsQuery = useQuery({
    queryKey: ["owner-preview", "cig-professions"],
    queryFn: () => listCigProfessions({}),
  });

  const runMatch = useServerFn(runOwnerPreviewMatch);
  const matchQuery = useQuery({
    queryKey: ["owner-preview", "match", personaId, currentProfessionSlug, experienceBand],
    queryFn: () =>
      runMatch({
        data: {
          contextStatus: persona.contextStatus,
          dimensionScores: persona.dims,
          currentProfessionCigSlug: currentProfessionSlug || null,
          experienceBand: experienceBand || null,
        },
      }),
  });

  const diagnostics = matchQuery.data;
  const matches = diagnostics?.result;
  const selectedCurrentProfession = currentProfessionSlug
    ? cigProfessionsQuery.data?.find((p) => p.slug === currentProfessionSlug)
    : undefined;
  const [cardMatch, setCardMatch] = useState<ProfessionMatch | null>(null);
  const dimensionScores = Object.fromEntries(
    DIMENSION_IDS.map((id) => [id, persona.dims[id] ?? null]),
  ) as Record<DimensionId, number | null>;

  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Internal owner preview — not live to candidates</p>
            <p className="mt-1">
              This runs the real matchProfessions engine against every cd_professions row regardless
              of review_state or approved_for_ranking, either against synthetic golden-persona
              dimension scores or a real saved report of your own. Nothing here is written;
              approved_for_ranking stays exactly as it is in the database.
            </p>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">
          Layer 4 profession-result preview
        </h1>

        <div className="mt-4 flex gap-2">
          {[
            { id: "persona" as const, label: "Golden persona" },
            { id: "report" as const, label: "My saved reports" },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSource(m.id)}
              aria-pressed={source === m.id}
              className={`h-10 rounded-md border px-4 text-sm font-medium transition-colors ${
                source === m.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-background text-foreground hover:bg-muted/50"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {source === "report" && (
          <div className="mt-6">
            <div className="rounded-xl border border-border bg-card/95 p-5">
              <label
                htmlFor="report-select"
                className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
              >
                Your saved v3.1 reports
              </label>
              {myReportsQuery.isLoading && (
                <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
              )}
              {!myReportsQuery.isLoading && v31Reports.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  No saved v3.1 reports found under your own account. Take and save a real
                  assessment first (as this admin user), then it will appear here.
                </p>
              )}
              {v31Reports.length > 0 && (
                <select
                  id="report-select"
                  value={selectedSnapshotId}
                  onChange={(e) => setSelectedSnapshotId(e.target.value)}
                  className="mt-2 block h-10 w-full max-w-xl rounded-md border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Select a saved report…</option>
                  {v31Reports.map((r) => (
                    <option key={r.snapshotId} value={r.snapshotId}>
                      {new Date(r.generatedAt).toLocaleString()} · {r.contextStatus ?? "no context"}
                      {r.topAreaId ? ` · ${r.topAreaId}` : ""} · {r.locale}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {reportMatchQuery.isLoading && selectedSnapshotId !== "" && (
              <p className="mt-4 text-sm text-muted-foreground">Running full-catalogue match…</p>
            )}
            {reportMatchQuery.isError && (
              <p className="mt-4 text-sm text-destructive">
                Could not load or match this report:{" "}
                {(reportMatchQuery.error as Error)?.message ?? "unknown error"}
              </p>
            )}

            {reportMatchQuery.data && (
              <>
                <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Source snapshot: {reportMatchQuery.data.sourceSnapshotId} · generated{" "}
                  {new Date(reportMatchQuery.data.generatedAt).toLocaleString()} · versions{" "}
                  {reportMatchQuery.data.versions.definition} /{" "}
                  {reportMatchQuery.data.versions.content} /{" "}
                  {reportMatchQuery.data.versions.scoring} /{" "}
                  {reportMatchQuery.data.versions.taxonomy}
                </div>

                <div className="mt-6">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    Profession Affinity vs Recommendation Priority
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    Run against the real, unfiltered profession catalogue (every review state) using
                    this report's actual frozen Career DNA scores plus this session's real context
                    status / current profession / experience. Internal numeric diagnostics — never
                    shown to a candidate.
                  </p>
                  <DiagnosticsTable rows={reportMatchQuery.data.diagnostics} />
                </div>

                <div className="mt-10">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    Rendered result — the real candidate report, as if activated
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    This is V31ReportView, the exact component a candidate sees, fed this report's
                    real frozen Career DNA/patterns/career areas with ONLY the profession section
                    replaced by a fresh run against the full catalogue.
                  </p>
                  <div className="mt-4 rounded-xl border border-border bg-background">
                    <V31ReportView
                      snapshot={reportMatchQuery.data.snapshot}
                      generatedAt={reportMatchQuery.data.generatedAt}
                      versions={reportMatchQuery.data.versions}
                      mode="authenticated"
                      sessionId={reportMatchQuery.data.sourceSessionId}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {source === "persona" && (
          <>
            {/* Controls are grouped into one sticky panel so an owner reviewing
            seven personas never loses the persona/locale switches while
            scrolling a long diagnostics table. */}
            <div className="sticky top-0 z-10 mt-6 flex flex-wrap gap-6 rounded-xl border border-border bg-card/95 p-5 backdrop-blur supports-[backdrop-filter]:bg-card/80">
              <div>
                <label
                  htmlFor="persona-select"
                  className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
                >
                  Golden persona
                </label>
                <select
                  id="persona-select"
                  value={personaId}
                  onChange={(e) => setPersonaId(e.target.value)}
                  className="mt-2 block h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                >
                  {GOLDEN_PERSONAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name.en} ({p.contextStatus})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Candidate-facing locale
                </span>
                <div className="mt-2 flex gap-2">
                  {(["sv", "en"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setPreviewLocale(l)}
                      aria-pressed={previewLocale === l}
                      className={`h-10 rounded-md border px-4 text-sm font-medium transition-colors ${
                        previewLocale === l
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-background text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {l === "sv" ? "Svenska" : "English"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="current-profession-select"
                  className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
                >
                  Current career context (self-reported)
                </label>
                <select
                  id="current-profession-select"
                  value={currentProfessionSlug}
                  onChange={(e) => setCurrentProfessionSlug(e.target.value)}
                  className="mt-2 block h-10 min-w-[220px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="">(unset — no YOU ARE HERE, no pivot classification)</option>
                  {cigProfessionsQuery.data?.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.titleEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="experience-band-select"
                  className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
                >
                  Experience (self-reported)
                </label>
                <select
                  id="experience-band-select"
                  value={experienceBand}
                  onChange={(e) => setExperienceBand(e.target.value as typeof experienceBand)}
                  className="mt-2 block h-10 min-w-[160px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="">(unset)</option>
                  <option value="under_1y">Under 1 year</option>
                  <option value="1_3y">1-3 years</option>
                  <option value="4_7y">4-7 years</option>
                  <option value="8_plus_y">8+ years</option>
                </select>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Career DNA (synthetic persona dimension scores)
                </h2>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                  {DIMENSION_IDS.map((id) => {
                    const score = persona.dims[id] ?? null;
                    return (
                      <li key={id} className="flex items-center gap-2">
                        <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                          {id}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${Math.round((score ?? 0) * 100)}%` }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                          {score === null ? "—" : score.toFixed(2)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Context signals · current role
                </h2>
                <p className="mt-3 text-foreground">
                  <span className="font-medium">C1 (context status):</span> {persona.contextStatus}
                </p>
                <p className="mt-1.5 text-foreground">
                  <span className="font-medium">Current profession (self-reported):</span>{" "}
                  {currentProfessionSlug || "unset — no YOU ARE HERE, no pivot classification"}
                </p>
                <p className="mt-1.5 text-foreground">
                  <span className="font-medium">Experience (self-reported):</span>{" "}
                  {experienceBand || "unset"}
                </p>
                {diagnostics && (
                  <p className="mt-1.5 text-foreground">
                    <span className="font-medium">Career-pivot classification grounded by:</span>{" "}
                    {diagnostics.pivotPrimarySource === "current_profession"
                      ? `self-reported current profession (${diagnostics.pivotPrimaryAreaId})`
                      : "none — current profession unknown, career_pivot never computed (item 2: never inferred from Career DNA)"}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  Catalogue ({catalogQuery.data?.length ?? "…"} professions)
                </h2>
                <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
                  {catalogQuery.data?.map((p) => (
                    <li
                      key={p.professionId}
                      className="flex items-center justify-between gap-3 bg-background p-3"
                    >
                      <span>
                        {p.professionId} — {p.titleEn}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {p.reviewState}
                        {p.approvedForRanking ? " · approved" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  Result summary
                </h2>
                {matchQuery.isLoading && (
                  <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
                )}
                {matches && (
                  <dl className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
                    {[
                      ["Strongest", matches.strongestDirections.length],
                      ["Also worth", matches.alsoWorthExploring.length],
                      ["Longer-term", matches.longerTermPossibilities.length],
                      ["Career pivot", matches.careerPivots.length],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="bg-background p-3">
                        <dt className="text-xs text-muted-foreground">{k}</dt>
                        <dd className="mt-1 text-lg font-semibold text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>

            <div className="mt-10">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Profession Affinity vs Recommendation Priority
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Explicitly separate, per Master Completion Mandate item 3 — never combined into one
                score. <span className="font-medium text-foreground">Affinity</span> is driven only
                by Career DNA (central-dominant fit).{" "}
                <span className="font-medium text-foreground">Priority</span> is the context-aware
                stage/pathway interpretation on top of it. Internal numeric diagnostics — never
                shown to a candidate.
              </p>
              {diagnostics && <DiagnosticsTable rows={diagnostics.diagnostics} />}
            </div>

            <div className="mt-10">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Rendered result — real production components (the exact same ones a candidate sees)
              </h2>

              {/* YOU ARE HERE — same copy/placement as V31ReportView.tsx, so an
              owner reviewing here sees exactly what a candidate would.
              Frozen-report locale rule applies here too: bound to
              previewLocale, not the admin's own browsing language. */}
              {selectedCurrentProfession && (
                <div className="mt-4 flex gap-4 rounded-xl border border-accent/25 bg-card p-5 sm:p-6">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-3 w-3 shrink-0 rounded-full bg-accent ring-4 ring-accent/15"
                  />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                      {previewLocale === "sv" ? "DU ÄR HÄR" : "YOU ARE HERE"}
                    </p>
                    <p className="mt-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                      {previewLocale === "sv"
                        ? selectedCurrentProfession.titleSv
                        : selectedCurrentProfession.titleEn}
                    </p>
                  </div>
                </div>
              )}

              {matches && matches.available ? (
                <div className="mt-4">
                  <ProfessionRecommendations
                    strongestDirections={matches.strongestDirections}
                    alsoWorthExploring={matches.alsoWorthExploring}
                    longerTermPossibilities={matches.longerTermPossibilities}
                    careerPivots={matches.careerPivots}
                    currentProfessionMatch={matches.currentProfessionMatch}
                    locale={previewLocale}
                    onOpenCareerCard={setCardMatch}
                  />
                  <PossiblePathway
                    snapshot={{
                      professions: { ...matches, available: true },
                      currentProfession: selectedCurrentProfession
                        ? {
                            cigSlug: selectedCurrentProfession.slug,
                            titleSv: selectedCurrentProfession.titleSv,
                            titleEn: selectedCurrentProfession.titleEn,
                          }
                        : null,
                    }}
                    locale={previewLocale}
                  />
                  <MoveForwardSection
                    matches={
                      matches.strongestDirections.length > 0
                        ? matches.strongestDirections
                        : matches.matches
                    }
                    locale={previewLocale}
                  />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No matches cleared for this persona (insufficient coverage or fit) — shown
                  honestly, not padded.
                </p>
              )}
            </div>

            {matches && matches.matches.length > 0 && (
              <CareerCardCreator
                open={cardMatch !== null}
                onOpenChange={(next) => {
                  if (!next) setCardMatch(null);
                }}
                matches={matches.matches}
                initialProfessionId={cardMatch?.professionId}
                dimensionScores={dimensionScores}
                locale={previewLocale}
                definitionVersion="owner-preview"
                generatedAt={new Date().toISOString()}
              />
            )}
          </>
        )}

        <div className="mt-14 border-t border-border pt-8">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Owner approval workflow
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Release Completion mandate §13: review the rendered results above for every profession
            first. Activation is explicit and per-profession — nothing here fires automatically, and
            nothing in this codebase calls this action on its own. approved_for_ranking currently
            stays exactly as stored in the database until you click one of the buttons below.
          </p>

          {approveMutation.isError && (
            <p className="mt-3 text-sm text-destructive">
              Approval failed: {(approveMutation.error as Error)?.message ?? "unknown error"}
            </p>
          )}
          {approveMutation.isSuccess && (
            <p className="mt-3 text-sm text-emerald-700">
              Approved: {approveMutation.data?.updated.join(", ")}
            </p>
          )}

          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">Profession</th>
                  <th className="px-3 py-2 font-medium">Review state</th>
                  <th className="px-3 py-2 font-medium">approved_for_ranking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {catalogQuery.data?.map((p) => (
                  <tr key={p.professionId} className="bg-background">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.titleEn} for approval`}
                        checked={selectedForApproval.has(p.professionId)}
                        disabled={p.approvedForRanking}
                        onChange={() => toggleApprovalSelection(p.professionId)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {p.professionId} — {p.titleEn}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.reviewState}</td>
                    <td className="px-3 py-2">
                      {p.approvedForRanking ? (
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                          approved
                        </span>
                      ) : (
                        <span className="text-muted-foreground">not approved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={selectedForApproval.size === 0 || approveMutation.isPending}
              onClick={() => setPendingApprovalAction("selected")}
              className="h-10 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve selected ({selectedForApproval.size})
            </button>
            <button
              type="button"
              disabled={!catalogQuery.data || approveMutation.isPending}
              onClick={() => setPendingApprovalAction("all")}
              className="h-10 rounded-md border border-accent bg-accent/10 px-4 text-sm font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve all {catalogQuery.data?.length ?? ""} professions
            </button>
          </div>

          {pendingApprovalAction && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Confirm activation</p>
              <p className="mt-1">
                {pendingApprovalAction === "all"
                  ? `This sets approved_for_ranking = true for all ${catalogQuery.data?.length ?? 0} professions. They will immediately start appearing in every candidate's live recommendations.`
                  : `This sets approved_for_ranking = true for ${selectedForApproval.size} selected profession(s). They will immediately start appearing in matching candidates' live recommendations.`}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={approveMutation.isPending}
                  onClick={() => {
                    const ids =
                      pendingApprovalAction === "all"
                        ? (catalogQuery.data ?? []).map((p) => p.professionId)
                        : Array.from(selectedForApproval);
                    approveMutation.mutate(ids);
                  }}
                  className="h-9 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {approveMutation.isPending ? "Activating…" : "Yes, activate"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingApprovalAction(null)}
                  className="h-9 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted/50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}
