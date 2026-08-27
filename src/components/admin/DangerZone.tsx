// Admin Control Center — the one destructive-action surface.
//
// Every irreversible or hard-to-reverse admin action in the portal goes
// through this component, so an administrator meets the same shape every time:
//
//   1. the action is named, and its consequence is stated in a full sentence
//      before anything opens;
//   2. the dialog shows an IMPACT PREVIEW -- what exists, what will go, what
//      stays -- computed by the database, not guessed by the page;
//   3. a reason is typed where the action is audited (which is all of them);
//   4. a high-impact delete additionally requires typing the exact name or
//      address of the thing being deleted;
//   5. confirming is a second, deliberate click on a clearly labelled button.
//
// window.confirm() is deliberately not used anywhere here. It cannot carry an
// impact preview, cannot collect a reason, is not translatable, and is not
// reachable by a screen reader in the way a labelled dialog is.
//
// This component decides nothing. It renders what it is given and calls back;
// every rule it appears to enforce is independently enforced by the SECURITY
// DEFINER function behind onConfirm.

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/context";

export type DangerAction = {
  /** Stable key, used for React identity and for the open-dialog state. */
  key: string;
  label: string;
  /** One sentence, in the administrator's language, saying what happens. */
  consequence: string;
  variant?: "default" | "destructive" | "outline";
  requiresReason?: boolean;
  /** When set, the administrator must type this exact string to confirm. */
  confirmPhrase?: string | null;
  confirmPhraseLabel?: string;
  /** Rendered inside the dialog above the reason field. */
  impact?: ReactNode;
  /** When set, the action is offered but not available, and says why. */
  blockedReason?: string | null;
  onConfirm: (input: { reason: string }) => void;
};

export function DangerZone({
  title,
  description,
  actions,
  pending,
  errorMessage,
  successMessage,
}: {
  title: string;
  description: string;
  actions: DangerAction[];
  pending?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
}) {
  const { t } = useT();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const open = actions.find((a) => a.key === openKey) ?? null;

  function close() {
    setOpenKey(null);
    setReason("");
    setTyped("");
    setLocalError(null);
  }

  function start(action: DangerAction) {
    setReason("");
    setTyped("");
    setLocalError(null);
    setOpenKey(action.key);
  }

  function confirm() {
    if (!open) return;
    if (open.requiresReason !== false && !reason.trim()) {
      setLocalError(t("admin.danger.error.reasonRequired"));
      return;
    }
    if (open.confirmPhrase && typed.trim() !== open.confirmPhrase) {
      setLocalError(t("admin.danger.error.confirmMismatch"));
      return;
    }
    setLocalError(null);
    open.onConfirm({ reason: reason.trim() });
  }

  return (
    <section className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
      <h2 className="text-sm font-semibold text-destructive">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      {successMessage && (
        <div
          role="status"
          className="mt-4 rounded-md border border-border bg-background p-3 text-sm text-foreground"
        >
          {successMessage}
        </div>
      )}
      {errorMessage && !openKey && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-destructive/50 bg-background p-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {actions.map((a) => (
          <li
            key={a.key}
            className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{a.label}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{a.consequence}</p>
              {a.blockedReason && (
                <p className="mt-1 text-xs font-medium text-destructive">{a.blockedReason}</p>
              )}
            </div>
            <Button
              type="button"
              variant={a.variant ?? "destructive"}
              disabled={Boolean(a.blockedReason) || pending}
              onClick={() => start(a)}
            >
              {a.label}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={open !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.label}</DialogTitle>
                <DialogDescription>{open.consequence}</DialogDescription>
              </DialogHeader>

              {open.impact && (
                <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("admin.danger.impactHeading")}
                  </p>
                  <div className="mt-2">{open.impact}</div>
                </div>
              )}

              {open.requiresReason !== false && (
                <div className="mt-4">
                  <label
                    htmlFor="danger-reason"
                    className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {t("admin.danger.reasonLabel")}
                  </label>
                  <Textarea
                    id="danger-reason"
                    className="mt-1"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("admin.danger.reasonPlaceholder")}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("admin.danger.reasonHelp")}
                  </p>
                </div>
              )}

              {open.confirmPhrase && (
                <div className="mt-4">
                  <label
                    htmlFor="danger-confirm"
                    className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {open.confirmPhraseLabel ?? t("admin.danger.confirmPhraseLabel")}
                  </label>
                  <p className="mt-1 text-sm text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">{open.confirmPhrase}</code>
                  </p>
                  <Input
                    id="danger-confirm"
                    className="mt-2"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}

              {(localError || errorMessage) && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {localError ?? errorMessage}
                </p>
              )}

              <DialogFooter className="mt-5">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {t("admin.danger.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant={open.variant ?? "destructive"}
                  onClick={confirm}
                  disabled={pending}
                >
                  {pending ? t("admin.danger.submitting") : t("admin.danger.confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The impact preview shared by both delete dialogs: what the database says
 *  blocks the action, or what it says will be removed if nothing does. */
export function DeletionImpactPreview({
  blockers,
  removed,
  translateBlocker,
}: {
  blockers: Array<{ code: string; count: number }>;
  removed: Record<string, number>;
  translateBlocker: (code: string) => string;
}) {
  const { t } = useT();
  const removedEntries = Object.entries(removed);

  if (blockers.length > 0) {
    return (
      <div>
        <p className="text-sm text-foreground">{t("admin.danger.blockedHeading")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
          {blockers.map((b) => (
            <li key={b.code}>
              {translateBlocker(b.code)} <span className="tabular-nums">({b.count})</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-foreground">{t("admin.danger.removedHeading")}</p>
      {removedEntries.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("admin.danger.removedNothing")}</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {removedEntries.map(([key, count]) => (
            <li key={key}>
              <code className="text-xs">{key}</code> <span className="tabular-nums">({count})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Permanent account deletion: what goes, and what stays.
//
// The administrator is about to do something irreversible to somebody's
// account, and the only honest way to ask for that confirmation is to show
// both halves at once. A single "this will be removed" list would be a lie by
// omission now that most of the rows survive.
//
// Every number here is computed by the database at call time, from the actual
// foreign keys in the schema. This component sorts them into two columns and
// renders them; it decides nothing.
function ImpactList({
  entries,
  tone,
}: {
  entries: Array<[string, number]>;
  tone: "removed" | "kept";
}) {
  return (
    <ul
      className={
        "mt-2 space-y-1 text-sm " +
        (tone === "removed" ? "text-destructive" : "text-muted-foreground")
      }
    >
      {entries.map(([key, count]) => (
        <li key={key} className="flex items-baseline justify-between gap-2">
          {/* These are table.column names, long and unbreakable at spaces.
              Without min-w-0 + break-all the count is pushed out of the
              dialog and the administrator cannot read the number. */}
          <code className="min-w-0 break-all text-xs">{key}</code>
          <span className="shrink-0 tabular-nums">{count}</span>
        </li>
      ))}
    </ul>
  );
}

export function AccountDeletionImpactPreview({
  deleted,
  detached,
  preserved,
  hasHistory,
  passportEvidenceFiles,
}: {
  deleted: Record<string, number>;
  detached: Record<string, number>;
  preserved: Record<string, number>;
  hasHistory: boolean;
  /** Evidence documents in Storage that the erasure will also remove. */
  passportEvidenceFiles: number;
}) {
  const { t } = useT();

  const deletedEntries = Object.entries(deleted).filter(([, n]) => n > 0);
  // Detached and preserved answer the same question for the administrator --
  // "what is still here afterwards?" -- so they are shown as one column, in
  // that order, rather than as two lists that would have to be compared.
  const keptEntries = [...Object.entries(detached), ...Object.entries(preserved)].filter(
    ([, n]) => n > 0,
  );

  return (
    <div className="space-y-4">
      {hasHistory ? (
        <p className="text-sm text-foreground">
          {t("admin.lifecycle.person.delete.historyHandled")}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 [&>section]:min-w-0">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-destructive">
            {t("admin.danger.impact.deletedHeading")}
          </h4>
          {deletedEntries.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("admin.danger.impact.deletedNothing")}
            </p>
          ) : (
            <ImpactList entries={deletedEntries} tone="removed" />
          )}
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin.danger.impact.keptHeading")}
          </h4>
          {keptEntries.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("admin.danger.impact.keptNothing")}
            </p>
          ) : (
            <ImpactList entries={keptEntries} tone="kept" />
          )}
        </section>
      </div>

      <p className="text-xs text-muted-foreground">{t("admin.danger.impact.keptNote")}</p>

      {/* Storage is a different service, and the honest thing to say is that
          the files go straight after the rows -- not that the two are one
          atomic act. A failure is queued and retried, never dropped. */}
      {passportEvidenceFiles > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("admin.lifecycle.person.delete.storageNote")}
        </p>
      ) : null}
    </div>
  );
}
