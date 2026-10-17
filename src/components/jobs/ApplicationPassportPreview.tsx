// The holder's preview, in the application dialog, of exactly what the
// employer would read if this application carried the Security Passport.
//
// ── THE SAME CARD, NOT A DESCRIPTION OF IT ──────────────────────────────
//
// The counts and titles above the checkbox say what kind of thing is shared.
// This says what the employer will actually see: the payload comes from
// sp_preview_application_disclosure, which builds the would-be share through
// the employer's own payload builder and rolls it back, and it is drawn by
// buildRecipientPresentation and RecipientPassportCard, the pair
// ApplicationPassportPanel uses on the employer's side. A hand-written
// summary here would be a second reading of the package contract.
//
// ── IT SHARES NOTHING ───────────────────────────────────────────────────
//
// Opening the preview is not consent and changes nothing: no disclosure row,
// no access count, no link. It is read only when the holder asks for it, and
// a preview that cannot be built says so in one calm sentence -- applying is
// never blocked by it, and the checkbox beside it decides on its own.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { buildRecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import { previewApplicationDisclosure } from "@/lib/security-passport/application-disclosure.functions";
import { RecipientPassportCard } from "@/components/security-passport/live/RecipientPassportCard";

/** The reading date, as on the employer's panel: expiry is derived, so the
 *  preview says when it is reading. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ApplicationPassportPreview() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const previewFn = useServerFn(previewApplicationDisclosure);

  const query = useQuery({
    queryKey: ["passport", "application-preview"],
    queryFn: () => previewFn(),
    enabled: open,
    staleTime: 0,
  });

  const payload = query.data;
  const presentation = useMemo(
    () =>
      payload && payload.status === "active" ? buildRecipientPresentation(payload, today()) : null,
    [payload],
  );

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="apply-passport-preview"
        className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {open ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
        {open ? t("jobs.apply.passport.previewHide") : t("jobs.apply.passport.previewShow")}
      </button>

      {open ? (
        <div id="apply-passport-preview" data-testid="apply-passport-preview" className="mt-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("jobs.apply.passport.previewNote")}
          </p>
          {query.isPending ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("jobs.apply.passport.previewLoading")}
            </p>
          ) : presentation ? (
            <div className="mt-3 max-w-sm" data-testid="apply-passport-preview-card">
              <RecipientPassportCard presentation={presentation} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              {t("jobs.apply.passport.previewUnavailable")}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
