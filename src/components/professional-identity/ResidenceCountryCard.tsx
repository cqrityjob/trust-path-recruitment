// Where the holder LIVES -- any country, on the Profile, kept apart from
// where they work.
//
// ── WHY THIS CARD EXISTS ───────────────────────────────────────────────
//
// Residence was only ever askable inside the India setup (/passport/start),
// which a holder arriving from the ordinary sign-up never sees. Everybody
// else had no place to say which country they live in, and the only country
// selector they met was the work-country one, whose list is the countries
// the Passport has market rules for. A person living in Norway, Kenya or
// Texas therefore had to leave both blank or pick a country that was not
// true. The product must never force the second.
//
// ── FOUR FACTS, THIS IS THE FIRST ──────────────────────────────────────
//
//   where they LIVE                this card        any ISO 3166-1 country
//   where they WORK now            WorkCountryCard  the governed market list
//   where they would LIKE to work  job preferences  a closed vocabulary
//   where a CREDENTIAL is valid    the definition   never a profile answer
//
// Choosing a country here grants nothing: no market, no catalogue, no
// permission to work. It is personal data with its own row and its own
// row-level boundary (candidate_current_location), read by no Passport,
// catalogue or sharing function. The card says so in one sentence.
//
// The list is the full ISO country list with the platform's own localised
// names (Intl.DisplayNames), the same list the India setup offers -- one
// source, so the two surfaces cannot disagree about which countries exist.

import { useState } from "react";
import { Home } from "lucide-react";
import { c, L, type Lang } from "./copy";
import { countryName, residenceOptions } from "@/lib/india-entry/destinations";

const COPY = {
  title: c("Bosättningsland", "Country of residence"),
  current: c("Nuvarande", "Current"),
  notStated: c("Inte angivet", "Not stated"),
  field: c("Land där du bor", "Country where you live"),
  locality: c("Stad eller delstat (valfritt)", "City or state (optional)"),
  // One sentence, because the fear is specific: that choosing a country
  // here changes what the Passport says about where somebody may work.
  separate: c(
    "Alla länder kan väljas. Var du bor är en egen uppgift: den ändrar inte ditt arbetsland, dina meriters land eller vilka kataloger som är öppna, och den säger inget om rätt att arbeta.",
    "Any country can be chosen. Where you live is its own fact: it changes neither your work country, nor the country of your credentials, nor which catalogues are open, and it says nothing about permission to work.",
  ),
  save: c("Spara bosättningsland", "Save country of residence"),
  saving: c("Sparar…", "Saving…"),
  saved: c("Sparat", "Saved"),
  error: c("Det gick inte att spara. Försök igen.", "Could not save. Try again."),
} as const;

export interface ResidenceCountryCardProps {
  readonly lang: Lang;
  /** ISO 3166-1 alpha-2, or null when the holder has not said. */
  readonly countryCode: string | null;
  readonly locality: string | null;
  /** The section owns the server call; this card is kept clear of the
   *  server tier like every other profile card. */
  readonly onSave: (value: { countryCode: string; locality: string | undefined }) => Promise<void>;
}

export function ResidenceCountryCard({
  lang,
  countryCode,
  locality,
  onSave,
}: ResidenceCountryCardProps) {
  const [choice, setChoice] = useState<string>(countryCode ?? "");
  const [place, setPlace] = useState<string>(locality ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const options = residenceOptions(lang);
  const unchanged = choice === (countryCode ?? "") && place.trim() === (locality ?? "");

  async function submit() {
    if (!choice) return;
    setBusy(true);
    setError(false);
    try {
      await onSave({ countryCode: choice, locality: place.trim() || undefined });
      setSavedAt(new Date().toISOString().slice(0, 16).replace("T", " "));
    } catch (err) {
      console.error("[profile] residence save failed", err);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-xl border border-border bg-background p-5 md:p-6"
      data-profile-residence-country
    >
      <header className="flex items-center gap-2">
        <Home aria-hidden="true" className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">
          {L(COPY.title, lang)}
        </h2>
      </header>

      <p className="mt-3 text-sm text-foreground" data-residence-current={countryCode ?? ""}>
        <span className="text-muted-foreground">{L(COPY.current, lang)}: </span>
        {countryCode
          ? [countryName(countryCode, lang), locality].filter(Boolean).join(", ")
          : L(COPY.notStated, lang)}
      </p>

      <div className="mt-4 grid max-w-md gap-4">
        <div>
          <label htmlFor="profile-residence-country" className="block text-sm font-medium text-foreground">
            {L(COPY.field, lang)}
          </label>
          <select
            id="profile-residence-country"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="profile-residence-locality" className="block text-sm font-medium text-foreground">
            {L(COPY.locality, lang)}
          </label>
          <input
            id="profile-residence-locality"
            value={place}
            maxLength={80}
            autoComplete="address-level2"
            onChange={(e) => setPlace(e.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
      </div>

      <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {L(COPY.separate, lang)}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !choice || unchanged}
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {busy ? L(COPY.saving, lang) : L(COPY.save, lang)}
        </button>
        {savedAt ? (
          <span className="text-xs text-muted-foreground" role="status">
            {L(COPY.saved, lang)} · {savedAt}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {L(COPY.error, lang)}
        </p>
      ) : null}
    </section>
  );
}
