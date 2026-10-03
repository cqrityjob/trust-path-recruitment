import type { IndexedDefinition } from "@/lib/security-passport/credential-catalogue-filters";
import {
  bylineOf,
  headlineOf,
  UNAVAILABLE_EXPLANATION,
  unavailableReasonLabel,
  type PickerLang,
} from "@/lib/security-passport/credential-picker";
import type { UnavailableDefinition } from "@/lib/security-passport/catalogue-requests.functions";

/** How many results are drawn before "Show more": a long catalogue is never one wall. */
export const RESULT_PAGE = 20;

/**
 * The credentials that MATCH, each named the way a holder recognises it —
 * "CPP — Certified Protection Professional" over "ASIS International ·
 * International certification" — so two awards with similar abbreviations are
 * told apart by their full name and their issuer, without opening anything.
 *
 * A native radio group: arrow keys move through the list, the accessible name
 * of each row is its headline and byline, and choosing one is the only way to
 * select a definition. The list shows only what the approved catalogue view
 * already allowed the holder to select; nothing here widens it.
 */
export function CredentialResultList({
  lang,
  results,
  selectedCode,
  limit,
  regulatorOf,
  placeName,
  onSelect,
  onMore,
}: {
  lang: PickerLang;
  results: readonly IndexedDefinition[];
  selectedCode: string;
  limit: number;
  regulatorOf: (d: IndexedDefinition) => string | null;
  placeName: (code: string | null) => string;
  onSelect: (code: string) => void;
  onMore: () => void;
}) {
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const shown = results.slice(0, limit);
  if (!results.length) return null;
  return (
    <fieldset className="min-w-0" data-credential-results>
      <legend className="sr-only">{copy("Matchande meriter", "Matching credentials")}</legend>
      <ul className="space-y-2">
        {shown.map((d) => {
          const headline = headlineOf(d, lang);
          const checked = d.code === selectedCode;
          return (
            <li key={d.code}>
              <label
                data-credential-code={d.code}
                data-result
                className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${checked ? "border-accent bg-accent/5" : "border-border bg-background hover:bg-secondary/40"} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring`}
              >
                <input
                  type="radio"
                  name="definition"
                  value={d.code}
                  checked={checked}
                  onChange={() => onSelect(d.code)}
                  className="mt-1.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block break-words font-medium" data-result-headline>
                    {headline.text}
                  </span>
                  <span
                    className="mt-0.5 block break-words text-sm text-muted-foreground"
                    data-result-byline
                  >
                    {bylineOf({ ...d, regulator: regulatorOf(d) }, lang, placeName)}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {results.length > limit && (
        <button
          type="button"
          data-results-more
          className="mt-3 min-h-11 rounded-md border border-input bg-background px-4 text-sm"
          onClick={onMore}
        >
          {copy(
            `Visa ${Math.min(RESULT_PAGE, results.length - limit)} till (${results.length - limit} kvar)`,
            `Show ${Math.min(RESULT_PAGE, results.length - limit)} more (${results.length - limit} left)`,
          )}
        </button>
      )}
    </fieldset>
  );
}

/**
 * What the research knows of but the catalogue has NOT approved. Never
 * selectable — there is no control that picks one — and every row says why, in a
 * controlled vocabulary shown in the holder's language. The only action is to
 * ask for it to be looked at, which sends a request and changes nothing else.
 */
export function UnavailableGroup({
  lang,
  items,
  onAsk,
}: {
  lang: PickerLang;
  items: readonly UnavailableDefinition[];
  onAsk: (item: UnavailableDefinition) => void;
}) {
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  if (!items.length) return null;
  return (
    <section
      data-unavailable-group
      aria-labelledby="unavailable-heading"
      className="rounded-lg border border-dashed border-border bg-secondary/20 p-4"
    >
      <h4 id="unavailable-heading" className="text-sm font-semibold">
        {copy("Inte tillgängliga ännu", "Not available yet")}
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">{UNAVAILABLE_EXPLANATION[lang]}</p>
      <ul className="mt-3 space-y-2">
        {items.map((u) => {
          const name = headlineOf(
            {
              name_sv: u.name,
              name_en: u.name,
              abbreviation: u.abbreviation,
              scope_code: "global_professional",
            },
            lang,
          );
          return (
            <li
              key={u.researchId}
              data-unavailable-item={u.researchId}
              className="rounded-md border border-border bg-background p-3 text-sm"
            >
              <p className="break-words font-medium">{name.text}</p>
              <p className="break-words text-muted-foreground">{u.issuer}</p>
              <p className="mt-1 text-xs" data-unavailable-reason>
                {unavailableReasonLabel(u.reason, lang)}
              </p>
              <button
                type="button"
                data-unavailable-ask
                className="mt-1 inline-flex min-h-11 items-center text-sm underline"
                onClick={() => onAsk(u)}
              >
                {copy("Be oss titta på den", "Ask us to look at it")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
