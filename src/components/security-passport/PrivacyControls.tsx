// Privacy, sharing history and account controls.
//
// The disclosure history is where holder control becomes visible rather
// than merely promised: what is out there, who opened it, when it dies, and
// a revoke button that works. A sharing model the holder cannot inspect is
// not really holder-controlled.
//
// Revocation is one-way here as it will be in production — mirroring the
// existing `cd_guard_share_revocation_is_one_way` trigger. Un-revoking
// would let a holder believe a link is dead when it is not.
//
// Export and deletion are described but inert in Phase 1: both depend on a
// retention design that needs legal validation before it is built, and
// wiring a convincing button to nothing would be worse than saying so.

import { Ban, Clock, Download, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  packageById,
  shareStatus,
  type DisclosureRequest,
  type ShareStatus,
} from "@/lib/security-passport/disclosure";

export interface ShareHistoryEntry {
  readonly id: string;
  readonly request: DisclosureRequest;
  readonly openedCount: number;
}

function StatusWord({ status }: { status: ShareStatus }) {
  const { pt } = usePassportCopy();
  const Icon = status === "active" ? Eye : status === "expired" ? Clock : Ban;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        status === "active"
          ? "text-emerald-700 dark:text-emerald-400"
          : status === "expired"
            ? "text-amber-700 dark:text-amber-400"
            : "text-destructive",
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {pt(`disclosure.status.${status}` as const)}
    </span>
  );
}

export function DisclosureHistory({
  entries,
  viewedOn,
  onRevoke,
  className,
}: {
  entries: readonly ShareHistoryEntry[];
  viewedOn: string;
  onRevoke: (id: string) => void;
  className?: string;
}) {
  const { pt } = usePassportCopy();

  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <h3
        className="text-lg font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {pt("disclosure.historyTitle")}
      </h3>

      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{pt("disclosure.historyEmpty")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((e) => {
            const status = shareStatus(e.request, viewedOn);
            const pkg = packageById(e.request.packageId);
            return (
              <li
                key={e.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border border-border p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{pt(pkg.nameKey)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.request.recipientHint ?? pt("disclosure.recipientPlaceholder")}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {pt("recipient.expiresOn")}: {e.request.expiresOn} · {pt("disclosure.opened")}{" "}
                    {e.openedCount} {pt("disclosure.times")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusWord status={status} />
                  {status === "active" ? (
                    <button
                      type="button"
                      onClick={() => onRevoke(e.id)}
                      className="inline-flex h-9 items-center rounded-md border border-input px-3 text-xs font-medium text-foreground transition-colors hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {pt("disclosure.revoke")}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted-foreground">{pt("disclosure.revokeNote")}</p>
    </section>
  );
}

/** Says how the right beside it is exercised. A card with no control needs
 *  to say that it has no control, or it reads as one that is broken. */
function RequestOnlyChip() {
  const { pt } = usePassportCopy();
  return (
    <span className="mt-3 inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {pt("privacy.handledOnRequest")}
    </span>
  );
}

export function PrivacyControls({ className }: { className?: string }) {
  const { pt } = usePassportCopy();

  return (
    <div className={cn("mx-auto w-full max-w-3xl space-y-4", className)}>
      <header>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("privacy.title")}
        </h2>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {pt("privacy.defaultTitle")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{pt("privacy.defaultBody")}</p>
      </section>

      {/* ── NEITHER OF THESE IS A CONTROL, AND THEY NOW SAY SO ─────────
          Both cards describe a right the product already grants; neither has
          ever carried a button, because export and deletion depend on a
          retention design that needs legal validation before it is built,
          and a convincing button wired to nothing would be worse.

          What they DID do was look exactly like every actionable card in the
          product -- icon, heading, body, same border, same padding -- and
          black-box UAT read them as available and non-functional. The chip
          answers that directly: the right is real, the route is a request,
          and the request control is the one below. Nothing here is faked. */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-2.5">
            <Download
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            />
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {pt("privacy.exportTitle")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{pt("privacy.exportBody")}</p>
              <RequestOnlyChip />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-2.5">
            <Trash2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {pt("privacy.deleteTitle")}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pt("privacy.deleteBody")}
              </p>
              <RequestOnlyChip />
            </div>
          </div>
        </div>
      </section>

      {/* Export and deletion are rights the product already promises at sign-up.
          They had no control here and a note saying "the buttons are inactive in
          the prototype" — naming buttons this section does not contain. Building
          a self-service export is a feature; telling a holder where to exercise a
          right they already have is finishing the sentence. */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm leading-relaxed text-foreground">{pt("privacy.requestNote")}</p>
        <a
          href="/contact"
          className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("privacy.requestAction")}
        </a>
      </div>
    </div>
  );
}
