import { saveSourceInput } from "@/lib/security-work/inputs";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Plus } from "lucide-react";
import { saveSecuritySource } from "@/lib/security-work/security-work.functions";
import type { SaveSourceInput } from "@/lib/security-work/inputs";
import type { Source } from "@/lib/security-work/types";
import { WorkspaceDocuments } from "./Evidence";
import { useWorkText } from "./analysis-ui";
import { useT } from "@/i18n/context";
import { useSecurityWorkspace, useWorkMutation } from "./context";
import {
  EmptyState,
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

export function SecuritySourcesPage() {
  const { t } = useT();
  const l = useWorkText();
  const { workspace, sources, canEdit } = useSecurityWorkspace();
  const manualSources = sources.filter((source) => source.source_type !== "document");
  const [adding, setAdding] = useState(false);
  const addButton =
    canEdit && !adding ? (
      <WorkButton data-testid="sw-add-source" onClick={() => setAdding(true)}>
        <Plus aria-hidden="true" />
        {t("sw.sources.add")}
      </WorkButton>
    ) : null;
  return (
    <>
      <PageHeading
        title={l("Underlag", "Evidence")}
        body={l(
          "Privata dokument, manuella observationer och källreferenser samlade för dina analyser.",
          "Private documents, manual observations and source references for your analyses.",
        )}
      />
      <WorkspaceDocuments />
      <section className="space-y-5 border-t border-border pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">{t("sw.sources.title")}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("sw.sources.body")}</p>
          </div>
          {addButton}
        </div>
        {adding && <SecuritySourceForm close={() => setAdding(false)} />}
        {manualSources.length === 0 && !adding ? (
          <EmptyState title={t("sw.sources.empty")} body={t("sw.sources.emptyBody")} />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {manualSources.map((source) => (
              <li key={source.id} className={`${panelClass} flex min-w-0 flex-col gap-3`}>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-secondary px-2.5 py-1">
                    {t(source.active ? "sw.active" : "sw.paused")}
                  </span>
                  <span className="px-1 py-1 text-muted-foreground">
                    {t(
                      source.source_type === "manual"
                        ? "sw.sources.manual"
                        : "sw.sources.reference",
                    )}
                  </span>
                </div>
                <h2 className="break-words font-display text-lg font-semibold">{source.name}</h2>
                <p className="break-words text-sm text-muted-foreground">{source.publisher}</p>
                <WorkButton asChild variant="outline" className="mt-auto self-start">
                  <Link
                    to="/security-work/$workspaceId/sources/$sourceId"
                    params={{ workspaceId: workspace.id, sourceId: source.id }}
                  >
                    {t("sw.sources.open")}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </WorkButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function SecuritySourceForm({ source, close }: { source?: Source; close: () => void }) {
  const { t, lang } = useT();
  const { workspace, canEdit } = useSecurityWorkspace();
  const save = useWorkMutation(
    useServerFn(saveSecuritySource),
    (input) => saveSourceInput.safeParse(input.data).success,
  );
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty);
  const [form, setForm] = useState<SaveSourceInput>({
    workspaceId: workspace.id,
    ...(source ? { id: source.id, version: source.version } : {}),
    name: source?.name ?? "",
    publisher: source?.publisher ?? "",
    source_type: (source?.source_type as SaveSourceInput["source_type"]) ?? "manual",
    canonical_url: source?.canonical_url ?? null,
    language: source?.language === "en" ? "en" : source?.language === "sv" ? "sv" : lang,
    geography: source?.geography ?? [],
    topics: source?.topics ?? [],
    reliability_category:
      (source?.reliability_category as SaveSourceInput["reliability_category"]) ?? "unverified",
    usage_notes: source?.usage_notes ?? "",
    active: source?.active ?? true,
  });
  const [geography, setGeography] = useState(form.geography.join("\n"));
  const [topics, setTopics] = useState(form.topics.join("\n"));
  const patch = (value: Partial<SaveSourceInput>) => {
    setForm((old) => ({ ...old, ...value }));
    setDirty(true);
  };
  return (
    <form
      className={`${panelClass} space-y-5`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canEdit || save.isPending) return;
        try {
          await save.mutateAsync({
            data: { ...form, geography: splitLines(geography), topics: splitLines(topics) },
          });
          setDirty(false);
          close();
        } catch {
          /* rendered */
        }
      }}
    >
      <h2 className="font-display text-xl font-semibold">
        {t(source ? "sw.sources.edit" : "sw.sources.add")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("sw.sources.immutable")}</p>
      <fieldset disabled={!canEdit || save.isPending} className="space-y-5">
        <TextField
          label={t("sw.sources.name")}
          data-testid="sw-source-name"
          required
          maxLength={200}
          value={form.name}
          onChange={(event) => patch({ name: event.target.value })}
        />
        <TextField
          label={t("sw.sources.publisher")}
          maxLength={500}
          value={form.publisher}
          onChange={(event) => patch({ publisher: event.target.value })}
        />
        <Field label={t("sw.sources.type")}>
          {(id) => (
            <select
              id={id}
              className={selectClass}
              value={form.source_type}
              onChange={(event) =>
                patch({ source_type: event.target.value as SaveSourceInput["source_type"] })
              }
            >
              <option value="manual">{t("sw.sources.manual")}</option>
              <option value="url_reference">{t("sw.sources.reference")}</option>
            </select>
          )}
        </Field>
        <TextField
          label={t("sw.sources.url")}
          data-testid="sw-source-url"
          type="url"
          pattern="https://.*"
          maxLength={2048}
          required={form.source_type === "url_reference"}
          value={form.canonical_url ?? ""}
          onChange={(event) => patch({ canonical_url: event.target.value || null })}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("sw.sources.language")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={form.language}
                onChange={(event) => patch({ language: event.target.value as "sv" | "en" })}
              >
                <option value="sv">Svenska</option>
                <option value="en">English</option>
              </select>
            )}
          </Field>
          <Field label={t("sw.sources.category")} hint={t("sw.sources.categoryHint")}>
            {(id, hintId) => (
              <select
                id={id}
                aria-describedby={hintId}
                className={selectClass}
                value={form.reliability_category}
                onChange={(event) =>
                  patch({
                    reliability_category: event.target
                      .value as SaveSourceInput["reliability_category"],
                  })
                }
              >
                {(["official", "professional", "observation", "unverified"] as const).map(
                  (value) => (
                    <option key={value} value={value}>
                      {t(`sw.sources.${value}`)}
                    </option>
                  ),
                )}
              </select>
            )}
          </Field>
          <TextAreaField
            label={t("sw.sources.geography")}
            hint={t("sw.profile.listHint")}
            value={geography}
            onChange={(event) => {
              setGeography(event.target.value);
              setDirty(true);
            }}
            maxLength={10000}
          />
          <TextAreaField
            label={t("sw.sources.topics")}
            hint={t("sw.profile.listHint")}
            value={topics}
            onChange={(event) => {
              setTopics(event.target.value);
              setDirty(true);
            }}
            maxLength={10000}
          />
        </div>
        <TextAreaField
          label={t("sw.sources.notes")}
          maxLength={4000}
          value={form.usage_notes}
          onChange={(event) => patch({ usage_notes: event.target.value })}
        />
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={form.active}
            onChange={(event) => patch({ active: event.target.checked })}
          />
          {t("sw.active")}
        </label>
      </fieldset>
      <WorkError
        code={save.error?.code}
        onRetry={save.error?.code === "CONFLICT" ? () => window.location.reload() : undefined}
      />
      <div className="flex flex-wrap gap-3">
        <WorkButton
          type="submit"
          data-testid="sw-save-source"
          disabled={!canEdit || save.isPending}
        >
          {save.isPending ? t("sw.saving") : t("sw.save")}
        </WorkButton>
        <WorkButton
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={() => {
            if (!dirty || window.confirm(t("sw.unsaved.leave"))) close();
          }}
        >
          {t("sw.cancel")}
        </WorkButton>
      </div>
    </form>
  );
}
