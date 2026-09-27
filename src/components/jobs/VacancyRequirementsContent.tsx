import { useT } from "@/i18n/context";

export type VacancyRequirementPresentation = {
  id?: string;
  key?: string;
  kind: "mandatory" | "desirable";
  label_sv: string | null;
  label_en: string | null;
};

/** The same saved or unsaved employer requirements in the public ad and preview. */
export function VacancyRequirementsContent({
  requirements,
}: {
  requirements: readonly VacancyRequirementPresentation[];
}) {
  const { t, lang } = useT();
  const reqs = requirements.filter((r) => (r.label_sv || r.label_en || "").trim());
  if (reqs.length === 0) return null;
  const label = (r: { label_sv: string | null; label_en: string | null }) =>
    (lang === "en" ? r.label_en || r.label_sv : r.label_sv || r.label_en) ?? "";
  const groups: [
    "mandatory" | "desirable",
    "rec.requirement.mandatoryPlural" | "rec.requirement.desirablePlural",
  ][] = [
    ["mandatory", "rec.requirement.mandatoryPlural"],
    ["desirable", "rec.requirement.desirablePlural"],
  ];
  return (
    <section className="rounded-lg border border-border bg-background p-5">
      <h2 className="text-xl font-semibold">{t("rec.vacancy.requirementsHeading")}</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {groups.map(([kind, key]) => {
          const rows = reqs.filter((r) => r.kind === kind);
          if (rows.length === 0) return null;
          return (
            <div key={kind}>
              <h3 className="text-sm font-semibold">{t(key)}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {rows.map((r, index) => (
                  <li key={r.id ?? r.key ?? index}>{label(r)}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
