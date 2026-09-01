// Security Passport — finding the employer who can confirm an employment.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ───────────────────────────────────
//
// This module ORDERS organisations. It does not identify them.
//
// A candidate writes "Nordvakt AB" onto an employment period. Somewhere in
// CQrityjob there may be an organisation called "Nordvakt AB", and there may
// also be "Nord Vakt AB" and "Nordvakt Sverige AB". Nothing in this file, and
// nothing anywhere else in the product, is permitted to conclude that any of
// them is the company the candidate worked for. That is a statement about
// legal identity, and CQrityjob does not know it.
//
// So the contract is deliberately small:
//
//   IN   the employer name the candidate typed, the country of the
//        employment, whatever the candidate typed into the search box, and
//        the organisations the database already lets this candidate see.
//   OUT  a ranked list, each entry carrying WHY it is in the list.
//
// No score crosses this boundary, no threshold decides anything, and no
// caller may treat a returned suggestion as a selection. The candidate
// selects; the platform constrains; the employer confirms.
//
// ── WHY THE DEFAULT LIST IS SHORT, NOT LONG ────────────────────────────
//
// The picker this replaces read every organisation the candidate could see,
// alphabetically, and preselected the first one. For a candidate whose
// employer was "Nordvakt AB", the control opened on "Alfa Bevakning AB" —
// an unrelated company, already selected, one click from being asked to
// confirm employment it knows nothing about.
//
// The fix is not a better sort over the same list. It is a smaller list. An
// organisation appears by DEFAULT only when a signal ties it to this specific
// employment: the same name, or a shared distinctive word in the same
// country. Everything else is reachable only by the candidate typing it,
// which is a search — an act — rather than a suggestion.
//
// ── WHY NO SIMILARITY SCORE IS RETURNED ────────────────────────────────
//
// A percentage is an invitation to believe the platform knows something. It
// does not. `MatchReason` is a small closed set of words a person can check
// against the row in front of them: this has the same name; this is in the
// same country; you searched for this. Anything a candidate cannot verify by
// looking has no business being shown to them.

/** The organisation as the candidate may see it, and no more.
 *
 *  Four fields, all of which are already public company information for any
 *  organisation this candidate can read at all. There is deliberately no
 *  place here for a member list, an administrator, a moderation state, a
 *  queue depth or an internal note: a field absent from the type cannot leak
 *  through a spread later. */
export interface EmployerCandidate {
  readonly id: string;
  readonly name: string;
  /** ISO-3166-1 alpha-2, as `employers.country` stores it. Null is a real
   *  answer — an organisation that has not stated a country — and is never
   *  filled in from the employment, which is a different fact. */
  readonly country: string | null;
  /** Public site, when the organisation published one. Shown so two
   *  same-named companies can be told apart by a person. */
  readonly website: string | null;
}

/** Why an organisation is in the list. Words, in a fixed order of strength.
 *
 *  `linked`       this employment has already been addressed to this
 *                 organisation before. The candidate made that link; this
 *                 only remembers it.
 *  `exact_name`   the normalised organisation name equals the normalised
 *                 employer name on the employment. NOT a claim that they are
 *                 the same company — see `normaliseName`.
 *  `same_country` a distinctive word in common, in the country of the
 *                 employment.
 *  `search`       the candidate typed something and this matched it. */
export type MatchReason = "linked" | "exact_name" | "same_country" | "search";

const REASON_RANK: Readonly<Record<MatchReason, number>> = {
  linked: 0,
  exact_name: 1,
  same_country: 2,
  search: 3,
};

export interface EmployerSuggestion {
  readonly employer: EmployerCandidate;
  readonly reason: MatchReason;
}

export interface MatchInput {
  /** The employer name written on the employment period, verbatim. */
  readonly employmentEmployerName: string;
  /** The country of the employment (the period's jurisdiction). Null when
   *  unknown; a null country never matches a country, in either direction.
   *
   *  Already a country and never a sub-jurisdiction: `sp_experience_periods`
   *  references `sp_jurisdictions`, which holds SE, GB and AE. The AE-DU /
   *  GB-NI distinction lives on CREDENTIALS, where flattening it would make a
   *  Dubai licence read as UAE-wide, and never reaches this comparison. So
   *  nothing here truncates a code, and nothing here should start to. */
  readonly employmentCountry: string | null;
  /** What the candidate typed. Empty string means they have typed nothing,
   *  which is different from having searched and found nothing. */
  readonly query: string;
  /** Organisations the database already permits this candidate to read.
   *  Filtering is the caller's job and the database's job; this function
   *  assumes every candidate in here is already allowed and already
   *  eligible. */
  readonly candidates: readonly EmployerCandidate[];
  /** An organisation this employment has already been addressed to, if any.
   *  Included in the ranking only when it is also present in `candidates` —
   *  an organisation that has stopped being visible or eligible is not
   *  resurrected by having once been asked. */
  readonly linkedEmployerId?: string | null;
}

/** How many suggestions a caller gets back. A picker is a list a person
 *  reads, and past roughly this many the reading stops and the guessing
 *  starts. `rankEmployerMatches` reports when it has trimmed, so the caller
 *  can say so rather than presenting a truncated list as the whole answer. */
export const MAX_SUGGESTIONS = 20;

export interface MatchResult {
  readonly suggestions: readonly EmployerSuggestion[];
  /** True when matches were found and cut to `MAX_SUGGESTIONS`. The caller
   *  must tell the candidate to narrow the search rather than let them
   *  believe they are looking at everything. */
  readonly truncated: boolean;
}

/** Legal-form words. Present so "Nordvakt AB" and "Nordvakt" share a
 *  distinctive word rather than sharing "AB" with every other Swedish
 *  company. Removed only when deciding what is DISTINCTIVE — never when
 *  deciding what is EXACT, because "Nordvakt AB" and "Nordvakt Ltd" are not
 *  the same name and this file must not be the place that says they are. */
const LEGAL_FORM_WORDS: ReadonlySet<string> = new Set([
  "ab",
  "aktiebolag",
  "as",
  "asa",
  "aps",
  "bv",
  "co",
  "company",
  "corp",
  "corporation",
  "dwc",
  "fz",
  "fze",
  "fzco",
  "fzc",
  "fzllc",
  "gmbh",
  "group",
  "hb",
  "holding",
  "inc",
  "incorporated",
  "kb",
  "limited",
  "llc",
  "llp",
  "ltd",
  "nv",
  "oy",
  "plc",
  "sa",
  "sarl",
  "sl",
  "srl",
]);

/**
 * The name, reduced to what a person would call the same spelling.
 *
 * Case, accents, punctuation and runs of whitespace are noise: "Nordvakt AB",
 * "nordvakt ab" and "Nordvakt  AB." are one spelling written three ways, and
 * a candidate should not have to reproduce the registry's punctuation to find
 * their own employer.
 *
 * What is NOT removed is the rest of the words. "Nord Vakt AB" keeps its
 * space, "Nordvakt Sverige AB" keeps "sverige", and neither is equal to
 * "nordvakt ab". Three separately registered companies stay three rows. This
 * is the whole of section 9 of the product rule expressed in one function:
 * normalising spelling is a courtesy to a typist, and collapsing distinct
 * names would be an assertion about legal identity.
 */
export function normaliseName(name: string): string {
  return (
    name
      .normalize("NFD")
      // Combining marks, written as escapes rather than as the characters
      // themselves: a literal combining accent in source is invisible in a diff
      // and survives a careless editor by luck. A/A/O fold to a/a/o, which is
      // what a candidate typing on a foreign keyboard needs and what a Swedish
      // candidate loses nothing by.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

/** The words in a name that could plausibly identify a company, in order.
 *  Legal forms and one-character fragments are dropped: neither tells two
 *  organisations apart, and matching on them is how "AB" becomes a match. */
export function distinctiveWords(name: string): readonly string[] {
  return normaliseName(name)
    .split(" ")
    .filter((w) => w.length > 1 && !LEGAL_FORM_WORDS.has(w));
}

/** Two countries are the same country only when both are stated. A null on
 *  either side is unknown, and unknown is not a match — an organisation that
 *  never said where it is must not be promoted into the same-country bucket
 *  on the strength of having said nothing. */
function sameCountry(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/**
 * Rank the organisations a candidate may address, and say why.
 *
 * Deterministic: the same inputs give the same list in the same order, on any
 * machine, in any locale. Ordering inside a bucket is by normalised name and
 * then by id — never by `localeCompare`, whose answer depends on where the
 * process is running, and never by a similarity number.
 *
 * An organisation appears once, under the strongest reason that applies to
 * it. `linked` outranks `exact_name` because the candidate has already made
 * that choice for this employment, and repeating a choice is not the same act
 * as making one.
 */
export function rankEmployerMatches(input: MatchInput): MatchResult {
  const { employmentEmployerName, employmentCountry, candidates, linkedEmployerId } = input;

  const query = input.query.trim();
  const normalisedQuery = normaliseName(query);
  const normalisedEmployment = normaliseName(employmentEmployerName);
  const employmentWords = new Set(distinctiveWords(employmentEmployerName));

  const reasonFor = (c: EmployerCandidate): MatchReason | null => {
    if (linkedEmployerId && c.id === linkedEmployerId) return "linked";

    const normalisedCandidate = normaliseName(c.name);
    if (normalisedEmployment !== "" && normalisedCandidate === normalisedEmployment) {
      return "exact_name";
    }

    // A shared distinctive word, in the country the employment happened in.
    // Both halves are required. "Nordvakt Dubai LLC" shares "nordvakt" with a
    // Swedish employment and is NOT suggested for it: a company operating
    // under a related name in another country is a different legal person,
    // and suggesting it by default is the auto-linking this product refuses.
    // It stays findable — by being typed.
    if (
      employmentWords.size > 0 &&
      sameCountry(c.country, employmentCountry) &&
      distinctiveWords(c.name).some((w) => employmentWords.has(w))
    ) {
      return "same_country";
    }

    // Only what the candidate actually typed. Substring on the normalised
    // name, so "nordv" finds "Nordvakt AB" — and an empty box finds nothing,
    // which is the point: no query means no search results, not every result.
    if (normalisedQuery !== "" && normalisedCandidate.includes(normalisedQuery)) {
      return "search";
    }

    return null;
  };

  const matched: EmployerSuggestion[] = [];
  for (const c of candidates) {
    const reason = reasonFor(c);
    if (reason !== null) matched.push({ employer: c, reason });
  }

  matched.sort((a, b) => {
    const byReason = REASON_RANK[a.reason] - REASON_RANK[b.reason];
    if (byReason !== 0) return byReason;
    // Code-point order, not `localeCompare`: the latter's answer depends on
    // the collation of whichever machine the process happens to be running
    // on, and a picker that orders differently on a developer's laptop and on
    // the server is a picker no test can pin down.
    const an = normaliseName(a.employer.name);
    const bn = normaliseName(b.employer.name);
    if (an !== bn) return an < bn ? -1 : 1;
    return a.employer.id < b.employer.id ? -1 : a.employer.id > b.employer.id ? 1 : 0;
  });

  return {
    suggestions: matched.slice(0, MAX_SUGGESTIONS),
    truncated: matched.length > MAX_SUGGESTIONS,
  };
}

/**
 * The search terms worth sending to the database for ONE employment.
 *
 * The candidate's own typing, plus each distinctive word of the employer name
 * they wrote down. Bounded at four terms because this becomes an `ilike` per
 * term and an employment named by a sentence is not a reason to scan the
 * organisation table four ways more.
 *
 * Returned as plain strings; escaping for whatever query language the caller
 * speaks is the caller's job, and doing it here would hide it.
 */
export function employerSearchTerms(
  employmentEmployerName: string,
  query: string,
): readonly string[] {
  const terms: string[] = [];
  const typed = query.trim();
  if (typed.length >= 2) terms.push(typed);
  for (const w of distinctiveWords(employmentEmployerName)) {
    if (!terms.some((t) => normaliseName(t) === w)) terms.push(w);
    if (terms.length >= 4) break;
  }
  return terms;
}
