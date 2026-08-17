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
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

function jurisdictionName(code: string, sweden: string): string {
  return code === "SE" ? sweden : code;
}

export function JurisdictionNotice({
  credentialJurisdiction,
  viewingJurisdiction,
  className,
}: {
  credentialJurisdiction: string;
  viewingJurisdiction: string;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const sweden = pt("jurisdiction.SE");
  const differs = credentialJurisdiction !== viewingJurisdiction;

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
            {pt("claims.jurisdiction")}: {jurisdictionName(credentialJurisdiction, sweden)}
            {differs
              ? ` · ${pt("jurisdiction.viewingFrom")}: ${jurisdictionName(viewingJurisdiction, sweden)}`
              : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
