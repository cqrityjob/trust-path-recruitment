// Security Passport — the first run, decided from persisted rows.
//
// ── WHY THIS IS A MODULE AND NOT A FEW BOOLEANS IN A ROUTE ─────────────
//
// The question "what should this person see first" is answered in three
// places at once: the Passport overview decides whether to hand over to the
// journey, the journey decides which of its screens to open on, and the
// career home decides whether to suggest adding a merit. Written separately,
// those three disagree the first time one of them learns about a new state —
// which is exactly how a holder came to be shown "your Passport is set up"
// above an empty Passport.
//
// So the derivation is here, once, pure, and tested by
// scripts/passport-first-run-check.tsx.
//
// ── IT IS DERIVED, NEVER STORED ────────────────────────────────────────
//
// There is no `hasCompletedFirstRun` column and no localStorage flag. The
// state is a function of rows: does a profile exist, does the holder hold a
// CURRENT merit, is there a saved draft. A flag would be a second source of
// truth about the same fact, and the one that was wrong would be the flag —
// `onboarding_state = 'completed'` is already exactly such a flag, and hosted
// data holds profiles that carry it with nothing in the Passport at all.
//
// ── ONE LIFECYCLE INTERPRETATION ───────────────────────────────────────
//
// `isCurrentMerit` / `isUnfinishedMerit` / `isArchivedMerit` come from
// types.ts, the same predicates the overview and My Career use. A draft is
// unfinished private work and an expired credential is history; neither is
// Passport content, so neither ends the first run.

import { isCurrentMerit } from "./types";

/** The five things a person may add first.
 *
 *  Deliberately NOT the `sp_claims.claim_type` vocabulary. A person choosing
 *  what to record thinks "a course I took"; the database thinks `training`.
 *  The mapping is made once, on the server, inside
 *  `sp_passport_complete_first_merit` — this list is the human end of it.
 *
 *  `employment` is first because it is the most common, not because it is
 *  required: somebody who has never worked in security can start with an
 *  education, and somebody with a licence and no employer can start with the
 *  licence. There is no current-employer requirement anywhere in the flow. */
export const FIRST_MERIT_KINDS = [
  "employment",
  "education",
  "course",
  "certification",
  "licence",
] as const;

export type FirstMeritKind = (typeof FIRST_MERIT_KINDS)[number];

export function isFirstMeritKind(value: string): value is FirstMeritKind {
  return (FIRST_MERIT_KINDS as readonly string[]).includes(value);
}

/** The four screens, in order. The step index stored on the profile is an
 *  index into this, so a resumed session lands where the holder left off. */
export const FIRST_RUN_SCREENS = ["create", "choose", "details", "done"] as const;
export type FirstRunScreen = (typeof FIRST_RUN_SCREENS)[number];

/** Where the holder's answers live between visits.
 *
 *  Namespaced keys inside `sp_passport_profiles.onboarding_answers`, which is
 *  a jsonb column that already exists and is already holder-scoped by RLS.
 *
 *  A draft is NOT a `draft` merit row. "Save and exit" must leave no merit and
 *  no declaration behind, and the surest way to guarantee that is to have
 *  nothing to leave. */
export const DRAFT_KEYS = {
  operationId: "firstMerit.operationId",
  kind: "firstMerit.kind",
  title: "firstMerit.title",
  organisation: "firstMerit.organisation",
  country: "firstMerit.country",
  startedOn: "firstMerit.startedOn",
  endedOn: "firstMerit.endedOn",
  ongoing: "firstMerit.ongoing",
} as const;

export interface FirstMeritDraft {
  readonly operationId: string | null;
  readonly kind: FirstMeritKind | null;
  readonly title: string;
  readonly organisation: string;
  /** Empty means "not stated". Never pre-filled with a country. */
  readonly country: string;
  readonly startedOn: string;
  readonly endedOn: string;
  readonly ongoing: boolean;
  /** THE AFFIRMATION, AND WHY IT IS NEVER PERSISTED.
   *
   *  It lives on the draft so the form has one shape, and `writeDraft` does
   *  not write it and `readDraft` always returns false. A declaration is an
   *  act a person performs at the moment they save; restoring a ticked box
   *  from storage would be the product remembering an affirmation on their
   *  behalf, which is the same defect as writing `declared_accurate_at`
   *  without being told to. */
  readonly declared: boolean;
}

export const EMPTY_DRAFT: FirstMeritDraft = {
  operationId: null,
  kind: null,
  title: "",
  organisation: "",
  country: "",
  startedOn: "",
  endedOn: "",
  ongoing: true,
  declared: false,
};

/** Read a draft out of the stored answers. Total: an absent or malformed key
 *  reads as unanswered rather than throwing, because a half-written answer
 *  from an older question set must not lock somebody out of their Passport. */
export function readDraft(answers: Readonly<Record<string, string>> | null): FirstMeritDraft {
  const a = answers ?? {};
  const kind = a[DRAFT_KEYS.kind] ?? "";
  return {
    operationId: a[DRAFT_KEYS.operationId] || null,
    kind: isFirstMeritKind(kind) ? kind : null,
    title: a[DRAFT_KEYS.title] ?? "",
    organisation: a[DRAFT_KEYS.organisation] ?? "",
    country: a[DRAFT_KEYS.country] ?? "",
    startedOn: a[DRAFT_KEYS.startedOn] ?? "",
    endedOn: a[DRAFT_KEYS.endedOn] ?? "",
    // Absent means ongoing, which is the common case and the safe one: an
    // employment with no end date is open, not one that ended on an unknown
    // day.
    ongoing: (a[DRAFT_KEYS.ongoing] ?? "yes") !== "no",
    // Always false. See the note on the field: an affirmation is made, not
    // remembered.
    declared: false,
  };
}

/** The answers to persist for a draft. Only the keys this journey owns, so a
 *  save here cannot erase an answer some other surface wrote. */
export function writeDraft(
  answers: Readonly<Record<string, string>> | null,
  draft: FirstMeritDraft,
): Record<string, string> {
  return {
    ...(answers ?? {}),
    [DRAFT_KEYS.operationId]: draft.operationId ?? "",
    [DRAFT_KEYS.kind]: draft.kind ?? "",
    [DRAFT_KEYS.title]: draft.title,
    [DRAFT_KEYS.organisation]: draft.organisation,
    [DRAFT_KEYS.country]: draft.country,
    [DRAFT_KEYS.startedOn]: draft.startedOn,
    [DRAFT_KEYS.endedOn]: draft.endedOn,
    [DRAFT_KEYS.ongoing]: draft.ongoing ? "yes" : "no",
  };
}

/** True when the holder has begun something worth resuming.
 *
 *  A merit KIND is the threshold, not a stray keystroke: "continue where you
 *  left off" offered to somebody who typed one letter and left is a promise
 *  about nothing. */
export function hasResumableDraft(draft: FirstMeritDraft): boolean {
  return draft.kind !== null;
}

export interface FirstRunInput {
  /** Null when the holder has no `sp_passport_profiles` row at all. */
  readonly profile: {
    readonly onboardingState: string;
    readonly onboardingAnswers: Readonly<Record<string, string>>;
  } | null;
  /** Every merit the holder owns, of both kinds, with its lifecycle state.
   *  Not pre-filtered: the filtering IS the decision, and doing it at the
   *  call site is how two surfaces come to disagree. */
  readonly meritLifecycleStates: readonly string[];
}

export type FirstRunState =
  /** No Passport row. "Create your Security Passport". */
  | { readonly screen: "create"; readonly draft: FirstMeritDraft }
  /** A Passport, no current merit, nothing begun. "Start with your first merit". */
  | { readonly screen: "choose"; readonly draft: FirstMeritDraft }
  /** A Passport, no current merit, an answer already given. "Continue". */
  | { readonly screen: "details"; readonly draft: FirstMeritDraft }
  /** At least one CURRENT merit. The first run is over; show the Passport. */
  | { readonly screen: "overview" };

/**
 * What this person should be shown, from what the database holds.
 *
 * The `completed` onboarding state is deliberately NOT consulted. A profile
 * can say completed and hold nothing — the old wizard could close onboarding
 * without creating anything, and hosted data carries such rows. Reading the
 * flag would tell that holder they were finished while their Passport was
 * empty, which is the single most damaging thing this product can say.
 *
 * What ends the first run is a CURRENT merit. Nothing else.
 */
export function deriveFirstRunState(input: FirstRunInput): FirstRunState {
  const current = input.meritLifecycleStates.filter((state) => isCurrentMerit(state));
  if (current.length > 0) return { screen: "overview" };

  const draft = readDraft(input.profile?.onboardingAnswers ?? null);
  if (!input.profile) return { screen: "create", draft };
  return hasResumableDraft(draft) ? { screen: "details", draft } : { screen: "choose", draft };
}

/* ------------------------------------------------------------------ */
/* Validation — the browser's half                                     */
/* ------------------------------------------------------------------ */
//
// The SERVER decides what is complete (`sp_passport_complete_first_merit`
// raises eight named refusals before it writes anything). This exists to
// point at the field before a round trip, and its rules are deliberately the
// same ones — a client rule the server does not hold is a rule that is not
// enforced, and a server rule the client does not know produces an error
// message with no field attached.

export type FirstMeritFieldId = "title" | "organisation" | "country" | "startedOn" | "endedOn";

/** Everything the details form can complain about. The declaration is not a
 *  field of the merit -- it is a condition on saving it -- so it is named
 *  here rather than smuggled into the field list. */
export type FirstMeritProblemId = FirstMeritFieldId | "declaration";

/** Which fields a kind actually asks for. Only these are rendered, and only
 *  these are validated: asking an employer for a course certificate is how a
 *  four-field form becomes a nine-field one. */
export function fieldsFor(kind: FirstMeritKind): readonly FirstMeritFieldId[] {
  return kind === "employment"
    ? ["title", "organisation", "country", "startedOn", "endedOn"]
    : ["title", "organisation", "startedOn"];
}

/** ISO calendar day, as a browser date input produces it. */
function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export interface FirstMeritValidation {
  readonly missing: readonly FirstMeritProblemId[];
  readonly ok: boolean;
  readonly problems: Readonly<Partial<Record<FirstMeritProblemId, string>>>;
}

export function validateDraft(draft: FirstMeritDraft, today: string): FirstMeritValidation {
  const problems: Partial<Record<FirstMeritProblemId, string>> = {};
  const kind = draft.kind;
  if (!kind) return { missing: [], ok: false, problems };

  const fields = fieldsFor(kind);

  if (draft.title.trim() === "") problems.title = "required";
  if (draft.organisation.trim() === "") problems.organisation = "required";

  // A COUNTRY IS ONLY EVER A STATED FACT.
  //
  // Required for employment because the column is NOT NULL and its DEFAULT is
  // a country — so an unanswered form would assert Sweden about somebody who
  // never said it. Never pre-selected, never inferred from the browser, and
  // not asked at all for the four kinds that do not store one.
  if (fields.includes("country") && draft.country.trim() === "") problems.country = "required";

  if (fields.includes("startedOn")) {
    const started = draft.startedOn.trim();
    if (kind === "employment" && started === "") problems.startedOn = "required";
    else if (started !== "" && !isDay(started)) problems.startedOn = "invalid";
    else if (started !== "" && started > today) problems.startedOn = "future";
  }

  if (fields.includes("endedOn") && !draft.ongoing) {
    const ended = draft.endedOn.trim();
    if (ended === "") problems.endedOn = "required";
    else if (!isDay(ended)) problems.endedOn = "invalid";
    else if (draft.startedOn.trim() !== "" && ended <= draft.startedOn.trim())
      problems.endedOn = "beforeStart";
  }

  // The declaration is checked LAST and separately, because it is not about
  // the merit at all: it is the holder saying the merit is true. The server
  // refuses a completion without it before writing anything, so a client that
  // forgot to ask would produce a refusal rather than an unaffirmed record --
  // but asking here is what turns that refusal into a pointed message.
  if (!draft.declared) problems.declaration = "required";

  const allowed = new Set<FirstMeritProblemId>([...fields, "declaration"]);
  const missing = (Object.keys(problems) as FirstMeritProblemId[]).filter((f) => allowed.has(f));
  return { missing, ok: missing.length === 0, problems };
}

/* ------------------------------------------------------------------ */
/* Readback                                                            */
/* ------------------------------------------------------------------ */

/** One persisted merit, read back after a save. */
export interface PersistedMerit {
  readonly id: string;
  readonly kind: "experience" | "claim";
  readonly title: string;
  readonly organisation: string | null;
  readonly assertionLevel: string;
  readonly lifecycleState: string;
}

/**
 * Three outcomes, and the middle one is the point.
 *
 * `confirmed`  the exact subject came back and says what it was asked to say.
 * `mismatch`   a row came back, and it is not the one we submitted.
 * `unknown`    the readback did not answer.
 *
 * A product that collapses `unknown` into either of the others is lying in one
 * direction or the other: "saved" when nothing may have been, or "failed" when
 * the merit is sitting in the database. The journey renders a third state for
 * it, which links to the Passport and says plainly that it could not confirm.
 */
export type ReadbackOutcome = "confirmed" | "mismatch" | "unknown";

export function confirmReadback(
  expected: {
    readonly id: string;
    readonly kind: "experience" | "claim";
    readonly draft: FirstMeritDraft;
  },
  persisted: PersistedMerit | null,
): ReadbackOutcome {
  if (!persisted) return "unknown";
  if (persisted.id !== expected.id || persisted.kind !== expected.kind) return "mismatch";
  if (persisted.title.trim() !== expected.draft.title.trim()) return "mismatch";
  if ((persisted.organisation ?? "").trim() !== expected.draft.organisation.trim())
    return "mismatch";
  // THE TRUST ASSERTION, CHECKED BY THE CLIENT TOO.
  //
  // The function cannot raise trust and the database suite proves it. This is
  // the second lock: if a merit ever came back as anything but a holder's own
  // active statement, the confirmation screen — which says "information
  // provided by you" — would be describing something else.
  if (persisted.assertionLevel !== "self_declared") return "mismatch";
  if (!isCurrentMerit(persisted.lifecycleState)) return "mismatch";
  return "confirmed";
}
