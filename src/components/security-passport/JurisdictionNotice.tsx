// Where the holder works, and what the product can record for that country.
//
// ── WHY THIS WAS REBUILT ───────────────────────────────────────────────
//
// It used to take a prop called `credentialJurisdiction` and be handed
// `holder.jurisdictionCode` — the holder's WORK COUNTRY. So a Dubai-based
// holder with a Swedish VU1 got a panel headed "Country and eligibility"
// reading "Jurisdiction: United Arab Emirates", directly above their Swedish
// credentials. Nothing there was false in isolation and the whole thing read as
// "these credentials are UAE credentials", which is the single claim this
// product exists to refuse.
//
// The two facts are now stated as two facts, each labelled:
//
//     Work country          where the holder works
//     Regulated credentials what CQrityjob can record for that country
//
// A CREDENTIAL's own jurisdiction is not shown here at all. It belongs on the
// credential, where `ClaimRow` already renders it through the shared formatter,
// so a Swedish credential says Sweden however far from Sweden its holder now
// lives.
//
// ── WHY THE SUPPORT LINE IS COPY AND NOT A QUERY ───────────────────────
//
// The authority on market availability is `sp_market_packs.is_active`, and it
// stays the authority: the credential form builds its selector from the active
// packs, and the database refuses a claim in a closed market whatever any
// screen says. This panel only has to TELL the holder, and a per-country
// sentence does that without adding a request to a page that already makes
// several. `passport-persona-journey-check` asserts the two agree — that
// exactly one market is open, and that the sentence for every closed one says
// so.

import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWorkLocation, workCountrySupportKey } from "@/lib/security-passport/format";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

/* The per-country sentence moved to `workCountrySupportKey` in
   lib/security-passport/format.ts when the credential form started needing the
   same one. Two components saying different things about the same closed
   market is precisely what the pilot tester met, so there is now one map. */

export function JurisdictionNotice({
  workCountry,
  subJurisdiction,
  className,
}: {
  /** The holder's CONFIRMED work country. NULL when they have not stated one. */
  workCountry: string | null;
  subJurisdiction: string | null;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();

  // Nothing truthful can be said about which market applies when nobody has
  // said which country the holder works in. The panel used to be reached with a
  // jurisdiction defaulted to "SE" and confidently announced "Gäller i
  // Sverige" over a holder who had never mentioned Sweden.
  if (!workCountry) return null;

  const supportKey = workCountrySupportKey(workCountry, subJurisdiction);

  return (
    <section className={cn("rounded-lg border border-border bg-secondary/40 p-4", className)}>
      <div className="flex items-start gap-3">
        <Globe aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("workCountry.title")}
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {formatWorkLocation(workCountry, subJurisdiction, lang)}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("workCountry.regulated")}
            </p>
            <p className="mt-0.5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
              {pt(supportKey)}
            </p>
          </div>

          {/* Says what a work country is NOT. Stating where somebody works is
              not a statement that they may legally work there, and a panel that
              pairs a country with the word "eligibility" invites exactly that
              reading. */}
          <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
            {pt("workCountry.notAuthorisation")}
          </p>
        </div>
      </div>
    </section>
  );
}
