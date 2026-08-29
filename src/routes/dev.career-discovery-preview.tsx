// Dev-only Layer 4 visual verification harness — Autonomous Final
// Completion Mandate, item 17 / task "Build dev-only fixture harness for
// visual verification".
//
// The real owner-review tool (_authenticated.admin.career-discovery-preview.tsx)
// requires a logged-in platform-admin session. Claude has no owner
// credentials and safety rules prohibit ever creating an account or
// entering one, so that route cannot be reached from an automated
// verification pass. This route exists ONLY to let visual/rendering
// verification happen locally, on `npm run dev`, without needing that
// login -- it renders the exact same production components
// (ProfessionRecommendations, PossiblePathway, MoveForwardSection,
// CareerCardCreator) against the same GOLDEN_PERSONAS + FIRST_WAVE_CATALOG
// fixtures the admin route and the regression scripts already use. It is
// not a fake preview implementation -- it is the real engine
// (matchProfessionsDiagnostics) and the real report components, only the
// admin-authenticated data-fetching wrapper is swapped for a direct,
// client-side pure-function call plus the same public getProfessionDetails
// server function candidate reports already call unauthenticated.
//
// Hard-gated to dev builds only: renders nothing in a production bundle,
// so this can never become a second, unauthenticated way to preview
// unapproved profession content live. approved_for_ranking is never read
// or written here.

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CareerCardCreator } from "@/components/career-discovery/v31/CareerCardCreator";
import { MoveForwardSection } from "@/components/career-discovery/v31/MoveForwardSection";
import { PossiblePathway } from "@/components/career-discovery/v31/PossiblePathway";
import { ProfessionRecommendations } from "@/components/career-discovery/v31/ProfessionRecommendations";
import { DIMENSION_IDS, DIMENSIONS, type DimensionId } from "@/lib/career-discovery/v31/dimensions";
import { GOLDEN_PERSONAS } from "@/lib/career-discovery/v31/golden-persona-fixtures";
import { matchProfessionsDiagnostics } from "@/lib/career-discovery/v31/professions";
import type { Confidence, DimensionResult } from "@/lib/career-discovery/v31/scoring";
import type { ExperienceBand } from "@/lib/career-discovery/career-context";
// eslint-disable-next-line no-restricted-imports -- dev-only fixture harness, see file header
import { FIRST_WAVE_CATALOG } from "../../scripts/fixtures/first-wave-profession-catalog";

export const Route = createFileRoute("/dev/career-discovery-preview")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: import.meta.env.DEV ? DevCareerDiscoveryPreview : ProdGuard,
});

function ProdGuard() {
  return null;
}

function makeDims(scores: Partial<Record<DimensionId, number>>): DimensionResult {
  const dimensions = Object.fromEntries(
    DIMENSION_IDS.map((id) => {
      const value = scores[id] ?? null;
      return [
        id,
        {
          dimension: id,
          score: value,
          evidenceWeight: value === null ? 0 : 1.5,
          dominance: value === null ? null : 0.3,
          coverage: value === null ? 0 : 1,
          confidence: (value === null ? "none" : "high") as Confidence,
          sources: value === null ? [] : ["fixture"],
          tertiaryOnly: false,
        },
      ];
    }),
  ) as unknown as DimensionResult["dimensions"];
  return { scoringVersion: "dev-preview", dimensions, answeredItems: [], complete: true };
}

const CIG_TITLES: Record<string, { sv: string; en: string }> = Object.fromEntries(
  FIRST_WAVE_CATALOG.map((p) => [p.cigProfessionSlug, { sv: p.titleSv, en: p.titleEn }]),
);

function DevCareerDiscoveryPreview() {
  const [personaId, setPersonaId] = useState(GOLDEN_PERSONAS[0].id);
  const [previewLocale, setPreviewLocale] = useState<"sv" | "en">("sv");
  const [experienceBand, setExperienceBand] = useState<ExperienceBand | "">("");
  const [cardOpen, setCardOpen] = useState(false);

  const persona = GOLDEN_PERSONAS.find((p) => p.id === personaId) ?? GOLDEN_PERSONAS[0];
  const dims = makeDims(persona.dims);
  const diagnostics = matchProfessionsDiagnostics(
    dims,
    FIRST_WAVE_CATALOG,
    persona.contextStatus,
    persona.currentProfessionCigSlug ?? null,
    [],
    new Set(),
    experienceBand || null,
  );
  const matches = diagnostics.result;
  const currentTitle = persona.currentProfessionCigSlug
    ? CIG_TITLES[persona.currentProfessionCigSlug]
    : undefined;
  // The card reads only these three fields (CardDimensionScore). Built from
  // the persona's own scores rather than a fabricated snapshot — this is a
  // preview harness, and CID15 is excluded here exactly as the real
  // snapshot's `usedForMatching` excludes it (owner decision A-4).
  const previewDimensions = DIMENSION_IDS.map((id) => ({
    id,
    score: persona.dims[id] ?? null,
    usedForMatching: DIMENSIONS[id].matchingWeight === 1,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Dev-only visual verification harness — never deployed</p>
        <p className="mt-1">
          Real production components + real matchProfessionsDiagnostics against
          FIRST_WAVE_CATALOG and GOLDEN_PERSONAS. No auth, no Supabase writes,
          approved_for_ranking untouched. Renders nothing when import.meta.env.DEV is false.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-6 rounded-xl border border-border bg-card p-5">
        <div>
          <label htmlFor="dp-persona" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Golden persona
          </label>
          <select
            id="dp-persona"
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            className="mt-2 block h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            {GOLDEN_PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name.en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Locale</span>
          <div className="mt-2 flex gap-2">
            {(["sv", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setPreviewLocale(l)}
                className={`h-10 rounded-md border px-4 text-sm font-medium ${previewLocale === l ? "border-accent bg-accent/10 text-accent" : "border-border"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="dp-exp" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Experience
          </label>
          <select
            id="dp-exp"
            value={experienceBand}
            onChange={(e) => setExperienceBand(e.target.value as ExperienceBand | "")}
            className="mt-2 block h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">(unset)</option>
            <option value="under_1y">Under 1 year</option>
            <option value="1_3y">1-3 years</option>
            <option value="4_7y">4-7 years</option>
            <option value="8_plus_y">8+ years</option>
          </select>
        </div>
      </div>

      {currentTitle && (
        <div className="mt-8 flex gap-4 rounded-xl border border-accent/25 bg-card p-5">
          <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-full bg-accent ring-4 ring-accent/15" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              {previewLocale === "sv" ? "DU ÄR HÄR" : "YOU ARE HERE"}
            </p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {previewLocale === "sv" ? currentTitle.sv : currentTitle.en}
            </p>
          </div>
        </div>
      )}

      {matches.available ? (
        <div className="mt-8">
          <ProfessionRecommendations
            strongestDirections={matches.strongestDirections}
            alsoWorthExploring={matches.alsoWorthExploring}
            longerTermPossibilities={matches.longerTermPossibilities}
            careerPivots={matches.careerPivots}
            currentProfessionMatch={matches.currentProfessionMatch}
            locale={previewLocale}
          />
          <PossiblePathway
            snapshot={{
              professions: { ...matches, available: true },
              currentProfession: currentTitle
                ? {
                    cigSlug: persona.currentProfessionCigSlug!,
                    titleSv: currentTitle.sv,
                    titleEn: currentTitle.en,
                  }
                : null,
            }}
            locale={previewLocale}
          />
          <MoveForwardSection
            matches={matches.strongestDirections.length > 0 ? matches.strongestDirections : matches.matches}
            locale={previewLocale}
          />
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">
          No matches cleared for this persona (insufficient coverage or fit).
        </p>
      )}

      {matches.ranked.length > 0 && (
        <CareerCardCreator
          open={cardOpen}
          onOpenChange={setCardOpen}
          ranked={matches.ranked}
          dimensions={previewDimensions}
          locale={previewLocale}
          definitionVersion="dev-preview"
          generatedAt={new Date().toISOString()}
        />
      )}
    </div>
  );
}
