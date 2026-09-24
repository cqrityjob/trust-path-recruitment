import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import {
  decideSecurityItem,
  getSecurityItemHistory,
  retrySecurityInboxItem,
} from "@/lib/security-work/security-work.functions";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import type { IntelligenceItem, SourceItem } from "@/lib/security-work/types";
import type { RetryInboxInput } from "@/lib/security-work/inputs";
import { useT } from "@/i18n/context";
import { useSecurityWorkspace, useWorkMutation } from "./context";
import {
  Field,
  LoadingState,
  TextAreaField,
  WorkButton,
  WorkError,
  formatDate,
  panelClass,
  selectClass,
  useUnsavedWarning,
} from "./ui";

export function ReferenceLink({ url }: { url: string | null }) {
  const { t } = useT();
  try {
    if (!url) return null;
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  } catch {
    return null;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 max-w-full items-center gap-2 break-all text-sm font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {t("sw.item.reference")}
      <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
    </a>
  );
}

export function SourceFacts({
  item,
}: {
  item: Pick<
    SourceItem,
    | "original_title"
    | "publisher"
    | "canonical_url"
    | "author"
    | "published_at"
    | "factual_extract"
    | "language"
    | "geography"
  >;
}) {
  const { t, lang } = useT();
  return (
    <div className="min-w-0 space-y-4">
      <h3 className="break-words font-display text-xl font-semibold">{item.original_title}</h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t("sw.sources.publisher")}</dt>
          <dd className="mt-1 break-words">{item.publisher || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("sw.item.published")}</dt>
          <dd className="mt-1">
            {item.published_at ? formatDate(item.published_at, lang) : t("sw.item.unknownDate")}
          </dd>
        </div>
        {item.author && (
          <div>
            <dt className="text-xs text-muted-foreground">{t("sw.item.author")}</dt>
            <dd className="mt-1 break-words">{item.author}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">{t("sw.sources.language")}</dt>
          <dd className="mt-1">
            {item.language === "sv"
              ? "Svenska"
              : item.language === "en"
                ? "English"
                : item.language}
          </dd>
        </div>
        {item.geography.length > 0 && (
          <div>
            <dt className="text-xs text-muted-foreground">{t("sw.sources.geography")}</dt>
            <dd className="mt-1 break-words">{item.geography.join(", ")}</dd>
          </div>
        )}
      </dl>
      <ReferenceLink url={item.canonical_url} />
      <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-secondary/30 p-4 text-sm leading-relaxed">
        {item.factual_extract}
      </div>
    </div>
  );
}

export function SecurityItemDetail({
  sourceItem,
  intelligenceItem,
  close,
}: {
  sourceItem: SourceItem;
  intelligenceItem?: IntelligenceItem;
  close: () => void;
}) {
  const { t, lang } = useT();
  return (
    <section data-testid="sw-item-detail" className={`${panelClass} space-y-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{t("sw.item.sourceFacts")}</h2>
        <WorkButton variant="outline" onClick={close}>
          {t("sw.inbox.close")}
        </WorkButton>
      </div>
      <SourceFacts item={sourceItem} />
      <p className="text-xs text-muted-foreground">
        {t("sw.item.registered")}: {formatDate(sourceItem.created_at, lang, true)}
      </p>
      <p className="text-xs text-muted-foreground">{t("sw.item.immutable")}</p>
      {intelligenceItem ? (
        <>
          <Triage key={intelligenceItem.id} item={intelligenceItem} />
          <History itemId={intelligenceItem.id} />
        </>
      ) : (
        <RetryInbox sourceItemId={sourceItem.id} />
      )}
    </section>
  );
}

function Triage({ item }: { item: IntelligenceItem }) {
  const { t, lang } = useT();
  const { workspace, canEdit } = useSecurityWorkspace();
  const mutation = useWorkMutation(useServerFn(decideSecurityItem));
  const [rationale, setRationale] = useState("");
  const [version, setVersion] = useState(item.version);
  useUnsavedWarning(Boolean(rationale.trim()));
  const bytes = new TextEncoder().encode(rationale.trim()).length;
  const disabled = !rationale.trim() || bytes > 2000 || mutation.isPending;
  return (
    <div className="space-y-4 border-t border-border pt-6">
      <h3 className="font-display text-lg font-semibold">{t("sw.triage.title")}</h3>
      {item.status !== "pending" && (
        <div className="space-y-2 rounded-lg bg-secondary/50 p-4">
          <p className="text-sm font-semibold">
            {t("sw.triage.recorded")}:{" "}
            {t(`sw.inbox.${item.status as "relevant" | "dismissed" | "promoted"}`)}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">{item.human_rationale}</p>
          <p className="text-xs text-muted-foreground">
            {t("sw.triage.stamped")}: {formatDate(item.decided_at, lang, true)}
          </p>
        </div>
      )}
      {!canEdit ? (
        <p className="text-sm text-muted-foreground">{t("sw.triage.readOnly")}</p>
      ) : item.status === "promoted" ? (
        <p className="text-sm text-muted-foreground">{t("sw.triage.final")}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("sw.triage.body")}</p>
          <TextAreaField
            label={t("sw.triage.rationale")}
            hint={t("sw.triage.limit")}
            data-testid="sw-triage-rationale"
            value={rationale}
            maxLength={2000}
            disabled={mutation.isPending}
            aria-invalid={bytes > 2000}
            onChange={(event) => setRationale(event.target.value)}
          />
          <WorkError
            code={mutation.error?.code}
            onRetry={
              mutation.error?.code === "CONFLICT" ? () => window.location.reload() : undefined
            }
          />
          <div className="flex flex-wrap gap-3">
            {(["relevant", "dismissed"] as const)
              .filter((status) => status !== item.status)
              .map((status) => (
                <WorkButton
                  key={status}
                  variant={status === "relevant" ? "default" : "outline"}
                  disabled={disabled}
                  data-testid={status === "relevant" ? "sw-triage-relevant" : "sw-triage-dismiss"}
                  onClick={async () => {
                    try {
                      const saved = await mutation.mutateAsync({
                        data: {
                          workspaceId: workspace.id,
                          id: item.id,
                          version,
                          status,
                          human_rationale: rationale,
                        },
                      });
                      setVersion(saved.version);
                      setRationale("");
                    } catch {
                      /* rendered */
                    }
                  }}
                >
                  {mutation.isPending
                    ? t("sw.saving")
                    : t(status === "relevant" ? "sw.triage.relevant" : "sw.triage.dismiss")}
                </WorkButton>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function RetryInbox({ sourceItemId }: { sourceItemId: string }) {
  const { t } = useT();
  const { workspace, canEdit } = useSecurityWorkspace();
  const mutation = useWorkMutation(useServerFn(retrySecurityInboxItem));
  const [selection, setSelection] = useState<{
    requirementId: string | null;
    urgency: RetryInboxInput["urgency"];
  }>({ requirementId: null, urgency: "routine" });
  return (
    <div className="space-y-4 border-t border-border pt-6">
      <p className="text-sm">{t("sw.error.partial")}</p>
      {canEdit && (
        <>
          <InboxSelection value={selection} onChange={setSelection} disabled={mutation.isPending} />
          <WorkError code={mutation.error?.code} />
          <WorkButton
            data-testid="sw-retry-inbox"
            disabled={mutation.isPending}
            onClick={() => {
              mutation.mutate({ data: { workspaceId: workspace.id, sourceItemId, ...selection } });
            }}
          >
            {mutation.isPending ? t("sw.saving") : t("sw.item.retryInbox")}
          </WorkButton>
        </>
      )}
    </div>
  );
}

export function InboxSelection({
  value,
  onChange,
  disabled,
}: {
  value: { requirementId: string | null; urgency: RetryInboxInput["urgency"] };
  onChange: (value: { requirementId: string | null; urgency: RetryInboxInput["urgency"] }) => void;
  disabled?: boolean;
}) {
  const { requirements } = useSecurityWorkspace();
  const { t } = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("sw.item.requirement")}>
        {(id) => (
          <select
            id={id}
            className={selectClass}
            disabled={disabled}
            value={value.requirementId ?? ""}
            onChange={(event) => onChange({ ...value, requirementId: event.target.value || null })}
          >
            <option value="">{t("sw.item.noRequirement")}</option>
            {value.requirementId &&
              !requirements.some(
                (row) => row.id === value.requirementId && row.status === "active",
              ) && (
                <option value={value.requirementId} disabled>
                  {t("sw.item.missingRequirement")}
                </option>
              )}
            {requirements
              .filter((row) => row.status === "active")
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.question}
                </option>
              ))}
          </select>
        )}
      </Field>
      <Field label={t("sw.item.urgency")}>
        {(id) => (
          <select
            id={id}
            className={selectClass}
            disabled={disabled}
            value={value.urgency}
            onChange={(event) =>
              onChange({ ...value, urgency: event.target.value as RetryInboxInput["urgency"] })
            }
          >
            {(["routine", "soon", "urgent"] as const).map((value) => (
              <option key={value} value={value}>
                {t(`sw.item.${value}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  );
}

function History({ itemId }: { itemId: string }) {
  const { t, lang } = useT();
  const { user, workspace, deny } = useSecurityWorkspace();
  const load = useServerFn(getSecurityItemHistory);
  const query = useQuery({
    queryKey: securityWorkKeys.history(user.id, workspace.id, itemId),
    queryFn: () => load({ data: { workspaceId: workspace.id, intelligenceItemId: itemId } }),
    retry: false,
    staleTime: 0,
  });
  const code =
    query.data && !query.data.ok ? query.data.code : query.isError ? "SAVE_FAILED" : null;
  useEffect(() => {
    if (code === "ACCESS_DENIED") deny();
  }, [code, deny]);
  return (
    <div className="space-y-3 border-t border-border pt-6">
      <h3 className="font-display text-lg font-semibold">{t("sw.history.title")}</h3>
      <p className="text-xs text-muted-foreground">{t("sw.history.recent")}</p>
      {query.isPending ? (
        <LoadingState />
      ) : code ? (
        <WorkError code={code} onRetry={() => void query.refetch()} />
      ) : (
        query.data?.ok && (
          <ol className="divide-y divide-border">
            {query.data.data.map((event) => (
              <li key={event.id} className="space-y-1 py-3 text-sm">
                <p className="font-medium">
                  {event.new_status
                    ? t(
                        `sw.inbox.${event.new_status as "pending" | "relevant" | "dismissed" | "promoted"}`,
                      )
                    : t(
                        event.operation === "INSERT"
                          ? "sw.history.registered"
                          : "sw.history.updated",
                      )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(event.created_at, lang, true)} ·{" "}
                  {t(event.actor_user_id === user.id ? "sw.history.you" : "sw.history.member")}
                </p>
                {historyRationale(event.details) && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {historyRationale(event.details)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  );
}

function historyRationale(details: unknown): string | null {
  if (!details || typeof details !== "object" || !("after" in details)) return null;
  const after = details.after;
  return after &&
    typeof after === "object" &&
    "rationale" in after &&
    typeof after.rationale === "string"
    ? after.rationale
    : null;
}
