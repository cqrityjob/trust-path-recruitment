// Security Passport — the one way "currently permitted" is printed.
//
// ── WHY A COMPONENT AND NOT FOUR COPIES ────────────────────────────────
//
// The jurisdiction label taught this lesson already: a string that four
// surfaces build independently is a string four surfaces will eventually
// disagree about, and the surface that disagrees loudest is the one that
// leaves the product. So the eligibility line exists once.
//
// ── WHY THE NOTE IS NOT OPTIONAL ───────────────────────────────────────
//
// "Personalgodkännande kontrollerat" reads, to somebody skimming, like a
// credential — and a credential in the same visual weight as an appointment
// invites the reader to treat them as the same kind of fact. The note says
// what this is and, more importantly, the three things it is not. It is part
// of the claim, not decoration, which is why it is rendered here rather than
// left to each caller to remember.

import { joinTitles, type Labelled } from "@/lib/security-passport/identity/presentation";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { cn } from "@/lib/utils";

export function EligibilityLine({
  titles,
  className,
  withNote = true,
}: {
  readonly titles: readonly Labelled[];
  readonly className?: string;
  /** The compact card face has no room for the note and carries the label
   *  beside a fuller record; the note is never dropped where the line stands
   *  alone as the reader's only context. */
  readonly withNote?: boolean;
}) {
  const { pt, lang } = usePassportCopy();

  // Absent rather than empty. "Current eligibility: none" invites a reader to
  // treat a Passport that simply does not disclose an approval as one that was
  // checked and refused.
  if (titles.length === 0) return null;

  return (
    <div className={cn("", className)} data-testid="sp-eligibility">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {pt("identity.eligibility")}
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{joinTitles(titles, lang, "")}</p>
      {withNote ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {pt("identity.eligibilityNote")}
        </p>
      ) : null}
    </div>
  );
}
