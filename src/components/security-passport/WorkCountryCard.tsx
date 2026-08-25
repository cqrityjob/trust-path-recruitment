// Where the holder works — permanently visible, permanently editable.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// The work country was only ever askable inside the onboarding wizard. Once a
// holder had been through it, there was no screen anywhere in the product that
// showed which country their Passport was speaking about, and no way to change
// it. The Product Owner went looking for where a UK or UAE holder states their
// country and could not find one — which is the correct conclusion, because
// there wasn't one.
//
// A Passport asserts things about a person in a jurisdiction. The jurisdiction
// has to be as visible and as correctable as the credentials are.
//
// ── WHY IT IS ON "MY INFORMATION" ──────────────────────────────────────
//
// That tab is already the holder's own editable record — employment, courses,
// languages, skills. The country belongs with the rest of what they maintain
// about themselves, not hidden behind a wizard they have already finished.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────
//
// Choosing a country grants no market. The credential form still builds its own
// list from the ACTIVE market packs, so a holder who selects the United Kingdom
// here will still find no UK credential to record — and the note below says so
// before they go looking, rather than letting them discover it as an absence.

import { useState } from "react";
import { Globe } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { ONBOARDING_STEPS } from "@/lib/security-passport/onboarding";
import { formatWorkLocation } from "@/lib/security-passport/format";

/** The same options the onboarding step offers, read from the same source so
 *  the two can never drift into offering different countries. */
const WORK_COUNTRY_OPTIONS =
  ONBOARDING_STEPS.find((s) => s.id === "jurisdiction")?.fields[0]?.options ?? [];

export function WorkCountryCard({
  jurisdictionCode,
  subJurisdictionCode,
  confirmed,
  onSave,
}: {
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
  /** False for a new Passport AND for a legacy row still carrying the old
   *  `DEFAULT 'SE'`. Both are "nobody has told us", and both are asked. */
  readonly confirmed: boolean;
  /** The route owns the server call. Every Passport component is kept clear of
   *  the server tier — `passport-separation-check` enforces it — so the
   *  presentation stays pure and testable and there is exactly one place that
   *  knows how a work country is written. */
  readonly onSave: (workCountry: string) => Promise<void>;
}) {
  const { pt, lang } = usePassportCopy();

  // Pre-selects the stored value even when it is UNCONFIRMED, so a legacy
  // Swedish holder confirming Sweden does not have to hunt for it — while the
  // heading above still refuses to present it as current truth until they do.
  const stored = subJurisdictionCode ?? jurisdictionCode ?? "";
  const [choice, setChoice] = useState<string>(stored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function submit() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(choice);
      setSavedAt(new Date().toISOString().slice(0, 16).replace("T", " "));
    } catch (err) {
      console.error("[passport] work country save failed", err);
      setError(pt("live.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-background p-5 md:p-6">
      <header className="flex items-center gap-2">
        <Globe aria-hidden="true" className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">
          {pt("workCountry.title")}
        </h2>
      </header>

      <p className="mt-3 text-sm text-foreground">
        <span className="text-muted-foreground">{pt("workCountry.current")}: </span>
        {confirmed
          ? formatWorkLocation(jurisdictionCode, subJurisdictionCode, lang)
          : pt("common.notStated")}
      </p>

      {/* The same sentence a new holder gets. A legacy row reads 'SE' that
          nobody chose, so it is asked exactly as if it were empty. */}
      {!confirmed ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {pt("jurisdiction.confirmPrompt")}
        </p>
      ) : null}

      <div className="mt-4 max-w-md">
        <label htmlFor="sp-work-country" className="block text-sm font-medium text-foreground">
          {pt("onboarding.jurisdiction.field")}
        </label>
        <select
          id="sp-work-country"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <option value="">—</option>
          {WORK_COUNTRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Said BEFORE they go looking for a credential that is not there. */}
      <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {pt("jurisdiction.workCountryAvailability")}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !choice || choice === stored}
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {busy ? pt("live.saving") : pt("workCountry.save")}
        </button>
        {savedAt ? (
          <span className="text-xs text-muted-foreground" role="status">
            {pt("cred.action.savedAt")} · {savedAt}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
