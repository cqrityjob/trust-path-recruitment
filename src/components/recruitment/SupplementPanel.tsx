// The supplement request as its own record (slot 20270311100000), and the
// candidate-facing consequence said plainly: a DRAFT exists, nothing is sent.
//
// Tolerant of a database where the slot is not installed: the panel then says
// so in one sentence and the header's "Begär komplettering" falls back to the
// plain message draft it opens today. Nothing here sends anything.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  getSupplementState,
  resolveSupplement,
  type SupplementRequest,
} from "@/lib/recruitment/lifecycle-v03.functions";
import { formatStamp } from "@/lib/recruitment/format";
import { supplementQueryKey } from "@/lib/recruitment/interview-composition";
import { recruitmentErrorKey } from "./errors";

export function SupplementPanel({
  employerId,
  applicationId,
  canManage,
  open,
}: {
  employerId: string;
  applicationId: string;
  canManage: boolean;
  /** The application is still open: a request can be resolved. */
  open: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const read = useServerFn(getSupplementState);
  const resolve = useServerFn(resolveSupplement);
  const query = useQuery({
    queryKey: supplementQueryKey(employerId, applicationId),
    queryFn: () => read({ data: { employerId, applicationId } }),
  });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { requestId: string; outcome: "answered" | "withdrawn" }) =>
      resolve({ data: { employerId, applicationId, ...input, note: note.trim() || null } }),
    onSuccess: () => {
      setError(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: supplementQueryKey(employerId, applicationId) });
    },
    onError: (e: unknown) => setError(t(recruitmentErrorKey((e as Error).message))),
  });
  const openRequest = useMemo(
    () =>
      query.data?.installed
        ? (query.data.requests.find((r) => r.resolvedAt === null) ?? null)
        : null,
    [query.data],
  );

  if (query.isPending || query.isError) return null;
  if (!query.data.installed) {
    return (
      <p className="mt-3 text-xs text-muted-foreground" data-testid="supplement-not-installed">
        {t("rec.supplement.notInstalled")}
      </p>
    );
  }
  const history = query.data.requests.filter((r) => r.resolvedAt !== null);
  return (
    <section
      data-testid="supplement-panel"
      data-awaiting={query.data.awaitingSupplement ? "true" : "false"}
      aria-labelledby="supplement-heading"
      className="mt-3 rounded-lg border border-border p-3"
    >
      <h3 id="supplement-heading" className="text-sm font-semibold text-foreground">
        {t("rec.supplement.heading")}
      </h3>
      {openRequest ? (
        <div className="mt-1 text-sm">
          <p
            className="font-medium text-amber-900 dark:text-amber-200"
            data-testid="supplement-awaiting"
          >
            {t("rec.supplement.awaiting")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("rec.supplement.awaitingHint").replace(
              "{date}",
              formatStamp(openRequest.requestedAt, lang),
            )}{" "}
            <MessageState r={openRequest} />
          </p>
          {canManage && open && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {t("rec.supplement.resolveNote")}
                <input
                  type="text"
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-9 min-w-[16rem] rounded-md border border-border bg-background px-2 text-sm"
                />
              </label>
              <button
                type="button"
                data-testid="supplement-answered"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ requestId: openRequest.requestId, outcome: "answered" })
                }
                className={btn}
              >
                {t("rec.supplement.markAnswered")}
              </button>
              <button
                type="button"
                data-testid="supplement-withdraw"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ requestId: openRequest.requestId, outcome: "withdrawn" })
                }
                className={btn}
              >
                {t("rec.supplement.withdraw")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t("rec.supplement.none")}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {history.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="min-h-9 cursor-pointer list-item py-1 font-medium">
            {t("rec.supplement.history")} ({history.length})
          </summary>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {history.map((r) => (
              <li key={r.requestId}>
                {formatStamp(r.requestedAt, lang)} ·{" "}
                {t(`rec.supplement.outcome.${r.outcome ?? "withdrawn"}` as TranslationKey)}
                {r.resolutionNote ? ` · ${r.resolutionNote}` : ""} · <MessageState r={r} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function MessageState({ r }: { r: SupplementRequest }) {
  const { t } = useT();
  if (!r.messageId) return null;
  return (
    <span data-testid="supplement-message-state" data-state={r.messageStatus ?? "none"}>
      (
      {r.messageStatus === "sent"
        ? t("rec.supplement.message.sent")
        : t("rec.supplement.message.draft")}
      )
    </span>
  );
}

const btn =
  "inline-flex min-h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
