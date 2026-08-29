import { useEffect, useId, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  ADVANCED_FILTER_KEYS,
  COUNTRY_FILTER_AVAILABLE,
  L,
  REGULATED_FILTER_AVAILABLE,
  availableCountries,
  availableFamilies,
  availableLevels,
  availableOrientations,
  availableSectors,
  clearAllFilters,
  getFamily,
  hasActiveFilters,
  icon,
  metaGroups,
  selectedLevels,
  toggleLevel,
  withoutFilter,
  type ExplorerSearch,
  type FilterKey,
  type Profession,
  type Region,
  type Relaxation,
} from "@/lib/career-center";
import { ProfessionCard } from "./ProfessionCard";

// The single profession-discovery surface for the Career Center.
//
// It replaces four overlapping sections that all did some of this job:
// "Utvalda yrken" (the first six of the array, unexplained), "Bläddra efter
// kategori" (a twelve-tile grid that secretly drove a filter three sections
// further down), "Hitta rätt roll" (search plus seven filter groups, all
// expanded, all the time) and "Yrkesfamiljer" (fourteen non-interactive
// cards restating a taxonomy the reader had already been filtered by). A
// visitor scrolled past the same twenty professions three times in three
// different arrangements.
//
// ── STATE LIVES IN THE URL ─────────────────────────────────────────────
//
// Every control writes through `onSearchChange`, which the route turns into
// `navigate({ search })`. Nothing here holds filter state except the search
// box's uncommitted text, which is synchronised FROM the URL so a link, a
// back button or a chip removal all land in a coherent view.

export function ProfessionExplorer({
  search,
  onSearchChange,
  results,
  relaxation,
  upcoming,
  onProfessionOpen,
}: {
  search: ExplorerSearch;
  onSearchChange: (next: ExplorerSearch) => void;
  results: readonly Profession[];
  /** The nearest wider search that returns something. Only consulted when
   *  `results` is empty. */
  relaxation: Relaxation | null;
  /** Professions with no published guide. Rendered as plain text — named so
   *  a reader knows the role exists, never carded, linked or badged. */
  upcoming: readonly Profession[];
  onProfessionOpen?: (slug: string) => void;
}) {
  const { t, tp, lang } = useT();
  const searchInputId = useId();
  const advancedPanelId = useId();
  const [queryDraft, setQueryDraft] = useState(search.q ?? "");

  // The URL is the source of truth: a chip removal, a shared link or the back
  // button must all be reflected in the box the reader is looking at.
  useEffect(() => {
    setQueryDraft(search.q ?? "");
  }, [search.q]);

  const showAdvanced = search.more === true;
  const levels = selectedLevels(search);
  const active = hasActiveFilters(search);

  const submitQuery = (event: React.FormEvent) => {
    event.preventDefault();
    const q = queryDraft.trim();
    onSearchChange(q ? { ...search, q } : withoutFilter(search, "q"));
  };

  return (
    <div>
      {/* ── Search ─────────────────────────────────────────────────── */}
      <form onSubmit={submitQuery} role="search" aria-labelledby={`${searchInputId}-label`}>
        <label
          id={`${searchInputId}-label`}
          htmlFor={searchInputId}
          className="block text-sm font-medium text-foreground"
        >
          {t("cc.explore.search.label")}
        </label>
        <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-ring/40">
          <Search
            className="h-4 w-4 flex-shrink-0 text-muted-foreground"
            strokeWidth={2}
            aria-hidden
          />
          <input
            id={searchInputId}
            type="search"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            // Committing on blur as well as submit means a reader who types
            // and then reaches straight for a filter does not silently lose
            // what they typed.
            onBlur={submitQuery}
            placeholder={t("cc.explore.search.placeholder")}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </form>

      {/* ── Two primary filters ────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FilterGroup label={t("cc.explore.filter.family")}>
          <Chip
            selected={search.family === undefined}
            onClick={() => onSearchChange(withoutFilter(search, "family"))}
            label={t("cc.explore.filter.all")}
          />
          {/* Grouped under four headings so fourteen families do not arrive as
              one wall of chips. Only families with a published guide are
              offered, and a group left with none disappears entirely. */}
          {metaGroups.map((group) => {
            const families = group.families.filter((id) => availableFamilies.includes(id));
            if (families.length === 0) return null;
            return (
              <div key={group.id} className="mt-2 w-full">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                  {L(group.name, lang)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {families.map((familyId) => {
                    const family = getFamily(familyId);
                    if (!family) return null;
                    return (
                      <Chip
                        key={familyId}
                        selected={search.family === familyId}
                        onClick={() =>
                          onSearchChange(
                            search.family === familyId
                              ? withoutFilter(search, "family")
                              : { ...search, family: familyId },
                          )
                        }
                        label={L(family.name, lang)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </FilterGroup>

        <FilterGroup label={t("cc.explore.filter.level")}>
          <Chip
            selected={levels.length === 0}
            onClick={() => onSearchChange(withoutFilter(search, "level"))}
            label={t("cc.explore.filter.all")}
          />
          {availableLevels.map((level) => (
            <Chip
              key={level}
              selected={levels.includes(level)}
              onClick={() => onSearchChange(toggleLevel(search, level))}
              label={t(`cc.level.${level}` as TranslationKey)}
            />
          ))}
        </FilterGroup>
      </div>

      {/* ── Advanced filters ───────────────────────────────────────── */}
      <div className="mt-6">
        <button
          type="button"
          aria-expanded={showAdvanced}
          aria-controls={advancedPanelId}
          onClick={() =>
            onSearchChange(
              showAdvanced
                ? (Object.fromEntries(
                    Object.entries(search).filter(([k]) => k !== "more"),
                  ) as ExplorerSearch)
                : { ...search, more: true },
            )
          }
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-accent transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {showAdvanced ? t("cc.explore.filter.less") : t("cc.explore.filter.more")}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        <div id={advancedPanelId} hidden={!showAdvanced}>
          <div className="mt-5 grid grid-cols-1 gap-6 rounded-lg border border-border bg-background p-5 sm:grid-cols-2">
            {REGULATED_FILTER_AVAILABLE && (
              <FilterGroup label={t("cc.explore.filter.regulated")}>
                <Chip
                  selected={search.regulated === undefined}
                  onClick={() => onSearchChange(withoutFilter(search, "regulated"))}
                  label={t("cc.explore.filter.all")}
                />
                <Chip
                  selected={search.regulated === "regulated"}
                  onClick={() => onSearchChange({ ...search, regulated: "regulated", more: true })}
                  label={t("cc.regulated.regulated")}
                />
                <Chip
                  selected={search.regulated === "not_regulated"}
                  onClick={() =>
                    onSearchChange({ ...search, regulated: "not_regulated", more: true })
                  }
                  label={t("cc.regulated.not_regulated")}
                />
              </FilterGroup>
            )}

            <FilterGroup label={t("cc.explore.filter.sector")}>
              <Chip
                selected={search.sector === undefined}
                onClick={() => onSearchChange(withoutFilter(search, "sector"))}
                label={t("cc.explore.filter.all")}
              />
              {availableSectors.map((sector) => (
                <Chip
                  key={sector}
                  selected={search.sector === sector}
                  onClick={() => onSearchChange({ ...search, sector, more: true })}
                  label={t(`cc.sector.${sector}` as TranslationKey)}
                />
              ))}
            </FilterGroup>

            <FilterGroup label={t("cc.explore.filter.orientation")}>
              <Chip
                selected={search.orientation === undefined}
                onClick={() => onSearchChange(withoutFilter(search, "orientation"))}
                label={t("cc.explore.filter.all")}
              />
              {availableOrientations.map((orientation) => (
                <Chip
                  key={orientation}
                  selected={search.orientation === orientation}
                  onClick={() => onSearchChange({ ...search, orientation, more: true })}
                  label={t(`cc.orientation.${orientation}` as TranslationKey)}
                />
              ))}
            </FilterGroup>

            {/* Country is offered ONLY when more than one jurisdiction has
                published content — a filter that cannot change the result is
                a control that wastes a reader's attention. */}
            {COUNTRY_FILTER_AVAILABLE && (
              <FilterGroup label={t("cc.explore.filter.country")}>
                <Chip
                  selected={search.country === undefined}
                  onClick={() => onSearchChange(withoutFilter(search, "country"))}
                  label={t("cc.explore.filter.all")}
                />
                {availableCountries.map((country) => (
                  <Chip
                    key={country}
                    selected={search.country === country}
                    onClick={() => onSearchChange({ ...search, country, more: true })}
                    label={country}
                  />
                ))}
              </FilterGroup>
            )}
          </div>
        </div>
      </div>

      {/* ── Result count + active filter chips ─────────────────────── */}
      <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-start sm:justify-between">
        <p
          // Announced rather than merely rendered: filtering happens without
          // any navigation, so a screen-reader user gets no other signal that
          // the list under the controls has changed.
          aria-live="polite"
          aria-atomic="true"
          className="text-sm font-medium text-foreground"
        >
          <span className="tabular-nums">{results.length}</span>{" "}
          {tp("cc.explore.count", results.length)}
        </p>

        {active && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="sr-only">{t("cc.explore.active_filters")}</span>
            {search.q && (
              <ActiveChip
                label={`”${search.q}”`}
                removeLabel={t("cc.explore.remove_filter")}
                onRemove={() => onSearchChange(withoutFilter(search, "q"))}
              />
            )}
            {levels.map((level) => (
              <ActiveChip
                key={level}
                label={t(`cc.level.${level}` as TranslationKey)}
                removeLabel={t("cc.explore.remove_filter")}
                onRemove={() => onSearchChange(toggleLevel(search, level))}
              />
            ))}
            {search.family && (
              <ActiveChip
                label={L(getFamily(search.family)?.name ?? { sv: "", en: "" }, lang)}
                removeLabel={t("cc.explore.remove_filter")}
                onRemove={() => onSearchChange(withoutFilter(search, "family"))}
              />
            )}
            {ADVANCED_FILTER_KEYS.filter((key) => search[key] !== undefined).map((key) => (
              <ActiveChip
                key={key}
                label={advancedChipLabel(key, search, t)}
                removeLabel={t("cc.explore.remove_filter")}
                onRemove={() => onSearchChange(withoutFilter(search, key))}
              />
            ))}
            <button
              type="button"
              onClick={() => onSearchChange(clearAllFilters(search))}
              className="rounded-md px-2 py-1 text-sm font-semibold text-accent underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("cc.explore.clear_all")}
            </button>
          </div>
        )}
      </div>

      {/* ── Results ────────────────────────────────────────────────── */}
      <div className="mt-8">
        {results.length === 0 ? (
          <ZeroResults search={search} relaxation={relaxation} onSearchChange={onSearchChange} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <li key={p.slug}>
                <ProfessionCard
                  slug={p.slug}
                  title={lang === "sv" ? p.titleSv : p.titleEn}
                  description={L(p.description, lang)}
                  icon={icon(p.icon)}
                  level={t(`cc.level.${p.level}` as TranslationKey)}
                  onOpen={onProfessionOpen}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── "Kommer" — text only, never a card, never a link ────────── */}
      {upcoming.length > 0 && (
        <div className="mt-10 rounded-lg border border-border bg-secondary/40 p-6">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("cc.explore.upcoming.title")}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("cc.explore.upcoming.body")}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {upcoming.map((p) => (lang === "sv" ? p.titleSv : p.titleEn)).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}

function ZeroResults({
  search,
  relaxation,
  onSearchChange,
}: {
  search: ExplorerSearch;
  relaxation: Relaxation | null;
  onSearchChange: (next: ExplorerSearch) => void;
}) {
  const { t, tp } = useT();
  return (
    <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
      <p className="text-base font-medium text-foreground">{t("cc.explore.empty.title")}</p>
      {relaxation && (
        <>
          <p className="mt-3 text-sm text-muted-foreground">{t("cc.explore.empty.body")}</p>
          <button
            type="button"
            onClick={() => onSearchChange(relaxation.search)}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-accent/40 bg-accent/10 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t(`cc.explore.relax.${relaxation.dropped}` as TranslationKey)}
            {" — "}
            <span className="tabular-nums">{relaxation.count}</span>
            <span className="ml-1">{tp("cc.explore.count", relaxation.count)}</span>
          </button>
        </>
      )}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => onSearchChange(clearAllFilters(search))}
          className="text-sm font-semibold text-accent underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {t("cc.explore.clear_filters")}
        </button>
      </div>
    </div>
  );
}

function advancedChipLabel(
  key: FilterKey,
  search: ExplorerSearch,
  t: (k: TranslationKey) => string,
): string {
  switch (key) {
    case "regulated":
      return t(`cc.regulated.${search.regulated}` as TranslationKey);
    case "sector":
      return t(`cc.sector.${search.sector}` as TranslationKey);
    case "orientation":
      return t(`cc.orientation.${search.orientation}` as TranslationKey);
    case "country":
      return (search.country as Region) ?? "";
    default:
      return "";
  }
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </legend>
      <div className="mt-3 flex flex-wrap items-start gap-2">{children}</div>
    </fieldset>
  );
}

/** `aria-pressed` rather than colour alone: the selected state of a filter is
 *  information, and a toggle button is what these actually are. */
function Chip({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-accent bg-accent/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function ActiveChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {label}
      <X className="h-3 w-3" aria-hidden />
      <span className="sr-only">{removeLabel}</span>
    </button>
  );
}
