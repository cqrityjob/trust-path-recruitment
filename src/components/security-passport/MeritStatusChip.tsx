// Security Passport — one merit's standing, as a chip.
//
// Extracted from PassportWorkspace so the sharing screen can put the SAME
// word beside the SAME merit. Two components would have been two vocabularies
// within one product: the workspace saying "Dokumenterad" and the share
// screen saying "Verifierad" about one credential, on two tabs, on one
// afternoon.
//
// It decides no trust. `WorkspaceMeritStatus` arrives already derived by the
// shared merit labeller; this maps it to a word and a tone, and nothing else.
//
// ── AN ARCHIVED MERIT WEARS ITS LIFECYCLE, NOT A TRUST WORD ───────────
//
// The shared labeller refuses every trust word to a row whose lifecycle has
// moved on — correctly, because an expired credential is not currently a
// verified one. What is left is `added_by_you`, and printing "Egen uppgift"
// against a credential CQrityjob really did review, under a heading that says
// the entry is archived, understates what happened to it.
//
// So an archived row says what is actually true of it TODAY: it expired, it
// was revoked, it was superseded, it is disputed. No trust claim is made
// either way. The machine-readable `data-merit-status` still carries the
// shared label, so nothing downstream has to know about this.

import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { isArchivedMerit, type LifecycleState } from "@/lib/security-passport/types";
import type { WorkspaceMeritStatus } from "@/lib/security-passport/workspace";
import { MERIT_STATUS_KEY } from "@/lib/security-passport/merit-status";

export function MeritStatusChip({
  status,
  lifecycleState,
  className,
}: {
  status: WorkspaceMeritStatus;
  lifecycleState: LifecycleState;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const archived = isArchivedMerit(lifecycleState);
  const tone = archived
    ? "border-border text-muted-foreground"
    : status === "verified"
      ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
      : status === "documented"
        ? "border-sky-600/40 text-sky-700 dark:text-sky-400"
        : status === "clarification_needed" || status === "expired"
          ? "border-amber-600/50 text-amber-700 dark:text-amber-400"
          : "border-border text-muted-foreground";
  return (
    <span
      data-merit-status={status}
      data-merit-lifecycle={lifecycleState}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      {archived ? pt(`lifecycle.${lifecycleState}` as const) : pt(MERIT_STATUS_KEY[status])}
    </span>
  );
}
