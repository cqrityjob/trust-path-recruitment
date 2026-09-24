import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { addSecuritySourceItem } from "@/lib/security-work/security-work.functions";
import { addSourceItemInput, type AddSourceItemInput } from "@/lib/security-work/inputs";
import type { Source } from "@/lib/security-work/types";
import { useT } from "@/i18n/context";
import { WorkFailure, useSecurityWorkspace, useWorkMutation } from "./context";
import { SecuritySourceForm } from "./Sources";
import { InboxSelection, ReferenceLink, SourceFacts } from "./ItemDetail";
import { MaterialInbox } from "./Monitoring";
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

export function SecuritySourceDetailPage({ sourceId }: { sourceId: string }) {
  const { t } = useT();
  const { workspace, sources, canEdit } = useSecurityWorkspace();
  const source = sources.find((row) => row.id === sourceId);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!source)
    return (
      <EmptyState title={t("sw.error.access")} body={t("sw.error.accessBody")}>
        <WorkButton asChild variant="outline">
          <Link to="/security-work/$workspaceId/sources" params={{ workspaceId: workspace.id }}>
            {t("sw.backSources")}
          </Link>
        </WorkButton>
      </EmptyState>
    );
  return (
    <>
      <div>
        <WorkButton asChild variant="ghost">
          <Link to="/security-work/$workspaceId/sources" params={{ workspaceId: workspace.id }}>
            {t("sw.backSources")}
          </Link>
        </WorkButton>
      </div>
      <PageHeading
        title={source.name}
        body={source.publisher}
        action={
          canEdit &&
          source.active &&
          !adding && (
            <WorkButton
              data-testid="sw-add-item"
              onClick={() => {
                setAdding(true);
                setSaved(false);
              }}
            >
              <Plus aria-hidden="true" />
              {t("sw.item.add")}
            </WorkButton>
          )
        }
      />
      <div className={`${panelClass} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
            {t(source.active ? "sw.active" : "sw.paused")}
          </span>
          {canEdit && !editing && (
            <WorkButton variant="outline" onClick={() => setEditing(true)}>
              {t("sw.sources.edit")}
            </WorkButton>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t("sw.sources.immutable")}</p>
        <ReferenceLink url={source.canonical_url} />
        {source.usage_notes && (
          <p className="whitespace-pre-wrap break-words text-sm">{source.usage_notes}</p>
        )}
        {!source.active && (
          <p className="text-sm text-muted-foreground">{t("sw.sources.inactive")}</p>
        )}
      </div>
      {editing && <SecuritySourceForm source={source} close={() => setEditing(false)} />}
      {adding && (
        <NewSourceItem
          source={source}
          close={() => setAdding(false)}
          done={() => {
            setAdding(false);
            setSaved(true);
          }}
        />
      )}
      {saved && (
        <p role="status" className="rounded-lg bg-accent/10 p-4 text-sm font-medium">
          {t("sw.item.saved")}
        </p>
      )}
      <MaterialInbox sourceId={source.id} />
    </>
  );
}

export function NewSourceItem({
  source,
  close,
  done,
}: {
  source: Source;
  close: () => void;
  done: () => void;
}) {
  const { t } = useT();
  const { workspace, refresh, canEdit } = useSecurityWorkspace();
  const mutation = useWorkMutation(useServerFn(addSecuritySourceItem));
  const submitted = useRef<AddSourceItemInput | null>(null);
  const [preview, setPreview] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [published, setPublished] = useState("");
  const [geography, setGeography] = useState(source.geography.join("\n"));
  const [form, setForm] = useState<AddSourceItemInput>(() => ({
    workspaceId: workspace.id,
    sourceId: source.id,
    requestId: crypto.randomUUID(),
    original_title: "",
    publisher: source.publisher,
    canonical_url: source.canonical_url,
    author: null,
    published_at: null,
    factual_extract: "",
    language: source.language === "en" ? "en" : "sv",
    geography: source.geography,
    requirementId: null,
    urgency: "routine",
  }));
  useUnsavedWarning(dirty);
  const patch = (value: Partial<AddSourceItemInput>) => {
    setForm((old) => ({ ...old, ...value }));
    setDirty(true);
  };
  const payload = submitted.current ?? {
    ...form,
    geography: splitLines(geography),
    published_at: published
      ? /^\d{4}-\d{2}-\d{2}$/.test(published)
        ? `${published}T12:00:00.000Z`
        : published
      : null,
  };
  return (
    <form
      className={`${panelClass} space-y-5`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canEdit || mutation.isPending) return;
        if (!preview) {
          const checked = addSourceItemInput.safeParse(payload);
          if (!checked.success) {
            setInvalid(true);
            return;
          }
          setForm(checked.data);
          setInvalid(false);
          setPreview(true);
          return;
        }
        // Once dispatched, keep exactly these facts and this ID for every retry.
        // An uncertain response may already have committed the immutable original.
        submitted.current ??= payload;
        try {
          await mutation.mutateAsync({ data: submitted.current });
          setDirty(false);
          done();
        } catch (error) {
          if (
            error instanceof WorkFailure &&
            (error.code === "REFERENCE_CHANGED" || error.code === "SOURCE_INACTIVE")
          ) {
            // These errors prove this request has not written source material.
            // Keep the ID, but allow correction against the current references.
            submitted.current = null;
            setPreview(false);
            void refresh();
          }
          // Other failures may have committed: retain the frozen retry payload.
        }
      }}
    >
      <h2 className="font-display text-xl font-semibold">
        {t(preview ? "sw.item.previewTitle" : "sw.item.add")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("sw.item.immutable")}</p>
      {preview ? (
        <>
          <SourceFacts item={payload} />
          <div className="rounded-md bg-secondary/40 p-3 text-sm">
            <p>
              {t("sw.item.urgency")}: {t(`sw.item.${payload.urgency}`)}
            </p>
          </div>
          {submitted.current && (
            <p className="text-sm text-muted-foreground">{t("sw.item.retrySame")}</p>
          )}
        </>
      ) : (
        <fieldset className="space-y-5" disabled={!canEdit || mutation.isPending}>
          <TextField
            label={t("sw.item.title")}
            data-testid="sw-item-title"
            required
            maxLength={500}
            value={form.original_title}
            onChange={(event) => patch({ original_title: event.target.value })}
          />
          <TextField
            label={t("sw.sources.publisher")}
            maxLength={500}
            value={form.publisher}
            onChange={(event) => patch({ publisher: event.target.value })}
          />
          <TextField
            label={t("sw.sources.url")}
            type="url"
            pattern="https://.*"
            maxLength={2048}
            value={form.canonical_url ?? ""}
            onChange={(event) => patch({ canonical_url: event.target.value || null })}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label={t("sw.item.author")}
              maxLength={500}
              value={form.author ?? ""}
              onChange={(event) => patch({ author: event.target.value || null })}
            />
            <TextField
              label={t("sw.item.published")}
              type="date"
              value={published}
              onChange={(event) => {
                setPublished(event.target.value);
                setDirty(true);
              }}
            />
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
            <TextAreaField
              label={t("sw.sources.geography")}
              hint={t("sw.profile.listHint")}
              maxLength={10000}
              value={geography}
              onChange={(event) => {
                setGeography(event.target.value);
                setDirty(true);
              }}
            />
          </div>
          <TextAreaField
            label={t("sw.item.extract")}
            data-testid="sw-item-extract"
            required
            maxLength={16000}
            className="min-h-48"
            value={form.factual_extract}
            onChange={(event) => patch({ factual_extract: event.target.value })}
          />
          <InboxSelection value={form} onChange={(value) => patch(value)} />
        </fieldset>
      )}
      <WorkError code={invalid ? "INVALID_INPUT" : mutation.error?.code} />
      <div className="flex flex-wrap gap-3">
        <WorkButton
          type="submit"
          data-testid={preview ? "sw-confirm-item" : "sw-preview-item"}
          disabled={!canEdit || mutation.isPending}
        >
          {mutation.isPending ? t("sw.saving") : t(preview ? "sw.item.confirm" : "sw.item.preview")}
        </WorkButton>
        {preview && !submitted.current && (
          <WorkButton type="button" variant="outline" onClick={() => setPreview(false)}>
            {t("sw.item.adjust")}
          </WorkButton>
        )}
        {!submitted.current && (
          <WorkButton
            type="button"
            variant="ghost"
            disabled={!canEdit || mutation.isPending}
            onClick={close}
          >
            {t("sw.cancel")}
          </WorkButton>
        )}
      </div>
    </form>
  );
}
