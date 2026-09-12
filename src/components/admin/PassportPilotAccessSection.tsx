// Admin Control Center — Security Passport internal-pilot access for ONE user.
//
// Three rows, one per pilot market (Great Britain, Northern Ireland, Dubai),
// each showing whether this user holds a live entitlement, when it was
// granted or revoked, and the administrator's own short note. Granting is one
// click per market; revoking asks for a second, deliberate click in a
// labelled dialog rather than a window.confirm() — the same rule every
// destructive admin action here follows.
//
// This component decides nothing. `sp_grant_pilot_member()` and
// `sp_revoke_pilot_member()` independently re-check that the caller is a
// platform administrator; the route re-checks it before calling them; this
// only renders what it is given and calls back.
//
// What it says beside the button matters as much as the button: an
// entitlement permits REGISTRATION in an unreviewed market. It is not legal
// approval, not verification, and not a statement about the person.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import { formatDateTime } from "@/lib/job-intelligence/date-format";

/** One market's row, in the shape `adminListPassportPilotAccess` returns.
 *  Structural, so the guard renders it from a literal. */
export interface PilotAccessRowView {
  readonly marketPackCode: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly inPilot: boolean;
  readonly entitlement: {
    readonly active: boolean;
    readonly grantedAt: string;
    readonly revokedAt: string | null;
    readonly note: string | null;
  } | null;
}

export function PassportPilotAccessSection({
  rows,
  status,
  pending,
  errorMessage,
  onGrant,
  onRevoke,
  onRetry,
}: {
  readonly rows: readonly PilotAccessRowView[];
  readonly status: "loading" | "failed" | "ready";
  readonly pending: boolean;
  readonly errorMessage: string | null;
  readonly onGrant: (input: { marketPackCode: string; note: string }) => void;
  readonly onRevoke: (input: { marketPackCode: string }) => void;
  readonly onRetry?: () => void;
}) {
  const { t, lang } = useT();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [revoking, setRevoking] = useState<PilotAccessRowView | null>(null);

  return (
    <section
      className="mt-6 rounded-lg border border-border bg-background p-5"
      data-passport-pilot-access={status}
    >
      <h2 className="text-sm font-semibold text-foreground">{t("admin.users.pilot.title")}</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
        {t("admin.users.pilot.lead")}
      </p>
      <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
        {t("admin.users.pilot.notApproval")}
      </p>

      {status === "loading" ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {t("admin.loading")}
        </p>
      ) : null}

      {status === "failed" ? (
        <div role="alert" className="mt-3">
          <p className="text-sm text-destructive">{t("admin.users.pilot.loadFailed")}</p>
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onRetry}>
              {t("admin.users.pilot.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {status === "ready" ? (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((row) => {
            const name = lang === "sv" ? row.nameSv : row.nameEn;
            const active = row.entitlement?.active === true;
            const revoked = row.entitlement !== null && !active;
            const note = notes[row.marketPackCode] ?? "";
            const noteId = `pilot-note-${row.marketPackCode}`;
            return (
              <li
                key={row.marketPackCode}
                data-pilot-market={row.marketPackCode}
                data-pilot-state={active ? "active" : revoked ? "revoked" : "none"}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {name}{" "}
                    <code className="ml-1 text-xs text-muted-foreground">{row.marketPackCode}</code>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground" data-pilot-state-text>
                    {active
                      ? `${t("admin.users.pilot.state.active")} · ${formatDateTime(
                          row.entitlement!.grantedAt,
                          lang,
                        )}`
                      : revoked
                        ? `${t("admin.users.pilot.state.revoked")} · ${formatDateTime(
                            row.entitlement!.revokedAt!,
                            lang,
                          )}`
                        : t("admin.users.pilot.state.none")}
                  </p>
                  {row.entitlement?.note ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("admin.users.pilot.note.label")}: {row.entitlement.note}
                    </p>
                  ) : null}
                  {!row.inPilot ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("admin.users.pilot.notInPilot")}
                    </p>
                  ) : null}
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-72">
                  {!active ? (
                    <>
                      <label htmlFor={noteId} className="text-xs font-medium text-foreground">
                        {t("admin.users.pilot.note.label")}{" "}
                        <span className="font-normal text-muted-foreground">
                          ({t("admin.users.pilot.note.optional")})
                        </span>
                      </label>
                      <Input
                        id={noteId}
                        value={note}
                        maxLength={200}
                        placeholder={t("admin.users.pilot.note.placeholder")}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [row.marketPackCode]: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || !row.inPilot}
                        data-pilot-action="grant"
                        className="min-h-11"
                        onClick={() => onGrant({ marketPackCode: row.marketPackCode, note })}
                      >
                        {revoked
                          ? t("admin.users.pilot.action.regrant")
                          : t("admin.users.pilot.action.grant")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      data-pilot-action="revoke"
                      className="min-h-11"
                      onClick={() => setRevoking(row)}
                    >
                      {t("admin.users.pilot.action.revoke")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {/* ── Revoke: a second, deliberate click ─────────────────────────── */}
      <Dialog open={revoking !== null} onOpenChange={(open) => (open ? null : setRevoking(null))}>
        <DialogContent data-pilot-revoke-dialog>
          <DialogHeader>
            <DialogTitle>{t("admin.users.pilot.confirm.title")}</DialogTitle>
            <DialogDescription>
              {revoking ? (lang === "sv" ? revoking.nameSv : revoking.nameEn) : ""} ·{" "}
              {t("admin.users.pilot.confirm.body")}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("admin.users.pilot.confirm.claims")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRevoking(null)}>
              {t("admin.users.pilot.confirm.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              data-pilot-action="confirm-revoke"
              onClick={() => {
                if (!revoking) return;
                onRevoke({ marketPackCode: revoking.marketPackCode });
                setRevoking(null);
              }}
            >
              {t("admin.users.pilot.confirm.revoke")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
