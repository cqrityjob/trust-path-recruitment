import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { pickText } from "@/lib/assessment-content";
import {
  currentStatusOptions,
  yearsOfExperienceOptions,
} from "@/lib/security-career-profile/options";
import {
  listCurrentProfessionOptions,
  type CurrentProfessionOption,
} from "@/lib/security-career-profile/profession-options";
import {
  isAlreadyWorkingInSecurity,
  type SecurityCareerProfileDraft,
} from "@/lib/security-career-profile/types";

const OTHER_PROFESSION_VALUE = "__other__";

function OptionGroup<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: readonly { id: T; label: { sv: string; en: string } }[];
  selected: T | null;
  onSelect: (id: T) => void;
}) {
  const { lang } = useT();
  return (
    <div className="grid grid-cols-1 gap-3">
      {options.map((o) => {
        const isSelected = selected === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            className={cn(
              "flex w-full items-center justify-between rounded-md border bg-background px-5 py-4 text-left text-sm transition-colors",
              isSelected
                ? "border-accent bg-accent/5 text-foreground"
                : "border-border text-foreground hover:border-accent/60 hover:bg-muted/50",
            )}
            aria-pressed={isSelected}
          >
            <span>{pickText(o.label, lang)}</span>
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border",
                isSelected ? "border-accent bg-accent text-accent-foreground" : "border-border",
              )}
            >
              {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shared editable form for the Security Career Profile — used by the
 * pre-assessment ProfileStep and the /my-career editable card. Purely
 * presentational + local fetch of profession options; the caller owns
 * persistence (or the lack of it, for anonymous users).
 */
export function SecurityCareerProfileForm({
  value,
  onChange,
}: {
  value: SecurityCareerProfileDraft;
  onChange: (next: SecurityCareerProfileDraft) => void;
}) {
  const { t, lang } = useT();
  const [professionOptions, setProfessionOptions] = useState<CurrentProfessionOption[]>([]);
  const showFollowUps = isAlreadyWorkingInSecurity(value.currentStatus);

  useEffect(() => {
    if (!showFollowUps || professionOptions.length > 0) return;
    let cancelled = false;
    listCurrentProfessionOptions()
      .then((opts) => {
        if (!cancelled) setProfessionOptions(opts);
      })
      .catch(() => {
        // Best-effort only — the "Other" option always remains available.
      });
    return () => {
      cancelled = true;
    };
  }, [showFollowUps, professionOptions.length]);

  const professionSelectValue =
    value.currentProfessionOther != null
      ? OTHER_PROFESSION_VALUE
      : (value.currentProfessionSlug ?? "");

  return (
    <div className="space-y-10">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-accent">
          {t("sca.scp.status.title")}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{t("sca.scp.status.body")}</p>
        <div className="mt-5">
          <OptionGroup
            options={currentStatusOptions}
            selected={value.currentStatus}
            onSelect={(id) =>
              onChange({
                ...value,
                currentStatus: id,
                // Clear follow-ups when the new status no longer needs them.
                ...(isAlreadyWorkingInSecurity(id)
                  ? {}
                  : {
                      currentProfessionSlug: null,
                      currentProfessionOther: null,
                      yearsOfExperience: null,
                    }),
              })
            }
          />
        </div>
      </div>

      {showFollowUps && (
        <>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-accent">
              {t("sca.scp.profession.title")}
            </h3>
            <div className="mt-5">
              <select
                value={professionSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === OTHER_PROFESSION_VALUE) {
                    onChange({ ...value, currentProfessionSlug: null, currentProfessionOther: "" });
                  } else {
                    onChange({
                      ...value,
                      currentProfessionSlug: v || null,
                      currentProfessionOther: null,
                    });
                  }
                }}
                className="h-11 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground"
              >
                <option value="">{t("sca.scp.profession.placeholder")}</option>
                {professionOptions.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {lang === "sv" ? p.title_sv : p.title_en}
                  </option>
                ))}
                <option value={OTHER_PROFESSION_VALUE}>{t("sca.scp.profession.other")}</option>
              </select>
              {value.currentProfessionOther != null && (
                <input
                  type="text"
                  maxLength={120}
                  value={value.currentProfessionOther}
                  onChange={(e) => onChange({ ...value, currentProfessionOther: e.target.value })}
                  placeholder={t("sca.scp.profession.otherPlaceholder")}
                  className="mt-3 h-11 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground"
                />
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-accent">
              {t("sca.scp.experience.title")}
            </h3>
            <div className="mt-5">
              <OptionGroup
                options={yearsOfExperienceOptions}
                selected={value.yearsOfExperience}
                onSelect={(id) => onChange({ ...value, yearsOfExperience: id })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
