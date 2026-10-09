// Reopening "ej aktuell": a separate, authorised act with a stated reason
// (slot 20270311100000). Manager only; the page's status is the expected
// status; the reason goes into the ledger; nothing is sent. Without the slot
// installed the button is absent and the closed view's note stands.

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import { reopenApplication } from "@/lib/recruitment/lifecycle-v03.functions";
import { recruitmentErrorKey } from "./errors";

export function ReopenDecision({
  employerId,
  applicationId,
  onReopened,
}: {
  employerId: string;
  applicationId: string;
  onReopened: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const reopen = useServerFn(reopenApplication);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  // One operation id per opened dialog: a retry after a network error repeats
  // the SAME act and gets the same answer, never a second reopen.
  const operationId = useRef<string>(crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: () =>
      reopen({
        data: {
          employerId,
          applicationId,
          expectedStatus: "rejected",
          reason: reason.trim(),
          operationId: operationId.current,
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setNotice({ tone: "ok", text: t("rec.reopen.done") });
      operationId.current = crypto.randomUUID();
      void qc.invalidateQueries({ queryKey: ["employer", employerId] });
      onReopened();
    },
    onError: (e: unknown) => {
      const code = (e as Error).message;
      setOpen(false);
      setNotice({
        tone: "warn",
        text:
          code === "SCHEMA_NOT_INSTALLED"
            ? t("rec.reopen.notInstalled")
            : t(recruitmentErrorKey(code)),
      });
    },
  });
  return (
    <div className="mt-3" data-testid="reopen-decision">
      <button
        type="button"
        data-testid="reopen-open"
        onClick={() => {
          setNotice(null);
          setOpen(true);
        }}
        className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/40"
      >
        {t("rec.reopen.action")}
      </button>
      {notice && (
        <p
          role="status"
          data-testid="reopen-notice"
          data-tone={notice.tone}
          className={`mt-2 rounded-md border px-3 py-2 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          {notice.text}
        </p>
      )}
      {open && (
        <ConfirmAction
          open
          onOpenChange={(o) => !o && setOpen(false)}
          busy={mutation.isPending}
          title={t("rec.reopen.title")}
          consequence={
            <span className="block space-y-2">
              <span className="block">{t("rec.reopen.body")}</span>
              <label className="block text-sm">
                {t("rec.reopen.reason")}
                <textarea
                  data-testid="reopen-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("rec.reopen.reasonPlaceholder")}
                  maxLength={1000}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
                />
              </label>
            </span>
          }
          confirmLabel={t("rec.reopen.confirm")}
          cancelLabel={t("rec.common.cancel")}
          onConfirm={() => {
            if (reason.trim().length < 5) {
              setNotice({ tone: "warn", text: t("rec.error.reopenReason") });
              return;
            }
            mutation.mutate();
          }}
        />
      )}
    </div>
  );
}
