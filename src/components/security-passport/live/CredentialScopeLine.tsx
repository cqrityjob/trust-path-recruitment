// The one place a disclosed credential's scope is turned into words.
//
// ── WHY THIS IS A COMPONENT AND NOT TWO BLOCKS OF JSX ──────────────────
//
// A skyddsvakt approval is limited to an employer, a principal or a protected
// object, and three surfaces show disclosed credentials: the public recipient
// page, the shared RecipientPassportCard, and — through that card — the
// employer's view of an application.
//
// Written inline, each would decide separately what "limited" means and when
// the exact object may appear. Three interpretations of one privacy boundary
// is three chances to get it wrong, and the one that matters most is the one
// nobody looks at.
//
// ── IT DOES NOT DECIDE, IT RENDERS ─────────────────────────────────────
//
// Whether this reader may see the protected object was decided in
// `sp_disclosure_payload`, by package and by whether the disclosure is
// application-scoped. This component never second-guesses that: a present
// `authorisationScope` is shown, an absent one becomes "limited, details
// withheld", and there is no argument that could make it reveal more.
//
// Silence is deliberately not an option when `scopeLimited` is true. Saying
// nothing would leave the reader to assume the approval is unlimited, which is
// the exact misreading the scope exists to prevent.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { RecipientCredential } from "@/lib/security-passport/recipient-presentation";
import { cn } from "@/lib/utils";

export function CredentialScopeLine({
  credential,
  className,
  tone = "panel",
}: {
  readonly credential: Pick<RecipientCredential, "scopeLimited" | "authorisationScope">;
  readonly className?: string;
  /** `panel` for a full-width row, `inline` for inside a compact card item. */
  readonly tone?: "panel" | "inline";
}) {
  const { pt } = usePassportCopy();

  // An unscoped credential says nothing at all — there is no boundary to
  // report, and inventing a "no limits" line would itself be a claim.
  if (!credential.scopeLimited) return null;

  const detail = credential.authorisationScope ?? pt("rec.scopeWithheld");

  if (tone === "inline") {
    return (
      <span
        className={cn("mt-1 block text-[11px] leading-snug", className)}
        data-testid="sp-credential-scope"
      >
        <span className="font-semibold">{pt("rec.scopeLimited")}</span>
        <span aria-hidden="true"> · </span>
        <span>{detail}</span>
      </span>
    );
  }

  return (
    <p
      className={cn(
        "rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground",
        className,
      )}
      data-testid="sp-credential-scope"
    >
      <span className="font-medium">{pt("rec.scopeLimited")}</span> {detail}
    </p>
  );
}
