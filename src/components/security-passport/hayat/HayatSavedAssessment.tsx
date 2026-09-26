// HAYAT — the saved check, on the credential's own page.
//
// What a holder sees when they REOPEN a credential. Three things it must never
// blur:
//
//   * "checked, and still current"  vs  "checked once, no longer current".
//     A credential that was corrected, whose document was withdrawn, or whose
//     check has aged out keeps the old result -- labelled as HISTORY, with the
//     reason, and with the way forward.
//   * a HAYAT check  vs  the credential's trust level. This card sits beside the
//     verification panel and says in words that it does not change it.
//   * nothing checked  vs  something failed. With no saved check the card says
//     exactly that, and that an attached document is evidence, not verification.

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, ShieldQuestion } from "lucide-react";
import type { SavedAssessment } from "@/lib/security-passport/hayat/hayat.functions";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

export function HayatSavedAssessment({
  claimId,
  onLoad,
  onRecheck,
}: {
  claimId: string;
  onLoad: (claimId: string) => Promise<SavedAssessment | null>;
  /** Re-runs the check against the same source. Resolves when it has been saved. */
  onRecheck: (claimId: string) => Promise<unknown>;
}) {
  const { pt, lang } = usePassportCopy();
  const [saved, setSaved] = useState<SavedAssessment | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [outage, setOutage] = useState(false);

  const load = useCallback(async () => {
    try {
      setSaved(await onLoad(claimId));
    } catch {
      setSaved(null);
    }
  }, [claimId, onLoad]);
  useEffect(() => {
    void load();
  }, [load]);

  if (saved === undefined) return null;
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  const recheck = async () => {
    setBusy(true);
    setOutage(false);
    try {
      const result = (await onRecheck(claimId)) as { decision?: { status?: string } } | undefined;
      // An outage is shown, not stored: the saved check is unchanged.
      setOutage(result?.decision?.status === "temporarily_unavailable");
      await load();
    } catch {
      setOutage(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      data-hayat-saved
      data-hayat-saved-status={saved?.status ?? "none"}
      data-hayat-saved-current={saved ? String(saved.isCurrent) : "none"}
      className="rounded-xl border border-border bg-card p-5 text-sm"
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <ShieldQuestion size={14} aria-hidden="true" />
        {pt("hayat.saved.title")}
      </p>
      {!saved ? (
        <p className="mt-2 text-muted-foreground">{pt("hayat.saved.none")}</p>
      ) : (
        <>
          {!saved.isCurrent && (
            <p
              className="mt-3 flex items-center gap-2 font-medium"
              data-hayat-saved-history={saved.notCurrentReason ?? "unknown"}
            >
              <History size={16} aria-hidden="true" />
              {pt("hayat.saved.historical")}
            </p>
          )}
          <p className={saved.isCurrent ? "mt-2 font-medium" : "mt-1 text-muted-foreground"}>
            {pt(`hayat.verify.status.${saved.status}` as PassportCopyKey)}
          </p>
          <p className="mt-1 text-muted-foreground">
            {pt(`hayat.verify.reason.${saved.reasons[0] ?? "not_evaluated"}` as PassportCopyKey)}
          </p>
          {!saved.isCurrent && saved.notCurrentReason && (
            <p className="mt-2 text-foreground">
              {saved.notCurrentReason === "recheck_needed"
                ? pt("hayat.verify.reason.evidence_too_old")
                : pt(`hayat.saved.invalidated.${saved.notCurrentReason}` as PassportCopyKey)}
            </p>
          )}
          {saved.status === "verified" && saved.scopeLimits.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              <p>{pt("hayat.verify.scope.title")}</p>
              <ul className="mt-1 list-disc pl-5">
                {saved.scopeLimits.map((limit) => (
                  <li key={limit}>{pt(`hayat.verify.scope.${limit}` as PassportCopyKey)}</li>
                ))}
              </ul>
            </div>
          )}
          {saved.bindingLevel === "email_control" && (
            <p className="mt-2 text-xs text-muted-foreground">{pt("hayat.verify.binding.email")}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground" data-hayat-saved-checked>
            {pt("hayat.saved.checkedAt").replace("{date}", date(saved.checkedAt))}
            {" · "}
            {saved.ruleVersion}
          </p>
          {/* The check's own details: which check, how it was made, and what a
              reference is NOT. Holder-only, like the whole card. */}
          <details className="mt-2 text-xs text-muted-foreground" data-hayat-saved-details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-foreground">
              {pt("hayat.saved.details")}
            </summary>
            <dl className="mt-1 grid gap-1">
              <div>
                <dt className="inline">{pt("hayat.saved.reference")}: </dt>
                <dd className="inline break-all font-mono" data-hayat-check-reference>
                  {saved.id}
                </dd>
              </div>
              <div>
                <dt className="inline">{pt("hayat.saved.method")}: </dt>
                <dd className="inline">
                  {pt(`hayat.saved.method.${saved.sourceKind}` as PassportCopyKey)}
                </dd>
              </div>
            </dl>
            <p className="mt-1">{pt("hayat.saved.referenceNote")}</p>
          </details>
          {outage && (
            <p role="status" className="mt-2 text-foreground" data-hayat-saved-outage>
              {pt("hayat.verify.unavailableCall")}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void recheck()}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm disabled:opacity-50"
          >
            {busy && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
            {pt(busy ? "hayat.saved.rechecking" : "hayat.saved.recheck")}
          </button>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{pt("hayat.saved.notStatus")}</p>
    </section>
  );
}
