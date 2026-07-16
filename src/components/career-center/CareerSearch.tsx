import { Search } from "lucide-react";
import { useT } from "@/i18n/context";
import { categories, experienceLevels, type CategoryId, type ExperienceLevel, L } from "@/lib/career-center";

export type CareerSearchFilters = {
  query: string;
  category: CategoryId | "all";
  level: ExperienceLevel | "all";
};

export function CareerSearch({
  value,
  onChange,
}: {
  value: CareerSearchFilters;
  onChange: (next: CareerSearchFilters) => void;
}) {
  const { t, lang } = useT();
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
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("cc.search.category")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterChip
              active={value.category === "all"}
              onClick={() => onChange({ ...value, category: "all" })}
              label={t("cc.search.all")}
            />
            {categories.map((c) => (
              <FilterChip
                key={c.id}
                active={value.category === c.id}
                onClick={() => onChange({ ...value, category: c.id })}
                label={L(c.name, lang)}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("cc.search.level")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterChip
              active={value.level === "all"}
              onClick={() => onChange({ ...value, level: "all" })}
              label={t("cc.search.all")}
            />
            {experienceLevels.map((l) => (
              <FilterChip
                key={l.id}
                active={value.level === l.id}
                onClick={() => onChange({ ...value, level: l.id })}
                label={L(l.name, lang)}
              />
            ))}
          </div>
        </div>
      </div>
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
