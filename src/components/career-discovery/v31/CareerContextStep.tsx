// Minimal current-career-context step (Master Completion Mandate item 2).
//
// Shown once, between the 26th question and the report, ONLY for a
// candidate whose C1 answer means they already work in security in some
// capacity (see shouldCollectCareerContext). Two lightweight questions:
// current profession (searchable, canonical CIG data) and experience band.
// Both are skippable — "not listed" and "prefer not to say" are real
// answers, not dead ends — because this is contextual self-report, not a
// second assessment.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Search } from "lucide-react";
import { useT } from "@/i18n/context";
import { CURRENT_PROFESSION_OTHER_MAX } from "@/lib/career-discovery/career-context";
import { AssessmentCard } from "@/components/career-discovery/v31/shell/QuestionCard";
import {
  EXPERIENCE_BAND_LABEL,
  EXPERIENCE_BAND_VALUES,
  type CareerContext,
  type ExperienceBand,
} from "@/lib/career-discovery/career-context";
import { listCigProfessionsForPicker } from "@/lib/career-discovery/career-context.functions";

export function CareerContextStep({
  value,
  onChange,
  onContinue,
  locale,
}: {
  value: CareerContext;
  onChange: (next: CareerContext) => void;
  onContinue: () => void;
  locale: "sv" | "en";
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");

  const load = useServerFn(listCigProfessionsForPicker);
  const professionsQuery = useQuery({
    queryKey: ["v31", "cig-professions-picker"],
    queryFn: () => load({}),
    staleTime: 10 * 60 * 1000,
  });

  const selectedProfession = useMemo(
    () =>
      value.currentProfessionStatus === "selected"
        ? (professionsQuery.data ?? []).find((p) => p.slug === value.currentProfessionSlug)
        : undefined,
    [professionsQuery.data, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = professionsQuery.data ?? [];
    if (!q) return all.slice(0, 8);
    return all
      .filter((p) => (locale === "sv" ? p.titleSv : p.titleEn).toLowerCase().includes(q))
      .slice(0, 8);
  }, [professionsQuery.data, query, locale]);

  const roleAnswered = value.currentProfessionStatus !== null;

  return (
    <AssessmentCard className="px-5 py-7 sm:px-8 sm:py-9">
      <h1
        className="text-[1.25rem] font-semibold leading-snug tracking-tight text-foreground sm:text-[1.4375rem]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t("cd.careerContext.title")}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t("cd.careerContext.body")}
      </p>

      {/* Current role */}
      <div className="mt-7">
        <label
          htmlFor="career-context-role-search"
          className="text-sm font-semibold text-foreground"
        >
          {t("cd.careerContext.roleLabel")}
        </label>

        {value.currentProfessionStatus === "selected" && selectedProfession ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-accent bg-[color:var(--secondary)] px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              {locale === "sv" ? selectedProfession.titleSv : selectedProfession.titleEn}
            </span>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  currentProfessionStatus: null,
                  currentProfessionSlug: null,
                  currentProfessionOther: null,
                  currentProfessionTitleSv: null,
                  currentProfessionTitleEn: null,
                })
              }
              className="shrink-0 text-xs font-medium text-accent underline-offset-4 hover:underline"
            >
              {t("cd.careerContext.changeRole")}
            </button>
          </div>
        ) : value.currentProfessionStatus === "not_listed" ||
          value.currentProfessionStatus === "prefer_not_to_say" ? (
          <div className="mt-3 rounded-[12px] border border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">
              {value.currentProfessionStatus === "not_listed"
                ? t("cd.careerContext.roleNotListed")
                : t("cd.careerContext.roleSkip")}
            </span>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  currentProfessionStatus: null,
                  currentProfessionSlug: null,
                  currentProfessionOther: null,
                  currentProfessionTitleSv: null,
                  currentProfessionTitleEn: null,
                })
              }
              className="shrink-0 text-xs font-medium text-accent underline-offset-4 hover:underline"
            >
              {t("cd.careerContext.changeRole")}
            </button>
            </div>

            {/* ── SAY WHAT THE JOB ACTUALLY IS ──────────────────────────
                Telling the product its catalogue is missing your job, and
                then having nowhere to say what the job is, is a control that
                looks like it works and loses the answer. Optional, bounded,
                and explicitly NOT canonical: it is stored as free text on the
                session, never joined to the profession catalogue and never
                used for matching — see career-context.ts and migration
                20260913091000. */}
            {value.currentProfessionStatus === "not_listed" && (
              <div className="mt-3">
                <label
                  htmlFor="career-context-role-other"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  {t("cd.careerContext.roleOtherLabel")}
                </label>
                <input
                  id="career-context-role-other"
                  type="text"
                  maxLength={CURRENT_PROFESSION_OTHER_MAX}
                  value={value.currentProfessionOther ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      currentProfessionOther:
                        e.target.value.slice(0, CURRENT_PROFESSION_OTHER_MAX) || null,
                    })
                  }
                  placeholder={t("cd.careerContext.roleOtherPlaceholder")}
                  className="mt-1.5 h-11 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("cd.careerContext.roleOtherNote")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="career-context-role-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("cd.careerContext.roleSearchPlaceholder")}
                className="h-11 w-full rounded-[10px] border border-border bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </div>

            {filtered.length > 0 && (
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {filtered.map((p) => (
                  <li key={p.slug}>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...value,
                          currentProfessionStatus: "selected",
                          currentProfessionSlug: p.slug,
                          currentProfessionOther: null,
                          // Real-world defect fix: captured here, at
                          // selection time, from the picker's own already-
                          // fetched list -- no extra query needed. Without
                          // this, the anonymous client-computed report can
                          // never resolve a title, so "YOU ARE HERE" can
                          // never render for it (see career-context.ts).
                          currentProfessionTitleSv: p.titleSv,
                          currentProfessionTitleEn: p.titleEn,
                        })
                      }
                      className="flex w-full items-center rounded-[10px] border border-transparent px-3.5 py-2.5 text-left text-sm text-foreground transition-colors hover:border-border hover:bg-muted/50"
                    >
                      {locale === "sv" ? p.titleSv : p.titleEn}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    currentProfessionStatus: "not_listed",
                    currentProfessionSlug: null,
                    currentProfessionTitleSv: null,
                    currentProfessionTitleEn: null,
                  })
                }
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("cd.careerContext.roleNotListed")}
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    currentProfessionStatus: "prefer_not_to_say",
                    currentProfessionSlug: null,
                    currentProfessionOther: null,
                    currentProfessionTitleSv: null,
                    currentProfessionTitleEn: null,
                  })
                }
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("cd.careerContext.roleSkip")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Experience band */}
      <div className="mt-7">
        <p className="text-sm font-semibold text-foreground">
          {t("cd.careerContext.experienceLabel")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {EXPERIENCE_BAND_VALUES.map((band: ExperienceBand) => (
            <button
              key={band}
              type="button"
              aria-pressed={value.experienceBand === band}
              onClick={() => onChange({ ...value, experienceBand: band })}
              className={`h-10 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                value.experienceBand === band
                  ? "border-accent bg-[color:var(--secondary)] text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground"
              }`}
            >
              {EXPERIENCE_BAND_LABEL[band][locale]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!roleAnswered}
        onClick={onContinue}
        className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto motion-reduce:transition-none"
      >
        {t("cd.careerContext.continue")}
      </button>
    </AssessmentCard>
  );
}
