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
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { CareerCardCreator } from "@/components/career-discovery/v31/CareerCardCreator";
import { ProfessionRecommendations } from "@/components/career-discovery/v31/ProfessionRecommendations";
import { listCigProfessionsForPicker } from "@/lib/career-discovery/career-context.functions";
import { DIMENSION_IDS, type DimensionId } from "@/lib/career-discovery/v31/dimensions";
import { GOLDEN_PERSONAS } from "@/lib/career-discovery/v31/golden-persona-fixtures";
import type { ProfessionMatch } from "@/lib/career-discovery/v31/professions";
import {
  listOwnerPreviewProfessions,
  runOwnerPreviewMatch,
} from "@/lib/career-discovery/v31-owner-preview.functions";

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

  const listCatalog = useServerFn(listOwnerPreviewProfessions);
  const catalogQuery = useQuery({
    queryKey: ["owner-preview", "catalog"],
    queryFn: () => listCatalog(),
  });

  const listCigProfessions = useServerFn(listCigProfessionsForPicker);
  const cigProfessionsQuery = useQuery({
    queryKey: ["owner-preview", "cig-professions"],
    queryFn: () => listCigProfessions({}),
  });

  const runMatch = useServerFn(runOwnerPreviewMatch);
  const matchQuery = useQuery({
    queryKey: ["owner-preview", "match", personaId, currentProfessionSlug],
    queryFn: () =>
      runMatch({
        data: {
          contextStatus: persona.contextStatus,
          dimensionScores: persona.dims,
          currentProfessionCigSlug: currentProfessionSlug || null,
        },
      }),
  });

  const diagnostics = matchQuery.data;
  const matches = diagnostics?.result;
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
              of review_state or approved_for_ranking, using synthetic golden-persona dimension
              scores. Nothing here is written; approved_for_ranking stays exactly as it is in the
              database.
            </p>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">
          Layer 4 profession-result preview
        </h1>

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
              <option value="">(unset — DNA-inferred fallback)</option>
              {cigProfessionsQuery.data?.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.titleEn}
                </option>
              ))}
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
            {matchQuery.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
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
            score. <span className="font-medium text-foreground">Affinity</span> is driven only by
            Career DNA (central-dominant fit). <span className="font-medium text-foreground">
              Priority
            </span>{" "}
            is the context-aware stage/pathway interpretation on top of it. Internal numeric
            diagnostics — never shown to a candidate.
          </p>
          {diagnostics && diagnostics.diagnostics.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Profession</th>
                    <th className="px-3 py-2 font-medium">Fit score (Affinity)</th>
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
                  {diagnostics.diagnostics.map((d) => (
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
          )}
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Rendered result — real production component
          </h2>
          {matches && matches.available ? (
            <div className="mt-4">
              <ProfessionRecommendations
                strongestDirections={matches.strongestDirections}
                alsoWorthExploring={matches.alsoWorthExploring}
                longerTermPossibilities={matches.longerTermPossibilities}
                careerPivots={matches.careerPivots}
                locale={previewLocale}
                onOpenCareerCard={setCardMatch}
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No matches cleared for this persona (insufficient coverage or fit) — shown honestly,
              not padded.
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
      </div>
    </SiteLayout>
  );
}
