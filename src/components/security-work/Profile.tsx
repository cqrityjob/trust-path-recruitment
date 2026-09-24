import { saveProfileInput } from "@/lib/security-work/inputs";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  saveSecurityProfile,
  saveSecurityWorkspace,
} from "@/lib/security-work/security-work.functions";
import type { SaveProfileInput, SaveWorkspaceInput } from "@/lib/security-work/inputs";
import { useT } from "@/i18n/context";
import { useSecurityWorkspace, useWorkMutation } from "./context";
import {
  Field,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  panelClass,
  selectClass,
  splitLines,
  useUnsavedWarning,
} from "./ui";

export function SecurityProfilePage() {
  const { t } = useT();
  const context = useSecurityWorkspace();
  const { profile, workspace, canEdit, membership } = context;
  const navigate = useNavigate();
  const save = useServerFn(saveSecurityProfile);
  const mutation = useWorkMutation(save, (input) => saveProfileInput.safeParse(input.data).success);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<SaveProfileInput>(() => ({
    workspaceId: workspace.id,
    ...(profile ? { id: profile.id, version: profile.version } : {}),
    sector: profile?.sector ?? "",
    countries: profile?.countries ?? [],
    regions: profile?.regions ?? [],
    important_locations: profile?.important_locations ?? [],
    important_functions: profile?.important_functions ?? [],
    critical_operations: profile?.critical_operations ?? [],
    assets: profile?.assets ?? [],
    threat_categories: profile?.threat_categories ?? [],
    frequency: (profile?.frequency as SaveProfileInput["frequency"]) ?? "manual",
    decisions_supported: profile?.decisions_supported ?? "",
    onboarding_completed: profile?.onboarding_completed ?? false,
  }));
  const [lines, setLines] = useState({
    countries: form.countries.join("\n"),
    regions: form.regions.join("\n"),
    important_locations: form.important_locations.join("\n"),
    important_functions: form.important_functions.join("\n"),
    critical_operations: form.critical_operations.join("\n"),
    assets: form.assets.join("\n"),
    threat_categories: form.threat_categories.join("\n"),
  });
  const markClean = useUnsavedWarning(dirty);
  const patch = (value: Partial<SaveProfileInput>) => {
    setForm((old) => ({ ...old, ...value }));
    setDirty(true);
    setSaved(false);
  };
  const listFields = [
    ["countries", "sw.profile.countries"],
    ["regions", "sw.profile.regions"],
    ["important_locations", "sw.profile.locations"],
    ["important_functions", "sw.profile.functions"],
    ["critical_operations", "sw.profile.operations"],
    ["assets", "sw.profile.assets"],
    ["threat_categories", "sw.profile.threats"],
  ] as const;
  return (
    <>
      <PageHeading title={t("sw.profile.title")} body={t("sw.profile.body")} />
      {membership.role === "owner" && <WorkspaceSettings />}
      <form
        className="space-y-6"
        data-testid="sw-profile-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canEdit || mutation.isPending) return;
          const returnAfter =
            (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-return") === "true";
          const lists = Object.fromEntries(
            Object.entries(lines).map(([key, value]) => [key, splitLines(value)]),
          ) as Pick<SaveProfileInput, keyof typeof lines>;
          try {
            const result = await mutation.mutateAsync({ data: { ...form, ...lists } });
            setForm((old) => ({ ...old, id: result.id, version: result.version }));
            markClean();
            setDirty(false);
            setSaved(true);
            if (returnAfter)
              await navigate({
                to: "/security-work/$workspaceId",
                params: { workspaceId: workspace.id },
              });
          } catch {
            /* error is rendered below */
          }
        }}
      >
        <fieldset disabled={!canEdit || mutation.isPending} className="space-y-6">
          <section className={`${panelClass} space-y-5`}>
            <h2 className="font-display text-lg font-semibold">{t("sw.profile.basics")}</h2>
            <TextField
              label={t("sw.profile.sector")}
              data-testid="sw-profile-sector"
              value={form.sector}
              onChange={(event) => patch({ sector: event.target.value })}
              maxLength={500}
            />
            <TextAreaField
              label={t("sw.profile.decisions")}
              data-testid="sw-profile-decisions"
              value={form.decisions_supported}
              onChange={(event) => patch({ decisions_supported: event.target.value })}
              maxLength={4000}
            />
          </section>
          <details className={`${panelClass} space-y-5`}>
            <summary className="min-h-11 cursor-pointer py-3 font-display text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {t("sw.profile.geography")}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {t("sw.profile.optional")}
              </span>
            </summary>
            <div className="grid gap-5 sm:grid-cols-2">
              {listFields.slice(0, 3).map(([key, label]) => (
                <TextAreaField
                  key={key}
                  label={t(label)}
                  hint={t("sw.profile.listHint")}
                  value={lines[key]}
                  onChange={(event) => {
                    setLines((old) => ({ ...old, [key]: event.target.value }));
                    setDirty(true);
                    setSaved(false);
                  }}
                  maxLength={10000}
                />
              ))}
            </div>
          </details>
          <details className={`${panelClass} space-y-5`}>
            <summary className="min-h-11 cursor-pointer py-3 font-display text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {t("sw.profile.protection")}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {t("sw.profile.optional")}
              </span>
            </summary>
            <div className="grid gap-5 sm:grid-cols-2">
              {listFields.slice(3).map(([key, label]) => (
                <TextAreaField
                  key={key}
                  label={t(label)}
                  hint={t("sw.profile.listHint")}
                  value={lines[key]}
                  onChange={(event) => {
                    setLines((old) => ({ ...old, [key]: event.target.value }));
                    setDirty(true);
                    setSaved(false);
                  }}
                  maxLength={10000}
                />
              ))}
            </div>
          </details>
          <section className={`${panelClass} space-y-5`}>
            <Field label={t("sw.profile.frequency")} hint={t("sw.profile.frequencyHint")}>
              {(id, hintId) => (
                <select
                  id={id}
                  aria-describedby={hintId}
                  className={selectClass}
                  value={form.frequency}
                  onChange={(event) =>
                    patch({ frequency: event.target.value as SaveProfileInput["frequency"] })
                  }
                >
                  {(["manual", "daily", "weekly", "monthly"] as const).map((value) => (
                    <option key={value} value={value}>
                      {t(`sw.profile.${value}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md py-2 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                checked={form.onboarding_completed}
                onChange={(event) => patch({ onboarding_completed: event.target.checked })}
              />
              {t("sw.profile.complete")}
            </label>
          </section>
        </fieldset>
        <WorkError
          code={mutation.error?.code}
          onRetry={mutation.error?.code === "CONFLICT" ? () => window.location.reload() : undefined}
        />
        {saved && (
          <p role="status" className="text-sm font-medium text-accent">
            {t("sw.saved")}
          </p>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <WorkButton type="submit" disabled={mutation.isPending} data-testid="sw-save-profile">
              {mutation.isPending ? t("sw.saving") : t("sw.save")}
            </WorkButton>
            <WorkButton
              type="submit"
              data-return="true"
              variant="outline"
              disabled={mutation.isPending}
            >
              {t("sw.profile.saveReturn")}
            </WorkButton>
          </div>
        )}
      </form>
    </>
  );
}

function WorkspaceSettings() {
  const { workspace } = useSecurityWorkspace();
  const { t } = useT();
  const save = useServerFn(saveSecurityWorkspace);
  const mutation = useWorkMutation(save);
  const [form, setForm] = useState<SaveWorkspaceInput>({
    workspaceId: workspace.id,
    version: workspace.version,
    name: workspace.name,
    language: workspace.language as "sv" | "en",
  });
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty);
  return (
    <details className={panelClass}>
      <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {t("sw.profile.workspace")}
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (mutation.isPending) return;
          try {
            const row = await mutation.mutateAsync({ data: form });
            setForm((old) => ({ ...old, version: row.version }));
            setDirty(false);
          } catch {
            /* rendered */
          }
        }}
      >
        <TextField
          label={t("sw.entry.name")}
          disabled={mutation.isPending}
          value={form.name}
          maxLength={120}
          required
          onChange={(event) => {
            setForm((old) => ({ ...old, name: event.target.value }));
            setDirty(true);
          }}
        />
        <WorkError
          code={mutation.error?.code}
          onRetry={mutation.error?.code === "CONFLICT" ? () => window.location.reload() : undefined}
        />
        <WorkButton type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t("sw.saving") : t("sw.save")}
        </WorkButton>
        {mutation.isSuccess && !dirty && (
          <p role="status" className="text-sm text-accent">
            {t("sw.saved")}
          </p>
        )}
      </form>
    </details>
  );
}
