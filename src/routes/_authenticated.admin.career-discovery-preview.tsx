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
import { ProfessionRecommendations } from "@/components/career-discovery/v31/ProfessionRecommendations";
import { GOLDEN_PERSONAS } from "@/lib/career-discovery/v31/golden-persona-fixtures";
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

  const listCatalog = useServerFn(listOwnerPreviewProfessions);
  const catalogQuery = useQuery({
    queryKey: ["owner-preview", "catalog"],
    queryFn: () => listCatalog(),
  });

  const runMatch = useServerFn(runOwnerPreviewMatch);
  const matchQuery = useQuery({
    queryKey: ["owner-preview", "match", personaId],
    queryFn: () =>
      runMatch({
        data: { contextStatus: persona.contextStatus, dimensionScores: persona.dims },
      }),
  });

  const matches = matchQuery.data;

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

        <div className="mt-6">
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
              <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
                {[
                  ["Strongest", matches.strongestDirections.length],
                  ["Also worth", matches.alsoWorthExploring.length],
                  ["Longer-term", matches.longerTermPossibilities.length],
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
            Rendered result — real production component
          </h2>
          {matches && matches.available ? (
            <div className="mt-4">
              <ProfessionRecommendations
                strongestDirections={matches.strongestDirections}
                alsoWorthExploring={matches.alsoWorthExploring}
                longerTermPossibilities={matches.longerTermPossibilities}
                locale="en"
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No matches cleared for this persona (insufficient coverage or fit) — shown honestly,
              not padded.
            </p>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}
