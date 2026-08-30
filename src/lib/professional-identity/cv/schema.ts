// What the model is allowed to return.
//
// ── READ THE SHAPE, NOT THE PROMPT ─────────────────────────────────────
//
// The anti-fabrication guarantee in this feature is carried by this schema,
// not by the instruction text. A prompt asks a model not to invent an
// employer; a schema with no field for an employer name means an invented
// one has nowhere to go.
//
// So every factual field is ABSENT here on purpose:
//
//   no employerName      no roleTitle        no startedOn / endedOn
//   no institution       no credential name  no issue or expiry date
//   no years of experience, no counts, no percentages
//
// All of those are carried in the source bundle, and the renderer takes
// them from there. What the model returns is presentation attached to an
// id: which of the person's real employments to foreground, and how to
// phrase what they did.
//
// ── WHY BULLETS ARE CAPPED, AND SHORT ──────────────────────────────────
//
// A long free-text field is where invention hides. Three short bullets per
// employment is enough for a professional CV and small enough that a person
// reviewing the draft actually reads every line — which is the last and
// most important control, and the only one that does not depend on us
// having anticipated the failure.

import { z } from "zod";

export const CV_OUTPUT_SCHEMA_VERSION = "cv-presentation-v1" as const;

/** Presentation for one of the person's REAL employments. */
const employmentPresentation = z.object({
  /** MUST be an id from the source bundle. `validation.ts` enforces it;
   *  the schema only guarantees a string is present. */
  sourceId: z.string().min(1),
  /**
   * What this person did, in their own history's terms.
   *
   * Bounded hard. An unbounded field invites the model to fill space, and
   * filling space is what fabrication looks like in practice.
   */
  bullets: z.array(z.string().min(3).max(240)).min(1).max(3),
});

export const cvPresentationOutput = z.object({
  /**
   * A one-line professional headline.
   *
   * Rewritten, not invented: the bundle already carries the person's own
   * headline or stated profession, and this is a tightened version of it.
   * The validator checks it for fabricated numbers and verification claims
   * like every other generated line.
   */
  headline: z.string().min(3).max(160),

  /** The professional summary. Three or four sentences, not a page. */
  summary: z.string().min(40).max(1200),

  /**
   * The employments to present, in the order they should appear.
   *
   * A SELECTION over the bundle, never an addition to it. Omitting an
   * employment is legitimate editing for relevance; the person sees exactly
   * what was omitted in the review step and can put it back.
   */
  experience: z.array(employmentPresentation).max(20),

  /**
   * Which of the person's real skill and language claims to foreground,
   * by id. Ordering only — the words shown come from the claim.
   */
  emphasisedClaimIds: z.array(z.string().min(1)).max(40),

  /**
   * Why this arrangement, in one sentence, for the person reviewing it.
   *
   * Required so a tailored CV can be questioned. "Ordered for the role you
   * pasted, foregrounding your control-room experience" is reviewable;
   * silence is not.
   */
  tailoringRationale: z.string().min(10).max(600),
});

export type CvPresentation = z.infer<typeof cvPresentationOutput>;

/**
 * The engine may decline, and declining is a success.
 *
 * Same contract as the Interview Intelligence registry: an answer invented
 * to fill a schema is worse than no answer. A CV run that abstains falls
 * back to the factual document, which is a complete and useful thing.
 */
export const cvAbstentionSchema = z.object({
  abstained: z.literal(true),
  reason: z.enum([
    "insufficient_source_information",
    "requires_human_clarification",
    "outside_approved_task",
  ]),
  explanation: z.string().min(1).max(1000),
});
