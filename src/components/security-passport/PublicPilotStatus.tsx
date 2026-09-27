// The three statements a PUBLIC PILOT market makes (20261220090000).
//
// A public pilot opens registration to every signed-in holder while the
// market's legal review is still pending. That is three facts, and they stay
// three sentences wherever a public-pilot catalogue is offered — the entry
// page, the credential wizard and the overview — so no surface can merge them
// into one line that reads as approval:
//
//   1. who may register: every registered user, with no individual grant;
//   2. that the legal review of the market's rules is still pending;
//   3. that registering a credential is not a permission to work.

import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

/** Rendered by every surface that offers a public-pilot catalogue. */
export function PublicPilotStatus({ className }: { readonly className?: string }) {
  const { pt } = usePassportCopy();
  return (
    <div
      data-testid="market-public-pilot-status"
      className={cn("rounded-lg border border-border bg-secondary/40 p-3", className)}
    >
      <p className="text-sm font-medium text-foreground" data-public-pilot-statement="availability">
        {pt("market.publicPilot.status")}
      </p>
      <p
        className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground"
        data-public-pilot-statement="legal-review"
      >
        {pt("market.publicPilot.legalReview")}
      </p>
      <p
        className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground"
        data-public-pilot-statement="not-permission"
      >
        {pt("market.publicPilot.notPermission")}
      </p>
    </div>
  );
}
