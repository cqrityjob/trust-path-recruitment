// The public v3.1 assessment: availability, the canonical result, and
// replay-on-login persistence.
//
// ── WHAT MAKES THIS PUBLIC WITHOUT BEING ANONYMOUS ─────────────────────
//
// A signed-out visitor answers into sessionStorage (v31-public-buffer.ts). The
// database is not WRITTEN at all until they sign in. Then `persistPublicV31Run`
// replays the buffer through the NORMAL authenticated pipeline: a real
// cd_sessions row owned by their user_id, real cd_evidence rows, and
// cd_v31_complete_session for the atomic snapshot.
//
// So there is no anonymous grant, no anonymous RLS policy, and no anonymous
// report ownership. A report cannot exist before its owner does.
//
// ── ONE COMPLETED ATTEMPT = ONE CANONICAL RESULT ───────────────────────
//
// CORRECTED 2026-08-29. Until now the anonymous result and the saved result
// were built by two DIFFERENT callers of `buildValidatedSnapshot` with
// DIFFERENT inputs, and they disagreed:
//
//   * PublicAssessmentFlow.tsx computed the pre-login report in the browser
//     and passed NO `professionCatalog` and NO `cigReachableSlugs` —
//     `cd_professions` is granted to `authenticated` only, so the browser had
//     nothing to pass. `matchProfessions` short-circuits on an empty
//     catalogue (professions.ts), so `professions.available` was false and
//     `ranked` was empty: no Top 3, no career card, a "matching not included"
//     note.
//   * `persistPublicV31Run` built the same run server-side WITH the approved
//     catalogue and the real CIG transition edges, producing the full ranked
//     recommendation.
//
// A candidate who completed the assessment signed out and then signed in saw
// their career recommendations appear out of nowhere. Same answers, same
// engine, different inputs — so authentication silently changed the result.
//
// The fix is not a second implementation that agrees by inspection. There is
// now exactly ONE place that turns a buffered run into a report —
// `buildCanonicalSnapshot` below — and both the anonymous preview
// (`previewPublicV31Run`, reads only, writes nothing) and the save path
// (`persistPublicV31Run`) call it with the same inputs. Byte-identical by
// construction, not by convention. `scripts/career-discovery-canonical-
// result-check.ts` asserts it.
//
// The anonymous preview reads the approved catalogue through the service-role
// client, SERVER-SIDE ONLY (dynamic import, never in the client bundle). That
// is a read of owner-approved product content — the professions the owner
// published for ranking — scoped to producing this one caller's own report.
// It grants `anon` nothing: no RLS policy changed, no calibration band is
// returned to the browser, and nothing is written. See `previewPublicV31Run`.
//
// ── LIFECYCLE vs. ACCESS: TWO SEPARATE GATES ────────────────────────────
//
// CORRECTED 2026-08-14. Earlier comments in this file claimed v3.1 sits at
// lifecycle_status = 'internal_test'. That was true when this file was
// written; it stopped being true on 2026-07-31, when
// 20260731100000_career_discovery_v31_launch.sql promoted v3.1 to 'active'.
// The comments were never revised, and the mismatch was found by a current-
// state audit: `getV31Availability` correctly reads the live row, so with
// lifecycle_status='active' it returns available=true unauthenticated, for
// anyone — the Career Intelligence recommendation layer built on top of this
// assessment is still mid-build, so that is broader than intended.
//
// 'lifecycle_status' answers "is the CONTENT ready" (it is). It was never
// meant to also answer "who may use it right now" — that is a second,
// independent question, and until now nothing enforced it for v3.1's public
// route. This file now enforces it explicitly, additively, using
// infrastructure the schema already had for exactly this purpose
// (cd_internal_testers / cd_is_internal_tester(), built for v3.0's own
// internal-test phase, never wired into v3.1's UI): a signed-in user may only
// START AND SAVE a run from inside the product if they are a platform admin
// or an internal tester. `cd_internal_testers` starts empty; the owner grants
// named test-group members access with the existing
// `cd_grant_internal_tester(_user_id, _note)` RPC.
//
// ── AMENDED 2026-08-31: THE ALLOWLIST IS NOT AN OWNERSHIP CHECK ─────────
//
// The sentence above used to read "may only PERSIST a real run". Applied to
// the CLAIM path, that was wrong, and it broke the journey the public product
// advertises. An anonymous visitor is allowed to answer all twenty-eight
// questions and read the full canonical report (nothing is written, and
// `previewPublicV31Run` serves the same report to `anon` with no gate). The
// result page then invites them to create an account and keep it. They did —
// and the allowlist refused the save, told them "not open yet", and dropped
// the run. Anonymous use permitted, authenticated save forbidden, for the
// same person and the same answers.
//
// Product availability and result ownership are now two questions rather than
// one, resolved separately. See `resolveSaveGate` for the full account of
// which control still bites where. Nothing about lifecycle_status, the review
// gates or the authenticated in-product entrance changes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as publicClient } from "@/integrations/supabase/client";

import { deriveClaimSessionId } from "./v31-claim-id";
import { CORE_ITEM_BY_ID, CORE_ITEMS } from "./v31/core-items";
import {
  ADAPTIVE_ITEMS_PER_SESSION,
  adaptiveItemsForStatus,
  CONTEXT_ITEMS,
  CONTEXT_STATUS_ITEM_ID,
  isContextStatus,
  isValidPersonalAnswer,
  reportTagsFor,
  type ContextStatus,
} from "./v31/personal-layer";
import type { DimensionId } from "./v31/dimensions";
import type {
  ProfessionCareerStage,
  ProfessionCatalogEntry,
  ProfessionDimensionBand,
} from "./v31/professions";
import {
  buildValidatedSnapshot,
  SnapshotValidationError,
  type ReportSnapshot,
} from "./v31/snapshot";
import { fetchCigProfessionTitle, fetchCigReachableSlugs } from "./career-context.functions";
import type { Answer } from "./v31/scoring";
import { DEFINITION_VERSION, PATTERN_DEFINITION_VERSION, type Locale } from "./v31/version";

interface ProfessionRow {
  readonly profession_id: string;
  readonly career_area_id: string;
  readonly title_sv: string;
  readonly title_en: string;
  readonly career_stage: string;
  readonly entry_role: boolean;
  readonly regulated: boolean;
  readonly transition_difficulty: number | null;
  readonly inclusion_rationale_sv: string | null;
  readonly inclusion_rationale_en: string | null;
  readonly limitation_note_sv: string | null;
  readonly limitation_note_en: string | null;
  readonly cig_profession_slug: string | null;
}

interface ProfessionProfileRow {
  readonly profession_id: string;
  readonly calibration_version: string;
  readonly dimension_id: string;
  readonly band_low: number;
  readonly band_high: number;
  readonly weight: number;
  readonly centrality: string;
}

/**
 * Layer 4 catalogue for one report build. Reads ONLY `approved_for_ranking =
 * true` professions — the database's own `cd_guard_profession_ranking_approval`
 * trigger already guarantees every such row cleared review and has a
 * complete 16-dimension calibration, so this function does not re-check
 * either; it only shapes rows into what ./v31/professions.ts's pure matcher
 * expects. Today this returns an empty catalogue for every candidate, since
 * nothing has been approved yet — that is correct, not a bug, until an owner
 * actually approves a profession through the review lifecycle.
 */
async function fetchApprovedProfessionCatalog(
  supabase: Ctx["supabase"],
): Promise<{ readonly catalog: ProfessionCatalogEntry[]; readonly calibrationVersion?: string }> {
  const { data: professions } = await supabase
    .from("cd_professions")
    .select(
      "profession_id, career_area_id, title_sv, title_en, career_stage, entry_role, regulated, transition_difficulty, inclusion_rationale_sv, inclusion_rationale_en, limitation_note_sv, limitation_note_en, cig_profession_slug",
    )
    .eq("approved_for_ranking", true);

  const rows = (professions ?? []) as ProfessionRow[];
  if (rows.length === 0) return { catalog: [] };

  // cd_profession_bands_for_matching, not the base table and not the view.
  // The base table keeps every historical calibration_version batch for audit,
  // and reading it unfiltered combines two coexisting batches' bands into one
  // profession's scoring input (found during the Release Completion mandate's
  // real-data verification). The accessor returns exactly one row per
  // (profession_id, dimension_id) -- the most recently authored -- and only the
  // seven columns matching consumes. Direct SELECT on the table and the view is
  // revoked from authenticated; see 20260822092000.
  const { data: profiles } = await supabase.rpc("cd_profession_bands_for_matching", {
    _profession_ids: rows.map((p) => p.profession_id),
  });

  const bandsByProfession = new Map<string, ProfessionDimensionBand[]>();
  let calibrationVersion: string | undefined;
  for (const row of (profiles ?? []) as ProfessionProfileRow[]) {
    calibrationVersion = row.calibration_version;
    const list = bandsByProfession.get(row.profession_id) ?? [];
    list.push({
      dimensionId: row.dimension_id as DimensionId,
      centrality: row.centrality as "central" | "supporting" | "neutral",
      bandLow: Number(row.band_low),
      bandHigh: Number(row.band_high),
      weight: Number(row.weight),
    });
    bandsByProfession.set(row.profession_id, list);
  }

  const catalog: ProfessionCatalogEntry[] = rows.map((p) => ({
    professionId: p.profession_id,
    careerAreaId: p.career_area_id,
    titleSv: p.title_sv,
    titleEn: p.title_en,
    careerStage: p.career_stage as ProfessionCareerStage,
    entryRole: p.entry_role,
    regulated: p.regulated,
    transitionDifficulty: p.transition_difficulty,
    inclusionRationaleSv: p.inclusion_rationale_sv ?? "",
    inclusionRationaleEn: p.inclusion_rationale_en ?? "",
    limitationNoteSv: p.limitation_note_sv,
    limitationNoteEn: p.limitation_note_en,
    bands: bandsByProfession.get(p.profession_id) ?? [],
    cigProfessionSlug: p.cig_profession_slug,
  }));

  return { catalog, calibrationVersion };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

/** Lifecycle statuses a real candidate session may be created against. Mirrors
 *  the database rule; the database remains the enforcement point. */
const CANDIDATE_ADMINISTRABLE = ["pilot", "active"] as const;

export type V31PublicErrorCode =
  | "not_available"
  | "definition_missing"
  | "incomplete_buffer"
  | "invalid_answers"
  // The claim token names a run that some OTHER account already owns. Its
  // own state, not a `persist_failed`, because nothing failed: the run was
  // saved, just not to this account, and the candidate needs to be told that
  // rather than invited to retry forever. See resolveSaveGate.
  | "already_claimed"
  | "persist_failed";

export class V31PublicError extends Error {
  constructor(
    readonly code: V31PublicErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "V31PublicError";
  }
}

const V31_PUBLIC_ERROR_CODES: readonly V31PublicErrorCode[] = [
  "not_available",
  "definition_missing",
  "incomplete_buffer",
  "invalid_answers",
  "already_claimed",
  "persist_failed",
];

/**
 * The error code behind a failed server call, when there is one.
 *
 * A server function's rejection does not arrive at the browser as the class
 * that was thrown — it arrives serialised, and `V31PublicError` puts the code
 * in `message` precisely so it survives that. Without this, every distinct
 * refusal reached the candidate as the same "something went wrong", which is
 * how "another account already saved this result" came to look identical to a
 * dropped connection and invited an endless retry.
 *
 * EXACT matches only, never a substring sweep of a serialised blob: a code
 * this function is not sure about must come back as null so the caller falls
 * back to the honest generic failure rather than confidently saying the
 * wrong thing.
 */
export function v31PublicErrorCode(err: unknown): V31PublicErrorCode | null {
  if (err instanceof V31PublicError) return err.code;
  const candidates: unknown[] = [];
  if (typeof err === "string") candidates.push(err);
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    candidates.push(o.message, o.code);
    for (const key of ["body", "data", "error", "cause"]) {
      const nested = o[key];
      if (typeof nested === "string") candidates.push(nested);
      else if (nested && typeof nested === "object") {
        candidates.push((nested as Record<string, unknown>).message);
        candidates.push((nested as Record<string, unknown>).code);
      }
    }
  }
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      (V31_PUBLIC_ERROR_CODES as readonly string[]).includes(candidate)
    ) {
      return candidate as V31PublicErrorCode;
    }
  }
  return null;
}

export interface V31Availability {
  /** True only when a real candidate could actually complete and save a run. */
  readonly available: boolean;
  /** Present so the UI can distinguish "coming soon" from "misconfigured". */
  readonly lifecycleStatus: string | null;
  readonly outstandingGates: number;
}

/**
 * Can a real candidate take v3.1 right now?
 *
 * Deliberately UNAUTHENTICATED: a signed-out visitor needs the answer before
 * starting. Reads only definition metadata, which carries no candidate data and
 * which `anon` may already select — no grant is added by this PR.
 */
export const getV31Availability = createServerFn({ method: "GET" }).handler(
  async (): Promise<V31Availability> => {
    const { data } = await publicClient
      .from("cd_definition_versions")
      .select("lifecycle_status, review_status")
      .eq("definition_version", DEFINITION_VERSION)
      .maybeSingle();

    if (!data) return { available: false, lifecycleStatus: null, outstandingGates: 0 };

    const gates = (data.review_status ?? {}) as Record<string, unknown>;
    const outstanding = Object.values(gates).filter((v) => v !== true).length;
    const status = (data.lifecycle_status as string) ?? null;

    // Mirrors the database rule exactly: lifecycle decides admission. Review
    // gates are a governance record, reported here for operators, and never
    // used to refuse a candidate.
    return {
      available: status !== null && (CANDIDATE_ADMINISTRABLE as readonly string[]).includes(status),
      lifecycleStatus: status,
      outstandingGates: outstanding,
    };
  },
);

/**
 * May THIS signed-in user actually save and view a v3.1 report right now?
 *
 * Separate from `getV31Availability` (content readiness) — this is the
 * access gate for the pre-test-group-launch phase, see the file header.
 * Authenticated only: an anonymous visitor's eligibility is irrelevant until
 * they sign in, and checking it earlier would mean asserting a user's
 * identity from an unauthenticated call.
 */
export const getV31TesterStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ readonly allowed: boolean }> => {
    const ctx = context as Ctx;
    const [tester, admin] = await Promise.all([
      ctx.supabase.rpc("cd_is_internal_tester", { _user_id: ctx.userId }),
      ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId }),
    ]);
    return { allowed: Boolean(tester.data) || Boolean(admin.data) };
  });

/**
 * MAY THIS SAVE HAPPEN — the one place the two gates are told apart.
 *
 * ── PRODUCT AVAILABILITY IS NOT RESULT OWNERSHIP ───────────────────────
 *
 * There are two independent questions, and conflating them is what broke
 * the single most important journey in the product:
 *
 *   A. Is Career Discovery open at all? That is `lifecycle_status`, read by
 *      `getV31Availability` and enforced by the database on every session
 *      insert (`CD_VERSION_NOT_ADMINISTRABLE`). It applies to everybody,
 *      including a claim, and this function does not touch it.
 *
 *   B. Does this account own this completed run? That is the claim token,
 *      and it is answered by whether the run was actually staged in this
 *      browser — not by an allowlist.
 *
 * The internal-tester allowlist sits between them: it decides whether a
 * SIGNED-IN person may start and save a run from inside the product while
 * the Career Intelligence layer is mid-build. It was also, until now, the
 * only check on the claim path — so a visitor who completed all twenty-eight
 * questions anonymously (which A permits, publicly, today), created an
 * account precisely because the page told them to, and came back through
 * their confirmation link was refused with "not open yet" and lost the run.
 *
 * That is the contradiction the owner's locked decision removes: while
 * anonymous completion is open, finishing it and keeping the result is one
 * journey, not two, and the second half may not require a database grant the
 * first half never asked for.
 *
 * ── WHAT THE ALLOWLIST STILL DOES, AND WHAT IT NO LONGER DOES ──────────
 *
 * Still: it gates the authenticated in-product run — signing in, pressing
 * start, and saving — which is the cohort control the owner actually uses.
 *
 * No longer: it does not gate claiming an anonymous result. The claim token
 * is client-held and cannot be verified server-side, so this is an honest
 * statement rather than a hidden one — an authenticated caller who supplies
 * a token reaches the same place a candidate who took the assessment
 * anonymously reaches. That discloses nothing new: `previewPublicV31Run`
 * already returns the identical canonical report to `anon`, with no gate at
 * all, so the report content was never what the allowlist protected. The
 * control that still bites for everyone, claim included, is A — closing the
 * lifecycle closes the whole product, anonymous runs first.
 */
export type SaveGateDecision = "allow_test_group" | "allow_claim" | "deny";

export function resolveSaveGate(input: {
  readonly isInternalTester: boolean;
  readonly isPlatformAdmin: boolean;
  /** True when the caller presented a claim token — i.e. this is a run that
   *  was completed anonymously and is being attached to the account that has
   *  just signed in. */
  readonly isAnonymousClaim: boolean;
}): SaveGateDecision {
  if (input.isInternalTester || input.isPlatformAdmin) return "allow_test_group";
  if (input.isAnonymousClaim) return "allow_claim";
  return "deny";
}

const bufferedAnswerSchema = z.union([
  z.object({
    itemId: z.string(),
    format: z.literal("scale"),
    value: z.number().int().min(1).max(10),
  }),
  z.object({
    itemId: z.string(),
    format: z.literal("single_choice"),
    optionId: z.string(),
  }),
  // Context and Discovery Path answers. Never scored — see the split in the
  // handler, where these are excluded from the snapshot inputs by type.
  z.object({
    itemId: z.string(),
    format: z.literal("personal"),
    value: z.string(),
  }),
]);

/** The career-context self-report, as it crosses the wire. Shared by the
 *  preview and the save path so the two can never validate it differently —
 *  a difference here is a difference in the report (experienceBand and
 *  currentProfessionSlug both reach professions.ts). */
const careerContextSchema = z.object({
  currentProfessionStatus: z.enum(["selected", "not_listed", "prefer_not_to_say"]),
  currentProfessionSlug: z.string().nullable(),
  // Free text, bounded here as well as by the column's CHECK — the client
  // bound is a courtesy, this one is the boundary.
  currentProfessionOther: z.string().max(120).nullable().optional(),
  experienceBand: z.enum(["under_1y", "1_3y", "4_7y", "8_plus_y"]).nullable(),
});

type CareerContextInput = z.infer<typeof careerContextSchema>;

type BufferedAnswer = z.infer<typeof bufferedAnswerSchema>;

/** A buffered run, split into its scored and unscored halves and validated
 *  against both banks. */
interface ValidatedRun {
  /** Scored Career DNA answers only — the ONLY thing that reaches
   *  dimension scoring. */
  readonly answers: readonly Answer[];
  /** Context + Discovery Path answers, by item id. Never scored. */
  readonly personal: ReadonlyMap<string, string>;
  readonly contextStatus: ContextStatus;
  /** Report tags from the four Discovery Path answers — explanation layer
   *  and Recommendation Priority bonus only, never scoring. */
  readonly discoveryTags: readonly string[];
}

/**
 * Split one buffered run into its scored and unscored halves, and validate
 * each against its own bank.
 *
 * THE SPLIT IS THE SCORING BOUNDARY. Only `answers` reaches
 * `buildValidatedSnapshot`. A personal answer cannot enter it, because
 * `CORE_ITEM_BY_ID` does not contain personal item ids and a `personal`
 * answer carries neither a scale value nor an option id.
 *
 * Shared by the preview and the save path. Extracted so the two cannot drift:
 * a run the preview accepts is exactly a run the save path accepts, and both
 * derive `contextStatus` and `discoveryTags` the same way — all three feed the
 * report, so a difference in any of them is a difference in the result.
 *
 * Throws rather than repairing. Called before any write, so an incomplete
 * buffer never creates a half-finished session.
 */
export function splitAndValidateRun(rawAnswers: readonly BufferedAnswer[]): ValidatedRun {
  const byItem = new Map<string, Answer>();
  const personal = new Map<string, string>();

  for (const a of rawAnswers) {
    if (a.format === "personal") {
      if (!isValidPersonalAnswer(a.itemId, a.value)) {
        throw new V31PublicError("invalid_answers", "unknown context or discovery-path answer");
      }
      personal.set(a.itemId, a.value);
      continue;
    }

    const item = CORE_ITEM_BY_ID[a.itemId];
    if (!item) throw new V31PublicError("invalid_answers", "unknown item");
    if (item.format !== a.format) {
      throw new V31PublicError("invalid_answers", "format does not match the registry");
    }
    if (a.format === "single_choice" && !a.optionId.startsWith(`${a.itemId}_`)) {
      throw new V31PublicError("invalid_answers", "option does not belong to its item");
    }
    byItem.set(a.itemId, a as Answer);
  }

  if (byItem.size !== CORE_ITEMS.length) {
    throw new V31PublicError("incomplete_buffer", `${byItem.size} of ${CORE_ITEMS.length}`);
  }

  // The personal layer: 2 context answers, then exactly the four Discovery
  // Path items the candidate's own path serves.
  const rawStatus = personal.get(CONTEXT_STATUS_ITEM_ID);
  if (!isContextStatus(rawStatus)) {
    throw new V31PublicError("incomplete_buffer", "no routing answer");
  }
  const contextStatus: ContextStatus = rawStatus;

  for (const item of CONTEXT_ITEMS) {
    if (!personal.has(item.id)) {
      throw new V31PublicError("incomplete_buffer", `context item ${item.id}`);
    }
  }

  const servedAdaptive = adaptiveItemsForStatus(contextStatus);
  for (const item of servedAdaptive) {
    if (!personal.has(item.id)) {
      throw new V31PublicError("incomplete_buffer", `discovery-path item ${item.id}`);
    }
  }
  // Mandate item 6: the same tags written to cd_evidence.answer_tags, read
  // here to feed Recommendation Priority's explanation layer (see
  // professions.ts's contextCorroborated) — contextual self-report, never
  // scored.
  const discoveryTags = servedAdaptive.flatMap((item) =>
    reportTagsFor(item.id, personal.get(item.id) ?? ""),
  );
  // An answer to an item outside this run's own path is rejected rather than
  // dropped. The database would refuse it too (CD_ADAPTIVE_PATH_MISMATCH);
  // failing here means failing before a session row exists, so nothing partial
  // is left behind.
  const expectedPersonal = new Set([
    ...CONTEXT_ITEMS.map((i) => i.id),
    ...servedAdaptive.map((i) => i.id),
  ]);
  for (const id of personal.keys()) {
    if (!expectedPersonal.has(id)) {
      throw new V31PublicError("invalid_answers", "answer from another Discovery Path");
    }
  }
  if (servedAdaptive.length !== ADAPTIVE_ITEMS_PER_SESSION) {
    throw new V31PublicError("invalid_answers", "discovery path is not four items");
  }

  return { answers: [...byItem.values()], personal, contextStatus, discoveryTags };
}

/**
 * THE canonical result for one completed run.
 *
 * ── WHY THIS IS THE ONLY BUILDER ────────────────────────────────────────
 *
 * `buildValidatedSnapshot` is a pure function of its inputs, so "same engine"
 * guarantees nothing on its own — the anonymous/authenticated divergence this
 * function exists to end was two callers passing DIFFERENT inputs to the same
 * pure engine (see the file header). Every input that can move the ranking is
 * resolved here, once:
 *
 *   * `professionCatalog`   — the owner-approved catalogue
 *   * `professionCalibrationVersion`
 *   * `cigReachableSlugs`   — real, published CIG transition edges
 *   * `currentProfessionTitle`
 *   * `contextStatus`, `discoveryTags`, `experienceBand`
 *
 * Given the same run, the same `completedAt` and the same catalogue state,
 * this returns a byte-identical snapshot whether the caller is anonymous or
 * signed in. That is the invariant; nothing about authentication is visible
 * from in here, which is what makes it true.
 *
 * `supabase` is whichever client the caller is entitled to use — the
 * candidate's own RLS-scoped client on the save path, the service-role client
 * for the anonymous preview. Both read the same rows: `approved_for_ranking`
 * professions and published CIG edges are owner-published product content,
 * not user data.
 */
export async function buildCanonicalSnapshot(
  supabase: Ctx["supabase"],
  input: {
    readonly run: ValidatedRun;
    readonly locale: Locale;
    readonly completedAt: string;
    readonly careerContext?: CareerContextInput;
  },
): Promise<ReportSnapshot> {
  const { run, locale, completedAt, careerContext } = input;

  const currentProfessionCigSlug =
    careerContext?.currentProfessionStatus === "selected"
      ? (careerContext.currentProfessionSlug ?? null)
      : null;

  const [
    { catalog: professionCatalog, calibrationVersion: professionCalibrationVersion },
    cigReachableSlugs,
    currentProfessionTitle,
  ] = await Promise.all([
    fetchApprovedProfessionCatalog(supabase),
    // Item 7: real, published CIG transition edges from the candidate's
    // current profession — never fabricated, empty when current profession is
    // unknown or has no documented transitions.
    fetchCigReachableSlugs(supabase, currentProfessionCigSlug),
    // Item 8: resolved once, at build time, and frozen onto the snapshot —
    // never re-looked-up when an old report is reopened.
    fetchCigProfessionTitle(supabase, currentProfessionCigSlug),
  ]);

  try {
    return buildValidatedSnapshot({
      answers: run.answers,
      locale,
      completedAt,
      professionCatalog,
      contextStatus: run.contextStatus,
      currentProfessionCigSlug,
      currentProfessionTitle,
      discoveryTags: run.discoveryTags,
      cigReachableSlugs,
      professionCalibrationVersion,
      // Owner Security Manager scenario fix: the coarse C1 baseline alone was
      // still deciding career-stage even after a concrete current profession +
      // experience were known. Threaded through so resolveStageBaseline
      // (professions.ts) can prefer the known profession's own career level,
      // refined by real experience.
      experienceBand: careerContext?.experienceBand ?? null,
    });
  } catch (err) {
    if (err instanceof SnapshotValidationError) {
      throw new V31PublicError("invalid_answers", err.failures.map((f) => f.code).join(","));
    }
    throw err;
  }
}

/** Clamp a self-reported completion time to a real instant not in the future.
 *  Only ever used for display — nothing scores or gates on it — so a client
 *  lying about it costs nothing; still bounded so a broken client cannot write
 *  a nonsensical date. Shared so the preview and the saved report agree on
 *  when the run finished, which `completedAt` feeds straight into the
 *  snapshot. */
function resolveCompletedAt(claimed: string | undefined, now: string): string {
  return claimed && Date.parse(claimed) <= Date.parse(now) ? claimed : now;
}

export interface PersistResult {
  readonly snapshotId: string;
  readonly created: boolean;
}

/** One row as it is sent to cd_evidence.
 *
 *  Only the columns the caller is allowed to supply. item_version, item_kind,
 *  evidence_class, is_scored and adaptive_path are DERIVED by the database
 *  from the item registry and are deliberately absent — sending them would
 *  mean a client could assert that a context answer is scored. */
export interface EvidenceRow {
  readonly session_id: string;
  readonly item_id: string;
  readonly item_version: number;
  readonly answer_value: string;
  readonly option_id: string | null;
  /** NEVER null. `cd_evidence.answer_tags` is `text[] NOT NULL DEFAULT '{}'`,
   *  so an explicit null overrides the default and fails the column's NOT NULL
   *  constraint with SQLSTATE 23502 — for the whole statement, not just the
   *  offending row. Empty array for everything that is not an adaptive item;
   *  the database refuses tags on any other kind
   *  (CD_REPORT_TAGS_ONLY_ON_ADAPTIVE). */
  readonly answer_tags: readonly string[];
}

/**
 * Build the evidence rows for one completed run.
 *
 * Extracted and exported so the payload is directly testable. It previously
 * lived inline inside the handler, which meant the SQL suite could only test a
 * hand-written approximation of it — and that approximation omitted
 * `answer_tags` entirely, letting the column default apply. The real payload
 * sent `answer_tags: null`, which the default cannot rescue. Every one of the
 * 26 rows was rejected, and no test could see it.
 */
export function buildEvidenceRows(
  sessionId: string,
  coreAnswers: readonly Answer[],
  personalAnswers: ReadonlyMap<string, string>,
): EvidenceRow[] {
  const core: EvidenceRow[] = coreAnswers.map((a) => ({
    session_id: sessionId,
    item_id: a.itemId,
    item_version: 1,
    answer_value: a.format === "scale" ? String(a.value) : a.optionId,
    option_id: a.format === "single_choice" ? a.optionId : null,
    answer_tags: [],
  }));

  // The personal layer. `answer_tags` carry the structured Career Context
  // Signals the Career Intelligence Engine reads after the assessment. Context
  // items produce none, so they send [] — not null.
  const personal: EvidenceRow[] = [...personalAnswers.entries()].map(([itemId, value]) => ({
    session_id: sessionId,
    item_id: itemId,
    item_version: 1,
    answer_value: value,
    option_id: null,
    answer_tags: reportTagsFor(itemId, value),
  }));

  return [...core, ...personal];
}

export interface PreviewResult {
  readonly snapshot: ReportSnapshot;
  /** Echoed back so the client renders — and later saves — the exact instant
   *  the server built this report for. Without it a refresh could produce a
   *  snapshot that differs from this one in `completedAt` alone. */
  readonly completedAt: string;
}

/**
 * THE anonymous result — the canonical report, computed but not stored.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────
 *
 * The pre-login report used to be computed in the browser. The browser cannot
 * read `cd_professions` (granted to `authenticated` only), so it built the
 * report with an EMPTY catalogue and the candidate got no Top 3 and no career
 * card — until they signed in, at which point the server rebuilt the same
 * answers WITH the catalogue and the recommendations appeared. Same answers,
 * same engine, different inputs, different result. See the file header.
 *
 * Moving the build here is what makes one attempt produce one result. The
 * report a signed-out candidate reads is now the same object the save path
 * will store, produced by the same `buildCanonicalSnapshot` call.
 *
 * ── WHAT IT IS ALLOWED TO TOUCH ─────────────────────────────────────────
 *
 * Reads only. No `cd_sessions` row, no `cd_evidence` row, no snapshot,
 * nothing keyed to a user — a report still cannot exist before its owner
 * does, and this function cannot create one.
 *
 * It reads the approved profession catalogue and published CIG edges through
 * the service-role client, imported DYNAMICALLY so the key never enters the
 * client bundle (see client.server.ts's own note). Deliberate, and narrow:
 *
 *   * it grants `anon` nothing — no RLS policy is added or relaxed, and the
 *     browser still cannot query `cd_professions` itself;
 *   * the rows it reads are owner-published product content (professions the
 *     owner explicitly set `approved_for_ranking = true`), not user data;
 *   * calibration bands never leave this function — they are consumed by the
 *     matcher and only the resulting report is returned, so the catalogue's
 *     IP is not exposed by the response;
 *   * the response contains nothing but the caller's OWN report, built from
 *     answers the caller supplied in the request.
 *
 * The tester allowlist still gates `persistPublicV31Run` for a run STARTED
 * while signed in. It no longer gates claiming a run finished anonymously —
 * see `resolveSaveGate`, and note that this function is why that costs
 * nothing: the report a claim saves is the one this function already returned
 * to the same person, ungated, before any account existed.
 */
export const previewPublicV31Run = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        locale: z.enum(["sv", "en"]),
        answers: z.array(bufferedAnswerSchema).min(1),
        completedAt: z.string().datetime().optional(),
        careerContext: careerContextSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<PreviewResult> => {
    // Server-side only. A top-level import would put the service-role key in
    // the client bundle — *.functions.ts modules ship to the browser.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const run = splitAndValidateRun(data.answers);
    const completedAt = resolveCompletedAt(data.completedAt, new Date().toISOString());
    const snapshot = await buildCanonicalSnapshot(supabaseAdmin, {
      run,
      locale: data.locale as Locale,
      completedAt,
      careerContext: data.careerContext,
    });
    return { snapshot, completedAt };
  });

/**
 * Replay a buffered public run into the authenticated v3.1 pipeline.
 *
 * Ordinary authenticated writes throughout — the caller's own RLS-scoped
 * client, so a run can only ever be written as its own owner.
 *
 * Throws rather than partially persisting. The client keeps the buffer until
 * this resolves, so a failure loses nothing: the candidate can retry with their
 * answers intact. Clearing the buffer before this succeeded is the one mistake
 * that would destroy real work.
 */
export const persistPublicV31Run = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        locale: z.enum(["sv", "en"]),
        answers: z.array(bufferedAnswerSchema).min(1),
        // The moment the candidate's anonymous buffer first became complete
        // (see markComplete in v31-public-buffer.ts), so the report they
        // already saw before signing in and the one now being stored agree
        // on when the run finished. Self-reported and only ever used for
        // display — nothing scores or gates on it — so a client lying about
        // it costs nothing; still bounded to a real ISO instant not in the
        // future, so a broken client cannot write a nonsensical date.
        completedAt: z.string().datetime().optional(),
        // Master Completion Mandate item 2: optional, contextual self-report
        // — never scored, never read by anything in v31/scoring.ts. Absent
        // when the step was never shown (candidate not yet working in
        // security) or the run predates this field.
        careerContext: careerContextSchema.optional(),
        // Present when this run was completed ANONYMOUSLY and is now being
        // attached to the account that has just signed in. It names the run
        // (see v31-claim-id.ts) and it is what tells the two gates apart
        // (see resolveSaveGate). Absent for a signed-in candidate saving a
        // run they took while signed in — that path is byte-for-byte the one
        // it always was.
        claimToken: z.string().min(8).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PersistResult> => {
    const ctx = context as Ctx;

    // 0. Access gate — see resolveSaveGate, which is where the reasoning
    //    lives and which is unit-tested as a truth table rather than
    //    inferred from this call site. Checked before any parsing or writing
    //    so a refusal never creates a partial session.
    //
    //    It gates SAVING, not reading: the candidate has already seen this
    //    exact report via previewPublicV31Run, which is how the result can be
    //    the same before and after signing in. Nothing new is disclosed here.
    const isAnonymousClaim = typeof data.claimToken === "string" && data.claimToken.length > 0;
    const [tester, admin] = await Promise.all([
      ctx.supabase.rpc("cd_is_internal_tester", { _user_id: ctx.userId }),
      ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId }),
    ]);
    const decision = resolveSaveGate({
      isInternalTester: Boolean(tester.data),
      isPlatformAdmin: Boolean(admin.data),
      isAnonymousClaim,
    });
    if (decision === "deny") {
      throw new V31PublicError("not_available", "test_group_only");
    }

    // The run's identity. Derived from the claim token so the PRIMARY KEY is
    // the idempotency check — a second claim of the same run collides rather
    // than minting a second report. Null for a signed-in run, which keeps the
    // database's own default and is exactly what it was before.
    const claimSessionId = data.claimToken ? await deriveClaimSessionId(data.claimToken) : null;

    // 1. Split and validate — the SAME function the anonymous preview uses,
    //    so a run the candidate already saw a report for is never rejected
    //    here, and `contextStatus`/`discoveryTags` are derived identically.
    const run = splitAndValidateRun(data.answers);
    const { answers, personal, contextStatus } = run;

    // 2. Resolve the definition version. Its lifecycle is enforced by the
    //    database on insert; this read is for a clear error, not a gate.
    const { data: dv } = await ctx.supabase
      .from("cd_definition_versions")
      .select("id, lifecycle_status")
      .eq("definition_version", DEFINITION_VERSION)
      .maybeSingle();
    if (!dv?.id) throw new V31PublicError("definition_missing");

    // 3. Build and validate the report BEFORE writing anything. A run that
    //    cannot produce a valid report must not leave a session behind.
    //
    //    THE canonical builder — byte-identical to what `previewPublicV31Run`
    //    already returned for this same run and the same `completedAt`. This
    //    is what makes signing in a SAVE rather than a recomputation with
    //    different inputs (see the file header).
    //
    //    Read through the SAME service-role client the preview uses, not
    //    `ctx.supabase`. Both clients see the same rows today — the grant on
    //    `cd_professions` is role-level, with no per-user row filter — so
    //    this changes no behaviour now. It removes the possibility: a future
    //    RLS policy that narrowed the catalogue per user would otherwise
    //    reintroduce exactly this bug, silently, as two paths reading
    //    different catalogues again. Reads only; every WRITE below stays on
    //    the caller's own RLS-scoped client, so a run is still only ever
    //    written as its own owner.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const completedAt = resolveCompletedAt(data.completedAt, new Date().toISOString());
    const snapshot = await buildCanonicalSnapshot(supabaseAdmin, {
      run,
      locale: data.locale as Locale,
      completedAt,
      careerContext: data.careerContext,
    });

    // 4. Session. `context_status` carries the C1 answer; `adaptive_path` is
    //    deliberately NOT sent. `cd_guard_derive_adaptive_path` derives it
    //    from context_status and overwrites anything supplied, so the path
    //    stored is the database's own conclusion, not the client's claim.
    //    That derivation is also what makes the adaptive evidence below
    //    insertable at all — evidence for an adaptive item is refused unless
    //    the session already carries the matching path.
    const { data: session, error: sessionError } = await ctx.supabase
      .from("cd_sessions")
      .insert({
        // Supplied ONLY on the claim path, where it is the run's derived
        // identity (see v31-claim-id.ts). Omitted otherwise, so a signed-in
        // run keeps the column default and this insert is unchanged for it.
        ...(claimSessionId ? { id: claimSessionId } : {}),
        definition_version_id: dv.id,
        user_id: ctx.userId,
        locale: data.locale,
        status: "in_progress",
        context_status: contextStatus,
        current_profession_status: data.careerContext?.currentProfessionStatus ?? null,
        current_profession_slug:
          data.careerContext?.currentProfessionStatus === "selected"
            ? (data.careerContext.currentProfessionSlug ?? null)
            : null,
        // Only when they actually said "not listed". Never alongside a
        // selected canonical profession, which is also what the column's
        // CHECK refuses — this makes the refusal impossible to reach rather
        // than relying on it.
        current_profession_other:
          data.careerContext?.currentProfessionStatus === "not_listed"
            ? data.careerContext.currentProfessionOther?.trim() || null
            : null,
        current_experience_band: data.careerContext?.experienceBand ?? null,
      })
      .select("id")
      .single();

    // ── ALREADY CLAIMED ────────────────────────────────────────────────
    //
    // A unique violation on the derived id means this run has been claimed
    // before. That is a normal outcome, not a failure: a double-click, a
    // second tab finishing the same sign-in, a retry after a timeout that had
    // in fact succeeded, and a reload of the claim URL all land here — and
    // every one of them wants the SAME report, not a second one.
    //
    // Whose report it is decides what happens next, and RLS answers that
    // without an ownership comparison to get wrong: the select below is
    // scoped to the caller, so a run claimed by a different account simply is
    // not there. That is the whole theft defence, and it leaks nothing beyond
    // "this token does not name a run of yours".
    let sessionId: string;
    let resumed = false;
    if (claimSessionId && sessionError?.code === "23505") {
      const { data: mine } = await ctx.supabase
        .from("cd_sessions")
        .select("id")
        .eq("id", claimSessionId)
        .maybeSingle();
      if (!mine?.id) throw new V31PublicError("already_claimed");
      sessionId = claimSessionId;
      resumed = true;
    } else if (sessionError || !session?.id) {
      // The most likely cause is the lifecycle guard refusing a session against
      // a non-administrable version. Surfaced as not_available so the UI can
      // say "not yet available" rather than "something went wrong".
      const code = String(sessionError?.message ?? "");
      if (
        code.includes("CD_VERSION_NOT_ADMINISTRABLE") ||
        code.includes("CD_REVIEW_GATES") ||
        // internal_test is refused by its own, stronger guard: the version is
        // reachable only through the admin-authorised function. Surfaced as
        // not_available so the candidate reads "not open yet" rather than
        // "something went wrong". Found by the public-flow fixture.
        code.includes("CD_INTERNAL_TEST_REQUIRES_AUTHORISED_FUNCTION")
      ) {
        throw new V31PublicError("not_available", dv.lifecycle_status as string);
      }
      console.error("[persistPublicV31Run] session insert failed", {
        code: sessionError?.code,
        message: sessionError?.message,
      });
      throw new V31PublicError("persist_failed", "session");
    } else {
      sessionId = session.id as string;
    }

    // 5. Evidence — all 28 answers. Metadata (item_version, item_kind,
    //    evidence_class, is_scored, adaptive_path) is derived by the database
    //    from the item registry; only the answer itself is supplied, so a
    //    caller cannot assert that a context answer is scored.
    const rows = buildEvidenceRows(sessionId, answers, personal);

    // A resumed claim may already hold some or all of this evidence — a
    // previous attempt that died between the session write and this one.
    // Upserting on the (session_id, item_id) key the schema already declares
    // makes the repeat harmless instead of turning a recoverable half-write
    // into a permanent one. The rows are identical by construction: they come
    // from the same staged buffer, replayed through the same validator.
    const { error: evidenceError } = resumed
      ? await ctx.supabase
          .from("cd_evidence")
          .upsert(rows, { onConflict: "session_id,item_id", ignoreDuplicates: true })
      : await ctx.supabase.from("cd_evidence").insert(rows);
    if (evidenceError) {
      // The database's own words, not a summary of them.
      //
      // This previously threw a bare "evidence", which is how a NOT NULL
      // violation on answer_tags reached production looking identical to a
      // network failure: the UI said "Rapporten kunde inte sparas" and the one
      // fact that would have identified it in seconds -- the SQLSTATE and the
      // column name -- was discarded here.
      //
      // Server-side only. `detail` is returned to the client as a short code;
      // the full record goes to the server log.
      console.error("[v31] cd_evidence insert rejected", {
        code: evidenceError.code,
        message: evidenceError.message,
        details: evidenceError.details,
        hint: evidenceError.hint,
        rowCount: rows.length,
        sessionId,
      });
      throw new V31PublicError(
        "persist_failed",
        `evidence:${evidenceError.code ?? "unknown"}:${evidenceError.message ?? ""}`,
      );
    }

    // 6. Atomic completion. Idempotent: a retry returns the same snapshot,
    //    which is what makes a re-claim end where the first claim ended
    //    rather than anywhere new. It also re-checks ownership itself
    //    (CD_NOT_SESSION_OWNER), so the claim path is refused twice over.
    const { data: result, error: completeError } = await ctx.supabase.rpc(
      "cd_v31_complete_session",
      {
        _session_id: sessionId,
        _payload: snapshot,
        _pattern_definition_version: PATTERN_DEFINITION_VERSION,
        _completed_at: completedAt,
      },
    );
    if (completeError) {
      console.error("[persistPublicV31Run] completion failed", {
        code: completeError.code,
        message: completeError.message,
      });
      // The RPC's own ownership refusal. Reachable only on a claim whose
      // session belongs to somebody else, which the RLS-scoped lookup above
      // already answers — this is the second, independent refusal, and it is
      // reported as the state it is rather than as a generic failure the
      // candidate would be invited to retry forever.
      if (String(completeError.message ?? "").includes("CD_NOT_SESSION_OWNER")) {
        throw new V31PublicError("already_claimed");
      }
      throw new V31PublicError("persist_failed", "completion");
    }

    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.snapshot_id) throw new V31PublicError("persist_failed", "completion");

    return { snapshotId: row.snapshot_id as string, created: Boolean(row.was_created) };
  });
