// The /jobs search, validated in ONE place, and carried to a job ad and back.
//
// ── WHY A JOB AD CARRIES ITS SEARCH ────────────────────────────────────
//
// "Tillbaka till sökresultatet" used to call history.back(). That returns to
// whatever the previous history entry happens to be -- another site, a
// related job, the login page after signing in -- and on a direct entry there
// is nothing to go back to. So a job card opened from /jobs carries the
// validated search it was listed under as `from`, and the ad's back link
// rebuilds /jobs from it. No `from`, or one that does not parse, is plain
// /jobs.
//
// ── WHY `from` IS A QUERY STRING, NOT AN OBJECT ────────────────────────
//
// TanStack Router JSON-parses every search value, and after signing in the
// one door (safeReturnPath -> splitReturnPath -> navigate) hands every value
// back as a STRING. A nested object would return as a JSON string that the
// router then encodes a second time. `q=…&location=…` is never valid JSON,
// so it is left alone at every hop and arrives byte for byte.
//
// ── WHAT IS VALIDATED ──────────────────────────────────────────────────
//
// `from` is never used as a URL. It is parsed, passed through the same
// validator the /jobs route uses, and only the known keys with non-empty
// string values survive. The back link's destination is always the /jobs
// route itself; `from` can only choose its filters.

import { safeReturnPath } from "@/lib/auth/safe-redirect";

export type JobSearch = {
  q?: string;
  location?: string;
  family?: string;
  employment?: string;
  workplace?: string;
  experience?: string;
  country?: string;
  sort?: string;
  selected?: string;
  page?: string;
};

/** Every key /jobs accepts, in the order `from` writes them. */
export const JOB_SEARCH_KEYS = [
  "q",
  "location",
  "family",
  "employment",
  "workplace",
  "experience",
  "country",
  "sort",
  "selected",
  "page",
] as const satisfies readonly (keyof JobSearch)[];

/** The /jobs route's search validator. Unknown keys are dropped, and a value
 *  that is not a non-empty string is treated as absent. */
export function validateJobSearch(raw: Record<string, unknown>): JobSearch {
  const out: JobSearch = {};
  for (const key of JOB_SEARCH_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value) out[key] = value;
  }
  if (out.sort !== "deadline" && out.sort !== "newest") delete out.sort;
  if (out.page && (!/^\d+$/.test(out.page) || Number(out.page) < 1 || Number(out.page) > 1000))
    delete out.page;
  return out;
}

/** A validated search as a job ad's `from` value: a query string in a fixed
 *  key order, or undefined when there is nothing to carry. */
export function jobSearchToFrom(search: JobSearch): string | undefined {
  const params = new URLSearchParams();
  for (const key of JOB_SEARCH_KEYS) {
    const value = search[key];
    if (value) params.set(key, value);
  }
  const from = params.toString();
  return from || undefined;
}

/** A job ad's `from` value, back to a validated /jobs search -- through the
 *  same validator /jobs uses. Anything that is not a string is no search. */
export function jobSearchFromFrom(from: unknown): JobSearch {
  if (typeof from !== "string" || !from) return {};
  return validateJobSearch(Object.fromEntries(new URLSearchParams(from)));
}

/** The job ad route's own search: only a normalised `from`, if any. */
export type JobAdSearch = { from?: string; apply?: "1" };

export function validateJobAdSearch(raw: Record<string, unknown>): JobAdSearch {
  const from = jobSearchToFrom(jobSearchFromFrom(raw.from));
  return {
    ...(from ? { from } : {}),
    ...(raw.apply === "1" || raw.apply === 1 ? { apply: "1" as const } : {}),
  };
}

/** Carry the requested action through password, email and OAuth sign-in.
 * Only the ad path is accepted; this cannot turn into an external redirect. */
export function jobApplyReturnPath(returnTo: string): string {
  const safe = safeReturnPath(returnTo, "/jobs");
  const [pathname, query = ""] = safe.split("?");
  if (!/^\/jobs\/[^/?#]+$/.test(pathname)) return "/jobs";
  const params = new URLSearchParams(query);
  params.set("apply", "1");
  return safeReturnPath(`${pathname}?${params}`, `${pathname}?apply=1`);
}

/** Where signing in from a job ad returns to: the ad, WITH the search it was
 *  opened from, provided the whole path passes safeReturnPath. If the search
 *  would push it past what safeReturnPath accepts (length, an encoded line
 *  break), the search is dropped and the ad is kept -- losing the way back to
 *  the results is better than losing the ad. */
export function jobAdReturnPath(slug: string, from: string | undefined): string {
  const ad = `/jobs/${encodeURIComponent(slug)}`;
  if (!from) return ad;
  return safeReturnPath(`${ad}?${new URLSearchParams({ from }).toString()}`, ad);
}
