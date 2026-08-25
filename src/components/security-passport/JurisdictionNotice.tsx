// Jurisdiction, stated adjacent to the credential it governs.
//
// A verified Swedish Väktare history is real evidence anywhere. A Swedish
// Väktarlegitimation is a Swedish authorisation and nothing else. The whole
// job of this component is to keep those two sentences from merging
// (Product Architecture v1.1 §16).
//
// No international equivalence is computed, suggested or implied — there is
// no mapping table here and there must never be one. When the viewer's
// jurisdiction differs from the credential's, the difference is named
// rather than resolved.

import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatJurisdiction } from "@/lib/security-passport/format";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

export function JurisdictionNotice({
  credentialJurisdiction,
  viewingJurisdiction,
  className,
}: {
  /** NULL when the holder has not stated a work country. */
  credentialJurisdiction: string | null;
  viewingJurisdiction: string | null;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();

  // Nothing truthful can be said about where an authorisation applies when
  // nobody has said which country it is from. The notice used to be reached
  // with a jurisdiction defaulted to "SE", so it confidently announced "Gäller
  // i Sverige" over a holder who had never mentioned Sweden. Rendering nothing
  // is the honest state: the country step asks for it, and the notice returns
  // as soon as it is answered.
  if (!credentialJurisdiction) return null;

  const differs = viewingJurisdiction !== null && credentialJurisdiction !== viewingJurisdiction;

  return (
    <section
      className={cn(
        "rounded-lg border p-4",
        differs
          ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
          : "border-border bg-secondary/40",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Globe
          aria-hidden="true"
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            differs ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-semibold",
              differs ? "text-amber-900 dark:text-amber-200" : "text-foreground",
            )}
          >
            {differs ? pt("jurisdiction.crossBorderTitle") : pt("jurisdiction.title")}
          </p>

          <p
            className={cn(
              "mt-1 text-sm leading-relaxed",
              differs ? "text-amber-900/90 dark:text-amber-200/90" : "text-muted-foreground",
            )}
          >
            {differs
              ? pt("jurisdiction.crossBorderBody")
              : pt("jurisdiction.experienceVsEligibility")}
          </p>

          <p
            className={cn(
              "mt-2 text-xs",
              differs ? "text-amber-900/80 dark:text-amber-200/80" : "text-muted-foreground",
            )}
          >
            {pt("claims.jurisdiction")}: {formatJurisdiction(credentialJurisdiction, lang)}
            {differs
              ? ` · ${pt("jurisdiction.viewingFrom")}: ${formatJurisdiction(viewingJurisdiction, lang)}`
              : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
