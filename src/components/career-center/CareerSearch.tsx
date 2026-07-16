import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  categories,
  experienceLevels,
  professionFamilies,
  L,
  type CategoryId,
  type ExperienceLevel,
  type ProfessionFamilyId,
  type Sector,
  type Orientation,
  type Region,
} from "@/lib/career-center";
import type { TranslationKey } from "@/i18n/dictionaries";

export type CareerSearchFilters = {
  query: string;
  family: ProfessionFamilyId | "all";
  category: CategoryId | "all";
  level: ExperienceLevel | "all";
  regulated: "regulated" | "not_regulated" | "all";
  sector: Sector | "all";
  orientation: Orientation | "all";
  region: Region | "all";
};

export function CareerSearch({
  value,
  onChange,
}: {
  value: CareerSearchFilters;
  onChange: (next: CareerSearchFilters) => void;
}) {
  const { t, lang } = useT();
  const families = professionFamilies.filter((f) => !f.isEntryPath);
  const orientations: { id: Orientation; key: TranslationKey }[] = [
    { id: "operational", key: "cc.orientation.operational" },
    { id: "technical", key: "cc.orientation.technical" },
    { id: "analytical", key: "cc.orientation.analytical" },
    { id: "leadership", key: "cc.orientation.leadership" },
  ];
  const sectors: { id: Sector; key: TranslationKey }[] = [
    { id: "public", key: "cc.sector.public" },
    { id: "private", key: "cc.sector.private" },
    { id: "hybrid", key: "cc.sector.hybrid" },
  ];
  const regions: Region[] = ["SE", "NORDICS", "EU", "UK", "US", "INTL"];
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <label className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        <input
          type="search"
          placeholder={t("cc.search.placeholder")}
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </label>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <FilterGroup label={t("cc.search.family")}>
          <FilterChip active={value.family === "all"} onClick={() => onChange({ ...value, family: "all" })} label={t("cc.search.all")} />
          {families.map((f) => (
            <FilterChip key={f.id} active={value.family === f.id} onClick={() => onChange({ ...value, family: f.id })} label={L(f.name, lang)} />
          ))}
        </FilterGroup>
        <FilterGroup label={t("cc.search.category")}>
          <FilterChip active={value.category === "all"} onClick={() => onChange({ ...value, category: "all" })} label={t("cc.search.all")} />
          {categories.map((c) => (
            <FilterChip key={c.id} active={value.category === c.id} onClick={() => onChange({ ...value, category: c.id })} label={L(c.name, lang)} />
          ))}
        </FilterGroup>
        <FilterGroup label={t("cc.search.level")}>
          <FilterChip active={value.level === "all"} onClick={() => onChange({ ...value, level: "all" })} label={t("cc.search.all")} />
          {experienceLevels.map((l) => (
            <FilterChip key={l.id} active={value.level === l.id} onClick={() => onChange({ ...value, level: l.id })} label={L(l.name, lang)} />
          ))}
        </FilterGroup>
        <FilterGroup label={t("cc.search.regulated")}>
          <FilterChip active={value.regulated === "all"} onClick={() => onChange({ ...value, regulated: "all" })} label={t("cc.search.all")} />
          <FilterChip active={value.regulated === "regulated"} onClick={() => onChange({ ...value, regulated: "regulated" })} label={t("cc.search.regulated.regulated")} />
          <FilterChip active={value.regulated === "not_regulated"} onClick={() => onChange({ ...value, regulated: "not_regulated" })} label={t("cc.search.regulated.not_regulated")} />
        </FilterGroup>
        <FilterGroup label={t("cc.search.sector")}>
          <FilterChip active={value.sector === "all"} onClick={() => onChange({ ...value, sector: "all" })} label={t("cc.search.all")} />
          {sectors.map((s) => (
            <FilterChip key={s.id} active={value.sector === s.id} onClick={() => onChange({ ...value, sector: s.id })} label={t(s.key)} />
          ))}
        </FilterGroup>
        <FilterGroup label={t("cc.search.orientation")}>
          <FilterChip active={value.orientation === "all"} onClick={() => onChange({ ...value, orientation: "all" })} label={t("cc.search.all")} />
          {orientations.map((o) => (
            <FilterChip key={o.id} active={value.orientation === o.id} onClick={() => onChange({ ...value, orientation: o.id })} label={t(o.key)} />
          ))}
        </FilterGroup>
        <FilterGroup label={t("cc.search.region")}>
          <FilterChip active={value.region === "all"} onClick={() => onChange({ ...value, region: "all" })} label={t("cc.search.all")} />
          {regions.map((r) => (
            <FilterChip key={r} active={value.region === r} onClick={() => onChange({ ...value, region: r })} label={r} />
          ))}
        </FilterGroup>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}