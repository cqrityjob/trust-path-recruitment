// What a candidate may learn about an interview about them.
//
// Deliberately a small file. The employer runtime is 21 tables and a dozen
// RPCs; this is three reads and one write, because almost nothing in that
// runtime is the candidate's to see.
//
// The boundary that matters is the STATUS. An employer's deliberation --
// evidence under review, assessed, report written -- collapses into a single
// candidate-facing state. A candidate who could watch their case move from
// "evidence review" to "assessed" would be watching the employer think, would
// read meaning into the timing, and would be learning something no recruitment
// process has ever offered to tell them. The projection lives in the database
// (scp_iv_candidate_interview_status) so this file cannot widen it by mistake.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The four states a candidate is told about, and nothing finer.
 *
 * `employer_process_continuing` is four internal states in a trenchcoat, and
 * that is the point: it is true, it is useful, and it does not report on
 * somebody else's judgement while it is being formed.
 */
export type CandidateInterviewStatus =
  | "interview_offered"
  | "interview_in_progress"
  | "employer_process_continuing";

export interface CandidateInterviewRow {
  readonly applicationId: string | null;
  readonly caseId: string;
  readonly employerName: string | null;
  readonly roleTitle: string | null;
  readonly status: CandidateInterviewStatus;
  readonly updatedAt: string;
}

export const listMyInterviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly CandidateInterviewRow[]> => {
    const { data, error } = await context.supabase.rpc("scp_iv_candidate_interview_status");
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => r.candidate_status !== null)
      .map((r) => ({
        applicationId: (r.application_id as string | null) ?? null,
        caseId: r.case_id as string,
        employerName: (r.employer_name as string | null) ?? null,
        roleTitle: (r.role_title as string | null) ?? null,
        status: r.candidate_status as CandidateInterviewStatus,
        updatedAt: r.updated_at as string,
      }));
  });

/** One kind of material being processed — never the material itself. */
export interface CandidateSourceSummary {
  readonly kind: string;
  readonly label: string;
  readonly origin: string | null;
  readonly purpose: string | null;
  readonly erased: boolean;
  readonly fromYourPassportDisclosure: boolean;
}

export interface CandidateInterviewDetail {
  readonly caseId: string;
  readonly employerName: string | null;
  readonly roleTitle: string | null;
  readonly status: CandidateInterviewStatus;
  readonly sources: readonly CandidateSourceSummary[];
  readonly transcriptInUse: boolean;
  readonly retainUntil: string | null;
}

const caseInput = z.object({ caseId: z.string().uuid() });

export const getMyInterviewDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<CandidateInterviewDetail> => {
    const { data: raw, error } = await context.supabase.rpc("scp_iv_candidate_interview_detail", {
      _case_id: data.caseId,
    });
    if (error) throw new Error(error.message);

    const d = raw as unknown as Record<string, unknown>;
    const sources = (d.sources ?? []) as Array<Record<string, unknown>>;

    return {
      caseId: d.case_id as string,
      employerName: (d.employer_name as string | null) ?? null,
      roleTitle: (d.role_title as string | null) ?? null,
      status: d.candidate_status as CandidateInterviewStatus,
      sources: sources.map((s) => ({
        kind: s.kind as string,
        label: s.label as string,
        origin: (s.origin as string | null) ?? null,
        purpose: (s.purpose as string | null) ?? null,
        erased: Boolean(s.erased),
        fromYourPassportDisclosure: Boolean(s.from_your_passport_disclosure),
      })),
      transcriptInUse: Boolean(d.transcript_in_use),
      retainUntil: (d.retain_until as string | null) ?? null,
    };
  });

/**
 * Report a factual error.
 *
 * A candidate saying "you have my employment dates wrong" is correcting the
 * RECORD. A candidate saying "you underrated my answer" is disputing a
 * JUDGEMENT, and this is not the route for it: the correction lands as its own
 * attributed row for a human to read, and cannot touch evidence, an assessment
 * or a finalised report. A product that let the subject of a judgement rewrite
 * it would not be recording a judgement at all.
 */
export const reportInterviewFactualError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        whatIsWrong: z.string().min(3).max(2000),
        whatIsCorrect: z.string().min(3).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly id: string }> => {
    const { data: row, error } = await context.supabase
      .from("scp_interview_candidate_corrections")
      .insert({
        case_id: data.caseId,
        candidate_user_id: context.userId,
        what_is_wrong: data.whatIsWrong,
        what_is_correct: data.whatIsCorrect,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
