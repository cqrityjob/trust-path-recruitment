import { saveRequirementInput } from "@/lib/security-work/inputs";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import {
  saveSecurityRequirement,
  deleteSecurityRequirement,
} from "@/lib/security-work/security-work.functions";
import type { SaveRequirementInput } from "@/lib/security-work/inputs";
import type { Requirement } from "@/lib/security-work/types";
import { useT } from "@/i18n/context";
import { useSecurityWorkspace, useWorkMutation } from "./context";
import {
  Field,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  panelClass,
  selectClass,
  useUnsavedWarning,
} from "./ui";

export function SecurityRequirements() {
  const { t } = useT();
  const { workspace, requirements, canEdit } = useSecurityWorkspace();
  const [editing, setEditing] = useState<Requirement | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const remove = useWorkMutation(useServerFn(deleteSecurityRequirement));
  return (
    <section className={`${panelClass} space-y-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">{t("sw.requirements.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("sw.requirements.body")}</p>
        </div>
        {canEdit && !editing && (
          <WorkButton
            variant="outline"
            data-testid="sw-add-requirement"
            onClick={() => setEditing("new")}
          >
            <Plus aria-hidden="true" />
            {t("sw.requirements.add")}
          </WorkButton>
        )}
      </div>
      {editing && (
        <RequirementForm
          key={editing === "new" ? "new" : editing.id}
          row={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
        />
      )}
      {requirements.length === 0 && !editing && (
        <p className="py-3 text-sm text-muted-foreground">{t("sw.requirements.emptyBody")}</p>
      )}
      <ul className="divide-y divide-border">
        {requirements.map((row) => (
          <li key={row.id} className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                {t(row.status === "active" ? "sw.active" : "sw.paused")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`sw.requirements.${row.priority as "low" | "medium" | "high"}`)}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words font-medium">{row.question}</p>
            {row.decision_supported && (
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {row.decision_supported}
              </p>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <WorkButton
                  variant="outline"
                  disabled={Boolean(editing)}
                  onClick={() => setEditing(row)}
                >
                  {t("sw.edit")}
                </WorkButton>
                <WorkButton
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => setDeleting(row.id)}
                >
                  {t("sw.delete")}
                </WorkButton>
              </div>
            )}
            {deleting === row.id && (
              <div
                className="space-y-3 rounded-lg border border-border p-4"
                role="group"
                aria-label={t("sw.requirements.deleteTitle")}
              >
                <p className="font-medium">{t("sw.requirements.deleteTitle")}</p>
                <p className="text-sm text-muted-foreground">{t("sw.requirements.deleteBody")}</p>
                <WorkError
                  code={remove.error?.code}
                  onRetry={
                    remove.error?.code === "CONFLICT" ? () => window.location.reload() : undefined
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <WorkButton
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={async () => {
                      try {
                        await remove.mutateAsync({
                          data: { workspaceId: workspace.id, id: row.id, version: row.version },
                        });
                        setDeleting(null);
                      } catch {
                        /* rendered */
                      }
                    }}
                  >
                    {t("sw.delete")}
                  </WorkButton>
                  <WorkButton
                    variant="outline"
                    onClick={() => {
                      setDeleting(null);
                      remove.reset();
                    }}
                  >
                    {t("sw.cancel")}
                  </WorkButton>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequirementForm({ row, close }: { row?: Requirement; close: () => void }) {
  const { t } = useT();
  const { workspace, canEdit } = useSecurityWorkspace();
  const save = useWorkMutation(
    useServerFn(saveSecurityRequirement),
    (input) => saveRequirementInput.safeParse(input.data).success,
  );
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty);
  const [form, setForm] = useState<SaveRequirementInput>({
    workspaceId: workspace.id,
    ...(row ? { id: row.id, version: row.version } : {}),
    question: row?.question ?? "",
    decision_supported: row?.decision_supported ?? "",
    priority: (row?.priority as SaveRequirementInput["priority"]) ?? "medium",
    status: (row?.status as SaveRequirementInput["status"]) ?? "active",
    horizon_days: row?.horizon_days ?? 30,
  });
  const patch = (value: Partial<SaveRequirementInput>) => {
    setForm((old) => ({ ...old, ...value }));
    setDirty(true);
  };
  return (
    <form
      className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canEdit || save.isPending) return;
        try {
          await save.mutateAsync({ data: form });
          setDirty(false);
          close();
        } catch {
          /* rendered */
        }
      }}
    >
      <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
        <TextAreaField
          label={t("sw.requirements.question")}
          data-testid="sw-requirement-question"
          required
          maxLength={2000}
          value={form.question}
          onChange={(event) => patch({ question: event.target.value })}
        />
        <TextAreaField
          label={t("sw.requirements.decision")}
          maxLength={4000}
          value={form.decision_supported}
          onChange={(event) => patch({ decision_supported: event.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("sw.requirements.horizon")}
            type="number"
            min={1}
            max={365}
            required
            value={form.horizon_days}
            onChange={(event) => patch({ horizon_days: Number(event.target.value) })}
          />
          <Field label={t("sw.requirements.priority")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={form.priority}
                onChange={(event) =>
                  patch({ priority: event.target.value as SaveRequirementInput["priority"] })
                }
              >
                {(["low", "medium", "high"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`sw.requirements.${value}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={form.status === "active"}
            onChange={(event) => patch({ status: event.target.checked ? "active" : "paused" })}
          />
          {t("sw.active")}
        </label>
      </fieldset>
      <WorkError
        code={save.error?.code}
        onRetry={save.error?.code === "CONFLICT" ? () => window.location.reload() : undefined}
      />
      <div className="flex flex-wrap gap-2">
        <WorkButton
          type="submit"
          data-testid="sw-save-requirement"
          disabled={!canEdit || save.isPending}
        >
          {save.isPending ? t("sw.saving") : t("sw.save")}
        </WorkButton>
        <WorkButton
          variant="outline"
          type="button"
          disabled={!canEdit || save.isPending}
          onClick={close}
        >
          {t("sw.cancel")}
        </WorkButton>
      </div>
    </form>
  );
}
