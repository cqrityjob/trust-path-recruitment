// Security Passport — where does this credential come from?
//
// The first question in the add-credential flow, and it is first on purpose.
//
// ── WHY COUNTRY BEFORE CREDENTIAL ──────────────────────────────────────
//
// The form used to ask which credential, then ask which country as an
// afterthought two sections down. That ordering is not a layout preference; it
// is a claim about the world. It says there is ONE list of security
// credentials and a country is a property of the one you picked — so a holder
// in Manchester was shown VU1, VU2, Ordningsvakt and Skyddsvakt, and the only
// thing standing between them and recording a Swedish förordnande was that
// they would probably notice.
//
// A regulated credential belongs to a jurisdiction. Ask the jurisdiction
// first, and the credential list becomes an answer to a question the holder
// has already asked, rather than a menu that happens to be Swedish.
//
// ── THE THREE STATES ARE THE POINT OF THIS COMPONENT ───────────────────
//
// The easy version of this screen offers only the markets that work. That is
// what the old `listSelectableMarkets` did, and because Sweden is the only
// active pack, the country select had exactly one option — which is
// indistinguishable, on screen, from a product that only knows about Sweden.
//
// So every country and every emirate the registry knows is offered, and the
// ones that are not ready say why:
//
//   supported      — pick a credential.
//   pending_review — the catalogue exists and no lawyer has signed it off.
//   not_supported  — nobody here has read this place's rules, and nothing is
//                    being guessed on its behalf.
//
// What is never done is fall back. An unsupported emirate does not inherit
// Dubai's catalogue, an unsupported country does not inherit Sweden's, and
// there is no "other" option that quietly means Swedish.
//
// ── PURE COMPONENT ─────────────────────────────────────────────────────
//
// No server import, no Supabase, no navigation, exactly like CredentialForm.
// The route wires the real jurisdiction tree; the dev harness wires fixtures.

import { Globe, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

/** Mirrors `MarketSupportState` in credentials.functions.ts. Declared
 *  structurally so this component keeps no database dependency. */
export type PickerSupportState = "supported" | "pending_review" | "not_supported";

export interface PickerSubJurisdiction {
  readonly code: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly supportState: PickerSupportState;
}

export interface PickerJurisdiction {
  readonly jurisdictionCode: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly nationalState: PickerSupportState;
  readonly requiresSubJurisdiction: boolean;
  readonly subJurisdictions: readonly PickerSubJurisdiction[];
}

/** What the holder has chosen so far. `subJurisdictionCode` null means "the
 *  country itself", which is a valid answer for Sweden and Great Britain and
 *  an incomplete one for the UAE. */
export interface MarketChoice {
  readonly jurisdictionCode: string;
  readonly subJurisdictionCode: string | null;
}

export interface JurisdictionPickerProps {
  readonly jurisdictions: readonly PickerJurisdiction[];
  readonly value: MarketChoice | null;
  /** The resolved state of `value`, from the server. Null while unresolved. */
  readonly resolvedState: PickerSupportState | null;
  readonly busy: boolean;
  onChange: (choice: MarketChoice | null) => void;
}

const selectClass =
  "mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-80";

export function JurisdictionPicker({
  jurisdictions,
  value,
  resolvedState,
  busy,
  onChange,
}: JurisdictionPickerProps) {
  const { pt, lang } = usePassportCopy();
  const name = (x: { nameSv: string; nameEn: string }) => (lang === "sv" ? x.nameSv : x.nameEn);

  const country = value
    ? (jurisdictions.find((j) => j.jurisdictionCode === value.jurisdictionCode) ?? null)
    : null;

  // The region step appears when the country HAS regions at all — not only
  // when it requires one. Northern Ireland licenses vehicle immobilisation and
  // Great Britain does not, so a UK holder must be able to say which; they are
  // simply not forced to, because the seven Great Britain sectors resolve
  // against the national pack.
  const showRegions = country !== null && country.subJurisdictions.length > 0;

  const region =
    country && value?.subJurisdictionCode
      ? (country.subJurisdictions.find((s) => s.code === value.subJurisdictionCode) ?? null)
      : null;

  function pickCountry(code: string) {
    if (code === "") {
      onChange(null);
      return;
    }
    const next = jurisdictions.find((j) => j.jurisdictionCode === code) ?? null;
    if (!next) return;
    // Changing country always clears the region. Carrying 'AE-DU' across to
    // the United Kingdom would be storing a Dubai emirate on a British claim,
    // and the database would refuse it — after the holder had filled the form.
    onChange({ jurisdictionCode: code, subJurisdictionCode: null });
    void next;
  }

  function pickRegion(code: string) {
    if (!value) return;
    onChange({
      jurisdictionCode: value.jurisdictionCode,
      subJurisdictionCode: code === "" ? null : code,
    });
  }

  // What the holder has actually landed on: the region's state when they
  // picked one, the country's otherwise. `resolvedState` from the server wins
  // when present, because it is the same lookup the write path will do.
  const effectiveState: PickerSupportState | null =
    resolvedState ?? (region ? region.supportState : country ? country.nationalState : null);

  const needsRegion =
    country !== null && country.requiresSubJurisdiction && value?.subJurisdictionCode == null;

  return (
    <section aria-label={pt("cred.market.step1")} className="space-y-4">
      <div className="rounded-lg border border-border bg-secondary/40 p-3">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
          <Globe aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {pt("cred.market.why")}
        </p>
      </div>

      <h3 className="text-base font-semibold tracking-tight text-foreground">
        {pt("cred.market.step1")}
      </h3>

      {/* ── Step 1: the country ─────────────────────────────────────── */}
      <div>
        <label htmlFor="sp-cred-country" className="block text-sm font-medium text-foreground">
          {pt("cred.market.countryLabel")}
        </label>
        <select
          id="sp-cred-country"
          disabled={busy}
          value={value?.jurisdictionCode ?? ""}
          onChange={(e) => pickCountry(e.target.value)}
          className={selectClass}
        >
          <option value="">{pt("cred.market.choose")}</option>
          {jurisdictions.map((j) => (
            <option key={j.jurisdictionCode} value={j.jurisdictionCode}>
              {name(j)}
            </option>
          ))}
        </select>
      </div>

      {/* ── Step 2: the region, where the regulator is sub-national ─── */}
      {showRegions && country ? (
        <div>
          <label htmlFor="sp-cred-region" className="block text-sm font-medium text-foreground">
            {country.requiresSubJurisdiction
              ? pt("cred.market.emirateQuestion")
              : pt("cred.market.regionQuestion")}
          </label>
          <select
            id="sp-cred-region"
            disabled={busy}
            value={value?.subJurisdictionCode ?? ""}
            onChange={(e) => pickRegion(e.target.value)}
            aria-describedby={country.requiresSubJurisdiction ? "sp-cred-region-help" : undefined}
            className={selectClass}
          >
            {/* The empty option means "the country itself" where that is a
                real answer, and "not chosen yet" where it is not. */}
            <option value="">
              {country.requiresSubJurisdiction
                ? pt("cred.market.choose")
                : pt("cred.market.nationalOption")}
            </option>
            {country.subJurisdictions.map((s) => (
              <option key={s.code} value={s.code}>
                {name(s)}
              </option>
            ))}
          </select>
          {country.requiresSubJurisdiction ? (
            <p id="sp-cred-region-help" className="mt-1 text-xs text-muted-foreground">
              {pt("cred.market.emirateNotice")}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── The honest states ───────────────────────────────────────────
             `needsRegion` deliberately renders NOTHING here. The same
             sentence is already the select's own aria-describedby help text
             directly above, and showing it twice made "choose an emirate"
             look like an error the holder had committed rather than the next
             question. Not having answered yet is not a problem state. */}
      {needsRegion ? null : effectiveState === "pending_review" ? (
        <StateNotice tone="warn" text={pt("cred.market.pending")} />
      ) : effectiveState === "not_supported" && (country || region) ? (
        <StateNotice
          tone="warn"
          text={
            region || country?.requiresSubJurisdiction
              ? pt("cred.market.unsupportedEmirate")
              : pt("cred.market.unsupportedCountry")
          }
        />
      ) : null}
    </section>
  );
}

function StateNotice({ tone, text }: { tone: "info" | "warn"; text: string }) {
  const { pt } = usePassportCopy();
  const warn = tone === "warn";
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border p-4",
        warn
          ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
          : "border-border bg-secondary/40",
      )}
    >
      <div className="flex items-start gap-3">
        <Info
          aria-hidden="true"
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm leading-relaxed",
              warn ? "text-amber-900 dark:text-amber-200" : "text-foreground",
            )}
          >
            {text}
          </p>
          {warn ? (
            <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
              {pt("cred.market.chooseAnother")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
