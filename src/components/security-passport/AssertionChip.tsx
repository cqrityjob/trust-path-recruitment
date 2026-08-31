// Evidence level, rendered so it cannot be misread.
//
// ── COLOUR IS NEVER THE ONLY DIFFERENTIATOR ────────────────────────────
//
// The binding rule is that SELF_DECLARED and DOCUMENT_PROVIDED must never
// be able to look VERIFIED (Product Architecture v1.1 §5.4). Colour alone
// fails that for a colour-blind reader, in greyscale, and in a screenshot
// with an unusual display profile — and a screenshot is exactly how a
// credential travels.
//
// So the three levels differ on four independent channels:
//   1. the word itself, spelled out, in the reader's language;
//   2. border style — dashed, solid, none;
//   3. shape — square corners, rounded corners, pill;
//   4. glyph — pencil, document, check.
//
// Any one of those alone distinguishes them. Colour is the fifth channel,
// carried by design tokens, and is never load-bearing.
//
// ── READ-ONLY BY CONSTRUCTION ──────────────────────────────────────────
//
// There is no `onChange`, no `editable` prop and no setter anywhere in this
// tree. The level is a fact about the entry, not a control.

import { CheckCircle2, FileText, History, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { AssertionLevel } from "@/lib/security-passport/types";

const SHAPE: Record<AssertionLevel, string> = {
  // Square corners + dashed border reads as "provisional" before any colour
  // is perceived.
  self_declared: "rounded-sm border border-dashed border-muted-foreground/60 text-muted-foreground",
  // Solid border, softly rounded: something exists, but nobody vouched.
  document_provided: "rounded-md border border-foreground/40 text-foreground",
  // Filled pill: the only level that reads as settled.
  verified: "rounded-full border border-transparent bg-primary text-primary-foreground",
};

/** A past verification: outlined and muted, deliberately carrying none of
 *  the "settled" signals the filled verified pill carries.
 *
 *  Explicitly NOT struck through. A strike-through reads as erased, and the
 *  one thing this product must not imply about a revoked verification is
 *  that it never happened. It is past, not deleted. */
const HISTORICAL_SHAPE = "rounded-md border border-muted-foreground/50 text-muted-foreground";

const GLYPH: Record<AssertionLevel, typeof PencilLine> = {
  self_declared: PencilLine,
  document_provided: FileText,
  verified: CheckCircle2,
};

export function AssertionChip({
  level,
  lifecycleState,
  className,
  size = "default",
}: {
  level: AssertionLevel;
  /** The entry's CURRENT standing. Optional: the legend below renders the
   *  three levels in the abstract, where no entry and no lifecycle exists. */
  lifecycleState?: string | null;
  className?: string;
  size?: "default" | "sm";
}) {
  const { pt } = usePassportCopy();

  // ── A REVOKED CREDENTIAL MAY NOT WEAR THE PRESENT TENSE ─────────────
  //
  // This chip printed `assertion.${level}` unconditionally, so a revoked
  // credential rendered the filled VERIFIED pill immediately beside its own
  // "Revoked" chip. Two chips, one entry, opposite claims — and the filled
  // pill is the one styled to read as settled.
  //
  // The verification is not erased: it really happened, the assertion level
  // still records it, and the word stays — in the past tense, as the Passport
  // Card has always said it (`useCardContent`'s `isCurrent`, from which this
  // rule and this copy key are taken rather than invented).
  //
  // The STYLING moves too, and has to. Leaving the filled pill under a past-
  // tense word would keep the visual claim while softening only the text,
  // and on this product the shape is a load-bearing channel (see the header):
  // a reader who cannot see colour, or is looking at a greyscale screenshot,
  // reads "settled" from the fill alone.
  const isCurrent = lifecycleState == null || lifecycleState === "active";
  const historical = !isCurrent && level === "verified";
  const Glyph = historical ? History : GLYPH[level];
  const label = historical
    ? pt("assertion.verified.historical")
    : pt(`assertion.${level}` as const);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        historical ? HISTORICAL_SHAPE : SHAPE[level],
        className,
      )}
    >
      <Glyph aria-hidden="true" className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label}
    </span>
  );
}

/** The legend. Shown wherever chips first appear, so a reader never has to
 *  infer what the three levels mean from their styling. */
export function AssertionLegend({ className }: { className?: string }) {
  const { pt } = usePassportCopy();
  const levels: AssertionLevel[] = ["self_declared", "document_provided", "verified"];

  return (
    <div className={cn("rounded-lg border border-border bg-secondary/40 p-4", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {pt("assertion.legend")}
      </p>
      <dl className="mt-3 space-y-3">
        {levels.map((level) => (
          <div key={level} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
            <dt className="shrink-0">
              <AssertionChip level={level} size="sm" />
            </dt>
            <dd className="text-sm text-muted-foreground">
              {pt(`assertion.${level}.help` as const)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        {pt("lifecycle.locked")}
      </p>
    </div>
  );
}
