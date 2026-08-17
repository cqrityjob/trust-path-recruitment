// Lifecycle state — the second axis, rendered as its own thing.
//
// Deliberately a different visual family from AssertionChip: lighter
// weight, sentence case rather than caps, and always adjacent rather than
// merged. If the two axes shared a visual language a reader would collapse
// them back into one status, which is exactly the confusion the two-axis
// model exists to prevent (Product Architecture v1.1 §12).
//
// An expired VERIFIED licence therefore reads as two facts side by side —
// "VERIFIED" and "Expired" — rather than one contradictory label.

import { AlertTriangle, Ban, CircleDot, Clock, FileClock, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { LifecycleState } from "@/lib/security-passport/types";

const GLYPH: Record<LifecycleState, typeof Clock> = {
  draft: PenLine,
  active: CircleDot,
  expired: Clock,
  revoked: Ban,
  superseded: FileClock,
  disputed: AlertTriangle,
};

/** Tone is supplementary. Every state is already distinguished by its word
 *  and its glyph, so this survives greyscale unchanged. */
const TONE: Record<LifecycleState, string> = {
  draft: "text-muted-foreground",
  active: "text-emerald-700 dark:text-emerald-400",
  expired: "text-amber-700 dark:text-amber-400",
  revoked: "text-destructive",
  superseded: "text-muted-foreground",
  disputed: "text-amber-700 dark:text-amber-400",
};

export function LifecycleChip({ state, className }: { state: LifecycleState; className?: string }) {
  const { pt } = usePassportCopy();
  const Glyph = GLYPH[state];

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-medium", TONE[state], className)}
    >
      <Glyph aria-hidden="true" className="h-3.5 w-3.5" />
      {pt(`lifecycle.${state}` as const)}
    </span>
  );
}

/** The explanatory note for the two states a reader is most likely to
 *  misinterpret. Returns null for the rest rather than padding the UI. */
export function LifecycleNote({ state }: { state: LifecycleState }) {
  const { pt } = usePassportCopy();
  if (state === "expired") {
    return <p className="mt-1 text-xs text-muted-foreground">{pt("lifecycle.expiredNote")}</p>;
  }
  if (state === "disputed") {
    return <p className="mt-1 text-xs text-muted-foreground">{pt("lifecycle.disputedNote")}</p>;
  }
  return null;
}
