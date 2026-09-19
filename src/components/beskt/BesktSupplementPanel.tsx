// After submission the answers are locked. A candidate who notices something
// wrong or missing adds a dated correction or addition here -- the submitted
// snapshot is never changed, and what they add is carried into the interview
// and the report as their own words.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { besktErrorKey } from "@/lib/beskt/errors";
import type { BesktPreparationItem } from "@/lib/beskt/candidate-preparation.functions";
import { listBesktSupplements, submitBesktSupplement } from "@/lib/beskt/complete.functions";

const FIELD =
  "mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function BesktSupplementPanel({
  assignmentId,
  items,
}: {
  readonly assignmentId: string;
  readonly items: readonly BesktPreparationItem[];
}) {
  const { t, lang } = useT();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listBesktSupplements);
  const submitFn = useServerFn(submitBesktSupplement);
  const [kind, setKind] = useState<"correction" | "addition">("correction");
  const [itemKey, setItemKey] = useState("");
  const [body, setBody] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());

  const list = useQuery({
    queryKey: ["beskt", "supplements", assignmentId],
    queryFn: () => listFn({ data: { assignmentId } }),
    retry: false,
  });
  const submit = useMutation({
    mutationFn: () =>
      submitFn({
        data: { operationId, assignmentId, kind, itemKey: itemKey || null, body: body.trim() },
      }),
    onSuccess: async () => {
      setBody("");
      setItemKey("");
      setOperationId(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: ["beskt", "supplements", assignmentId] });
    },
  });

  return (
    <section
      className="mt-8 rounded-lg border p-4"
      aria-labelledby="beskt-supplement-h"
      data-testid="beskt-supplement"
    >
      <h2 id="beskt-supplement-h" className="text-base font-semibold">
        {t("beskt.supplement.heading")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("beskt.supplement.lede")}</p>

      {(list.data ?? []).length > 0 ? (
        <ul className="mt-4 space-y-2" data-testid="beskt-supplement-list">
          {list.data!.map((x) => (
            <li key={x.supplementId} className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {t(
                  x.kind === "correction"
                    ? "beskt.supplement.correction"
                    : "beskt.supplement.addition",
                )}{" "}
                · {new Date(x.submittedAt).toLocaleString(lang === "sv" ? "sv-SE" : "en-GB")}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{x.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim().length >= 3) submit.mutate();
        }}
      >
        <div className="flex flex-wrap gap-4 text-sm">
          {(["correction", "addition"] as const).map((k) => (
            <label key={k} className="flex min-h-[44px] items-center gap-2">
              <input
                type="radio"
                name="beskt-supplement-kind"
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {t(k === "correction" ? "beskt.supplement.correction" : "beskt.supplement.addition")}
            </label>
          ))}
        </div>
        <div>
          <label htmlFor="beskt-supplement-item" className="text-sm font-medium">
            {t("beskt.supplement.question")}
          </label>
          <select
            id="beskt-supplement-item"
            className={FIELD}
            value={itemKey}
            onChange={(e) => setItemKey(e.target.value)}
          >
            <option value="">{t("beskt.supplement.general")}</option>
            {items.map((i) => (
              <option key={i.itemKey} value={i.itemKey}>
                {((lang === "sv" ? i.wordingSv : (i.wordingEn ?? i.wordingSv)) ?? i.itemKey).slice(
                  0,
                  90,
                )}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="beskt-supplement-body" className="text-sm font-medium">
            {t("beskt.supplement.body")}
          </label>
          <textarea
            id="beskt-supplement-body"
            rows={3}
            maxLength={2000}
            className={FIELD}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        {submit.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t(besktErrorKey(submit.error))}</AlertDescription>
          </Alert>
        ) : null}
        {submit.isSuccess ? (
          <p
            className="flex items-center gap-1.5 text-sm"
            aria-live="polite"
            data-testid="beskt-supplement-done"
          >
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {t("beskt.supplement.sent")}
          </p>
        ) : null}
        <Button
          type="submit"
          className="min-h-[44px]"
          disabled={body.trim().length < 3 || submit.isPending}
          data-testid="beskt-supplement-submit"
        >
          {t("beskt.supplement.submit")}
        </Button>
      </form>
    </section>
  );
}
