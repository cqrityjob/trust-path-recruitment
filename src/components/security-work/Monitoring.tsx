import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import { useSecuritySourceItems } from "./items";
import { SecurityItemDetail } from "./ItemDetail";
import { SecurityRequirements } from "./Requirements";
import { EmptyState, LoadingState, PageHeading, WorkButton, WorkError, formatDate } from "./ui";

export function SecurityMonitoringPage() {
  const { t } = useT();
  return (
    <>
      <PageHeading title={t("sw.monitoring.title")} body={t("sw.monitoring.body")} />
      <SecurityRequirements />
      <MaterialInbox />
    </>
  );
}

export function MaterialInbox({ sourceId }: { sourceId?: string }) {
  const { t, lang } = useT();
  const query = useSecuritySourceItems(sourceId);
  const [filter, setFilter] = useState<"all" | "pending" | "relevant" | "dismissed">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const intelligence = new Map(query.intelligenceItems.map((item) => [item.source_item_id, item]));
  const filtered = query.sourceItems.filter(
    (item) => filter === "all" || (intelligence.get(item.id)?.status ?? "pending") === filter,
  );
  const sourceItem = query.sourceItems.find((item) => item.id === selected);
  return (
    <section className="space-y-5">
      <h2 className="font-display text-xl font-semibold">{t("sw.inbox.title")}</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("sw.inbox.title")}>
        {(["all", "pending", "relevant", "dismissed"] as const).map((value) => (
          <WorkButton
            key={value}
            variant={filter === value ? "default" : "outline"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(`sw.inbox.${value}`)}
          </WorkButton>
        ))}
      </div>
      {query.hasNextPage && (
        <p className="text-xs text-muted-foreground">{t("sw.inbox.loadedOnly")}</p>
      )}
      <WorkError code={query.code} onRetry={() => void query.refetch()} />
      {query.isPending ? (
        <LoadingState />
      ) : query.sourceItems.length === 0 && !query.code ? (
        <EmptyState
          title={t(sourceId ? "sw.item.empty" : "sw.inbox.empty")}
          body={t(sourceId ? "sw.item.emptyBody" : "sw.inbox.emptyBody")}
        />
      ) : (
        <>
          {filtered.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">{t("sw.inbox.filterEmpty")}</p>
          )}
          <ul className="space-y-3">
            {filtered.map((item) => {
              const triage = intelligence.get(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="sw-item-row"
                    aria-expanded={selected === item.id}
                    onClick={() => setSelected(item.id)}
                    className="flex min-h-20 w-full items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 space-y-2">
                      <span className="block break-words font-semibold">{item.original_title}</span>
                      <span className="block break-words text-xs text-muted-foreground">
                        {item.publisher} · {formatDate(item.published_at ?? item.created_at, lang)}
                      </span>
                      <span className="inline-block rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                        {triage
                          ? t(
                              `sw.inbox.${triage.status as "pending" | "relevant" | "dismissed" | "promoted"}`,
                            )
                          : t("sw.item.needsInbox")}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 size-4 shrink-0" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          {query.hasNextPage && (
            <WorkButton
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? t("sw.loading") : t("sw.inbox.more")}
            </WorkButton>
          )}
          {sourceItem && (
            <SecurityItemDetail
              key={sourceItem.id}
              sourceItem={sourceItem}
              intelligenceItem={intelligence.get(sourceItem.id)}
              close={() => setSelected(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
