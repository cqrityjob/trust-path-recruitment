// Security Passport — choosing which organisation is asked to confirm an
// employment.
//
// ── WHAT THIS REPLACED ─────────────────────────────────────────────────
//
// A native `<select>`, populated with every organisation the candidate could
// see, sorted by name, with the first row already selected. Three properties
// of that control did real damage:
//
//   * IT OPENED ON AN ANSWER. `useState(employers[0]?.id ?? "")`. The picker
//     arrived with a company chosen — one the candidate had never looked at,
//     picked by the alphabet — and the button beside it said "Request".
//     Two clicks from page load, an unrelated company could be asked to
//     confirm employment it had never heard of.
//
//   * IT HAD NOTHING TO SEARCH. The employer a candidate actually worked for
//     had to be found by scrolling a list of everyone.
//
//   * IT SHOWED A NAME AND NOTHING ELSE. "Nordvakt AB" and "Nordvakt AB" in
//     two countries are two rows with one label.
//
// ── WHAT THIS DOES INSTEAD ─────────────────────────────────────────────
//
// Nothing is selected until the candidate selects it, and selecting is not
// submitting: choosing a row moves to a confirmation step that names the
// organisation and its country in full, and the request is created only from
// there. That is the whole of the wrong-employer safety rule — a request is
// never created by a highlight, a default or a keystroke.
//
// Each row carries a WORD saying why it is in the list. Never a percentage,
// never a score, never "AI match": a candidate can check "Exact match" and
// "Same country" against the row in front of them, and cannot check 87%.
//
// ── AND WHEN THE EMPLOYER IS NOT HERE ──────────────────────────────────
//
// There is an explicit route for it, and it tells the truth: employer
// confirmation needs the employer to have a CQrityjob organisation account,
// CQrityjob does not invite them and does not contact them, and the document
// review path — which is on this same panel, immediately above — is what is
// available instead. No invitation is sent and none is promised.

import { useState } from "react";
import { Building2, Search } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatJurisdiction } from "@/lib/security-passport/format";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type {
  EmployerCandidate,
  EmployerSuggestion,
  MatchReason,
} from "@/lib/security-passport/employer-matching";

/** The label for each reason, in the candidate's language. Words only — see
 *  the header. The map is exhaustive over `MatchReason`, so adding a reason
 *  without adding a label is a type error rather than a blank chip. */
const REASON_KEY: Readonly<Record<MatchReason, PassportCopyKey>> = {
  linked: "ver.employer.reason.linked",
  exact_name: "ver.employer.reason.exact_name",
  same_country: "ver.employer.reason.same_country",
  search: "ver.employer.reason.search",
};

/** What the picker asked for, and what came back.
 *
 *  `failed` and an empty `suggestions` are DIFFERENT STATES and are rendered
 *  as different sentences. "We could not run the search" and "there is no
 *  such employer here" lead a person to do different things, and collapsing
 *  them — which the old `if (error) return []` did — tells a candidate their
 *  employer is absent when the truth is that nobody looked. */
export interface EmployerSearchState {
  readonly suggestions: readonly EmployerSuggestion[];
  readonly truncated: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
}

export interface EmployerConfirmationPickerProps {
  readonly state: EmployerSearchState;
  /** Run the search for this text. Called whenever the candidate changes the
   *  box; the initial search belongs to the route, not to this component. */
  readonly onSearch: (query: string) => void;
  /** Create the request. Called only from the confirmation step. */
  readonly onConfirm: (employerId: string) => Promise<void>;
  /** True while a submission is in flight, so the confirm control cannot be
   *  pressed twice — the second press is exactly how a duplicate request
   *  gets attempted. */
  readonly busy: boolean;
}

/**
 * The step between choosing an organisation and asking it anything.
 *
 * Its own component, and exported, for a reason that is not tidiness: this is
 * the last thing a candidate reads before a real organisation is asked to
 * confirm their employment, and a surface that important has to be renderable
 * on its own so a guard can assert what it says. Reached only from the picker,
 * with an organisation a person clicked.
 *
 * It states the NAME and the COUNTRY, and the website when there is one,
 * because "Nordvakt AB" alone does not distinguish the Swedish company from
 * the one in the UAE -- which is the exact confusion this PR exists to remove
 * and would be a poor thing to reintroduce in the confirmation.
 */
export interface EmployerConfirmationStepProps {
  readonly employer: EmployerCandidate;
  readonly busy: boolean;
  /** Send the request. The ONLY control in this feature that does. */
  readonly onConfirm: () => void;
  /** Go back to the list without sending anything. */
  readonly onChange: () => void;
}

export function EmployerConfirmationStep({
  employer,
  busy,
  onConfirm,
  onChange,
}: EmployerConfirmationStepProps) {
  const { pt, lang } = usePassportCopy();
  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-4">
      <p className="text-sm font-medium text-foreground">{pt("ver.employer.confirmTitle")}</p>
      <p className="mt-2 flex items-center gap-2 text-base font-semibold text-foreground">
        <Building2 aria-hidden="true" className="h-4 w-4" />
        {employer.name}
      </p>
      <p className="text-sm text-muted-foreground">
        {employer.country
          ? formatJurisdiction(employer.country, lang)
          : pt("ver.employer.countryUnknown")}
      </p>
      {employer.website ? (
        <p className="text-sm text-muted-foreground">{employer.website}</p>
      ) : null}
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {pt("ver.employer.confirmBody")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {busy ? pt("ver.submitting") : pt("ver.employer.confirmAction")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onChange}
          className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("ver.employer.confirmChange")}
        </button>
      </div>
    </div>
  );
}

export function EmployerConfirmationPicker({
  state,
  onSearch,
  onConfirm,
  busy,
}: EmployerConfirmationPickerProps) {
  const { pt, lang } = usePassportCopy();
  const [query, setQuery] = useState("");
  // NOT an id, and NOT initialised from the list. The whole organisation, and
  // only once a person has chosen it. Holding the row rather than the id also
  // means the confirmation step names what was actually clicked, even if the
  // list underneath changes while the candidate is reading it.
  const [chosen, setChosen] = useState<EmployerCandidate | null>(null);
  const [notOnPlatform, setNotOnPlatform] = useState(false);

  // Deliberately a CONTROLLED component: it never fetches on mount and never
  // decides when a search is due. The route owns the search because the same
  // result also names the organisation an already-open request went to, which
  // has to be known when this picker is not on screen at all.
  const search = (next: string) => {
    setQuery(next);
    // A new search invalidates a choice made against the old one. Leaving it
    // selected would let the confirmation step name an organisation the
    // candidate can no longer see the row for.
    setChosen(null);
    onSearch(next);
  };

  const countryLabel = (c: EmployerCandidate): string =>
    c.country ? formatJurisdiction(c.country, lang) : pt("ver.employer.countryUnknown");

  /* ── STEP 2: confirm the organisation, by name and country ──────────
     Reached only by clicking a row. The request is created from this step and
     from nowhere else. */
  if (chosen) {
    return (
      <EmployerConfirmationStep
        employer={chosen}
        busy={busy}
        onConfirm={() => void onConfirm(chosen.id)}
        onChange={() => setChosen(null)}
      />
    );
  }

  /* ── STEP 1: search and choose ─────────────────────────────────────── */
  return (
    <div className="mt-3">
      <label htmlFor="sp-employer-search" className="block text-sm font-medium text-foreground">
        {pt("ver.employer.searchLabel")}
      </label>
      <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-background px-3">
        <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <input
          id="sp-employer-search"
          type="search"
          value={query}
          autoComplete="off"
          placeholder={pt("ver.employer.searchPlaceholder")}
          aria-describedby="sp-employer-search-help"
          onChange={(e) => search(e.target.value)}
          className="h-11 w-full bg-transparent text-sm text-foreground outline-none"
        />
      </div>
      <p id="sp-employer-search-help" className="mt-1 text-sm text-muted-foreground">
        {pt("ver.employer.searchHelp")}
      </p>

      {/* ── The three answers a search can have ────────────────────────
          Loading, refused, and empty. The middle one is the one this product
          kept getting wrong: a query the database refused used to arrive as
          "no employers found". */}
      {state.loading ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {pt("ver.employer.searching")}
        </p>
      ) : state.failed ? (
        <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3">
          <p role="alert" className="text-sm text-foreground">
            {pt("ver.employer.searchUnavailable")}
          </p>
          <button
            type="button"
            onClick={() => onSearch(query)}
            className="mt-2 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("ver.employer.searchRetry")}
          </button>
        </div>
      ) : state.suggestions.length === 0 ? (
        <div className="mt-3">
          <p role="status" className="text-sm text-foreground">
            {pt("ver.employer.noMatch")}
          </p>
          <p className="text-sm text-muted-foreground">{pt("ver.employer.noMatchHelp")}</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium text-foreground">{pt("ver.chooseEmployer")}</p>
          <ul className="mt-2 space-y-2">
            {state.suggestions.map((s) => (
              <li key={s.employer.id}>
                {/* A button, not an option in a listbox: choosing has to be a
                    deliberate act with a visible target, and a keyboard user
                    must not be able to change the selection by arrowing past
                    a row. */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setChosen(s.employer)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-input p-3 text-left hover:bg-secondary/50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {s.employer.name}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {countryLabel(s.employer)}
                      {s.employer.website ? ` · ${s.employer.website}` : ""}
                    </span>
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {pt(REASON_KEY[s.reason])}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* A trimmed list presented as the whole answer is a quiet lie. */}
          {state.truncated ? (
            <p className="mt-2 text-sm text-muted-foreground">{pt("ver.employer.moreMatches")}</p>
          ) : null}
        </>
      )}

      {/* ── "My employer is not on CQrityjob" ──────────────────────────
          Always available, whatever the search returned: a list with rows in
          it can still be a list without the candidate's employer in it. */}
      <div className="mt-3">
        <button
          type="button"
          aria-expanded={notOnPlatform}
          onClick={() => setNotOnPlatform((v) => !v)}
          className="text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("ver.employer.notOnPlatform")}
        </button>
        {notOnPlatform ? (
          <div className="mt-2 rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-sm font-medium text-foreground">
              {pt("ver.employer.notOnPlatformTitle")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {pt("ver.employer.notOnPlatformBody")}
            </p>
            {/* Said out loud, because the absence of a promise is not the same
                as a stated absence. A candidate who reads "not on CQrityjob"
                and hears nothing else will assume somebody is being told. */}
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {pt("ver.employer.notOnPlatformNoInvite")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {pt("ver.employer.notOnPlatformAlt")}
            </p>
            <button
              type="button"
              onClick={() => setNotOnPlatform(false)}
              className="mt-2 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pt("ver.employer.notOnPlatformClose")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
