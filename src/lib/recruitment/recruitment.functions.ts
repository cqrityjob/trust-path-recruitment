// The recruitment workspace's server functions.
//
// ── WHERE AUTHORISATION LIVES ───────────────────────────────────────────────
//
// Not here. Every read below runs on the caller's own RLS-scoped client, and
// every write is a SECURITY DEFINER function in 20261207090000 that re-derives
// the caller's organisation from the row it touches. What this file adds is:
//
//   * a membership pre-check, so a stranger gets a clean "not available" before
//     any query instead of a page of empty lists that looks like an empty
//     recruitment (a permission failure must never render as "no candidates");
//   * one service-role read, for candidate DISPLAY NAMES only, of exactly the
//     applicant ids the RLS-scoped query already returned -- the pattern
//     listApplicationsForEmployer has used since H1;
//   * the e-mail copy of a message, between the database's claim and settle.
//
// Thrown messages are stable UPPER_SNAKE codes, never Postgres text, so no
// internal name reaches a browser and every code has a translated sentence.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUnresolved, isNewApplication, phaseOf, type RecruitmentPhase } from "./definitions";

// PostgREST rows and the request-scoped client, as every server function in
// src/lib/job-intelligence types them: the joined selects here are wider than
// the generated types describe. One named alias rather than a scattered `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

type Ctx = { supabase: Loose; userId: string };

const KNOWN_CODES = [
  "RECRUITMENT_NOT_FOUND",
  "RECRUITMENT_NOT_PERMITTED",
  "RECRUITMENT_DECISION_NOT_PERMITTED",
  "RECRUITMENT_COMPLETED",
  "RECRUITMENT_STILL_ACCEPTING",
  "RECRUITMENT_HAS_UNRESOLVED",
  "RECRUITMENT_ALREADY_COMPLETED",
  "RECRUITMENT_NOT_COMPLETED",
  "RESPONSIBLE_NOT_A_MEMBER",
  "STALE_VERSION",
  "STALE_APPLICATION_STAGE",
  "APPLICATION_NOT_FOUND",
  "APPLICATION_NOT_OPEN",
  "VACANCY_STRUCTURE_LOCKED",
  "VACANCY_STRUCTURE_INVALID",
  "BOOKING_NOT_FOUND",
  "BOOKING_NOT_EDITABLE",
  "BOOKING_TIMEZONE_INVALID",
  "MESSAGE_NOT_FOUND",
  "MESSAGE_NOT_EDITABLE",
  "MESSAGE_KEY_REUSED",
] as const;
export type RecruitmentErrorCode =
  | (typeof KNOWN_CODES)[number]
  | "INVALID_TRANSITION"
  | "RECRUITMENT_ACTION_FAILED";

function toCode(
  error: { message?: string; code?: string } | null | undefined,
  context: string,
): Error {
  const message = String(error?.message ?? "");
  const known = KNOWN_CODES.find((c) => message.includes(c));
  if (known) return new Error(known);
  console.error(`[recruitment] ${context} failed`, error);
  if (error?.code === "23514" && /transition/i.test(message))
    return new Error("INVALID_TRANSITION");
  if (error?.code === "23514") return new Error("VACANCY_STRUCTURE_INVALID");
  return new Error("RECRUITMENT_ACTION_FAILED");
}

type Role = "owner" | "admin" | "member";

/** Active membership of an ACTIVE organisation, and the caller's role there. */
async function requireMember(ctx: Ctx, employerId: string): Promise<{ role: Role }> {
  const { data, error } = await ctx.supabase
    .from("employer_memberships")
    .select("role, employers!inner(status)")
    .eq("user_id", ctx.userId)
    .eq("employer_id", employerId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    console.error("[recruitment] membership check failed", error);
    throw new Error("RECRUITMENT_ACTION_FAILED");
  }
  const emp = data ? (Array.isArray(data.employers) ? data.employers[0] : data.employers) : null;
  if (!data || !emp || emp.status !== "active") throw new Error("RECRUITMENT_NOT_FOUND");
  return { role: data.role as Role };
}

async function displayNames(userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return out;
  // Best-effort enrichment of rows that are already authorised and complete.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids);
    for (const p of data ?? []) out.set(p.id as string, (p.display_name as string | null) ?? null);
  } catch (e) {
    console.error("[recruitment] display-name lookup unavailable; rows render without names", e);
  }
  return out;
}

export type TeamMember = { userId: string; name: string; role: Role; isSelf: boolean };

async function readTeam(ctx: Ctx, employerId: string): Promise<TeamMember[]> {
  const { data, error } = await ctx.supabase.rpc("scp_employer_team", { _employer_id: employerId });
  if (error) {
    console.error("[recruitment] team read failed", error);
    throw new Error("RECRUITMENT_ACTION_FAILED");
  }
  return (data ?? [])
    .filter((m: Loose) => m.membership_status === "active")
    .map((m: Loose) => ({
      userId: m.user_id as string,
      name: (m.display_name as string) ?? "",
      role: m.employer_role as Role,
      isSelf: Boolean(m.is_self),
    }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Overview: recruitments, counts and upcoming interviews
// ═══════════════════════════════════════════════════════════════════════════

export type RecruitmentSummary = {
  jobId: string;
  titleSv: string | null;
  titleEn: string | null;
  jobStatus: string;
  phase: RecruitmentPhase;
  applicationMethod: string;
  publishedAt: string | null;
  deadlineAt: string | null;
  updatedAt: string;
  responsibleUserId: string | null;
  responsibleName: string | null;
  total: number;
  newCount: number;
  unresolved: number;
  interviewStage: number;
  nextInterviewAt: string | null;
};

export type UpcomingInterview = {
  bookingId: string;
  applicationId: string;
  jobId: string;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  candidateName: string | null;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  locationKind: string;
  status: string;
};

export type RecruitmentOverview = {
  recruitments: RecruitmentSummary[];
  upcomingInterviews: UpcomingInterview[];
  team: TeamMember[];
  myUserId: string;
  role: Role;
};

export const getRecruitmentOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RecruitmentOverview> => {
    const ctx = context as Ctx;
    const { role } = await requireMember(ctx, data.employerId);

    const [jobsRes, settingsRes, appsRes, bookingsRes, team] = await Promise.all([
      ctx.supabase
        .from("jobs")
        .select(
          "id, title_sv, title_en, status, application_method, published_at, deadline_at, expires_at, updated_at",
        )
        .eq("employer_id", data.employerId)
        .order("updated_at", { ascending: false })
        .limit(500),
      ctx.supabase
        .from("recruitment_settings")
        .select("job_id, responsible_user_id, completion_state")
        .eq("employer_id", data.employerId),
      ctx.supabase
        .from("job_applications")
        .select("id, job_id, status, applicant_user_id")
        .eq("employer_id", data.employerId)
        .limit(5000),
      ctx.supabase
        .from("recruitment_interview_bookings")
        .select(
          "id, application_id, job_id, starts_at, duration_minutes, timezone, location_kind, status",
        )
        .eq("employer_id", data.employerId)
        .in("status", ["planned", "invited", "confirmed"])
        .gte("starts_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(50),
      readTeam(ctx, data.employerId),
    ]);
    for (const [res, what] of [
      [jobsRes, "jobs"],
      [settingsRes, "settings"],
      [appsRes, "applications"],
      [bookingsRes, "bookings"],
    ] as const) {
      if (res.error) {
        console.error(`[recruitment] overview ${what} read failed`, res.error);
        throw new Error("RECRUITMENT_ACTION_FAILED");
      }
    }

    const teamNames = new Map(team.map((m) => [m.userId, m.name]));
    const settings = new Map<string, { responsible: string | null; completion: string }>(
      (settingsRes.data ?? []).map((s: Loose) => [
        s.job_id,
        { responsible: s.responsible_user_id ?? null, completion: s.completion_state },
      ]),
    );
    const apps = (appsRes.data ?? []) as {
      id: string;
      job_id: string;
      status: string;
      applicant_user_id: string;
    }[];
    const bookings = (bookingsRes.data ?? []) as Loose[];
    const nextByJob = new Map<string, string>();
    for (const b of bookings) if (!nextByJob.has(b.job_id)) nextByJob.set(b.job_id, b.starts_at);

    const now = new Date();
    const recruitments: RecruitmentSummary[] = (jobsRes.data ?? []).map((j: Loose) => {
      const s = settings.get(j.id);
      const mine = apps.filter((a) => a.job_id === j.id);
      const phase = phaseOf(
        {
          jobStatus: j.status,
          publishedAt: j.published_at,
          deadlineAt: j.deadline_at,
          expiresAt: j.expires_at,
          completionState:
            (s?.completion as "open" | "completed" | "cancelled" | undefined) ?? null,
        },
        now,
      );
      return {
        jobId: j.id,
        titleSv: j.title_sv,
        titleEn: j.title_en,
        jobStatus: j.status,
        phase,
        applicationMethod: j.application_method,
        publishedAt: j.published_at,
        deadlineAt: j.deadline_at,
        updatedAt: j.updated_at,
        responsibleUserId: s?.responsible ?? null,
        responsibleName: s?.responsible ? (teamNames.get(s.responsible) ?? null) : null,
        total: mine.length,
        newCount: mine.filter((a) => isNewApplication(a.status)).length,
        unresolved: mine.filter((a) => isUnresolved(a.status)).length,
        interviewStage: mine.filter((a) => a.status === "interview").length,
        nextInterviewAt: nextByJob.get(j.id) ?? null,
      };
    });

    const jobTitles = new Map<string, { sv: string | null; en: string | null }>(
      (jobsRes.data ?? []).map((j: Loose) => [j.id, { sv: j.title_sv, en: j.title_en }]),
    );
    const applicantOf = new Map(apps.map((a) => [a.id, a.applicant_user_id]));
    const names = await displayNames(bookings.map((b) => applicantOf.get(b.application_id) ?? ""));
    const upcomingInterviews: UpcomingInterview[] = bookings.slice(0, 20).map((b) => ({
      bookingId: b.id,
      applicationId: b.application_id,
      jobId: b.job_id,
      jobTitleSv: jobTitles.get(b.job_id)?.sv ?? null,
      jobTitleEn: jobTitles.get(b.job_id)?.en ?? null,
      candidateName: names.get(applicantOf.get(b.application_id) ?? "") ?? null,
      startsAt: b.starts_at,
      durationMinutes: b.duration_minutes,
      timezone: b.timezone,
      locationKind: b.location_kind,
      status: b.status,
    }));

    return { recruitments, upcomingInterviews, team, myUserId: ctx.userId, role };
  });

// ═══════════════════════════════════════════════════════════════════════════
// One recruitment
// ═══════════════════════════════════════════════════════════════════════════

export type RequirementRow = {
  id: string;
  kind: "mandatory" | "desirable";
  labelSv: string | null;
  labelEn: string | null;
  position: number;
};

export type QuestionRow = {
  id: string;
  requirementId: string | null;
  promptSv: string | null;
  promptEn: string | null;
  answerKind: "text" | "yes_no";
  isRequired: boolean;
  position: number;
};

export type RecruitmentDetail = {
  jobId: string;
  settings: {
    responsibleUserId: string | null;
    completionState: "open" | "completed" | "cancelled";
    completedAt: string | null;
    completionNote: string | null;
    version: number;
  };
  requirements: RequirementRow[];
  questions: QuestionRow[];
  structureLocked: boolean;
  team: TeamMember[];
  role: Role;
  myUserId: string;
  /** The same rule rec_can_manage() applies: owner/admin, or responsible. */
  canManage: boolean;
};

async function readStructure(ctx: Ctx, jobId: string) {
  const [reqRes, qRes] = await Promise.all([
    ctx.supabase
      .from("recruitment_requirements")
      .select("id, kind, label_sv, label_en, position")
      .eq("job_id", jobId)
      .order("position"),
    ctx.supabase
      .from("recruitment_questions")
      .select("id, requirement_id, prompt_sv, prompt_en, answer_kind, is_required, position")
      .eq("job_id", jobId)
      .order("position"),
  ]);
  if (reqRes.error || qRes.error) {
    console.error("[recruitment] structure read failed", reqRes.error ?? qRes.error);
    throw new Error("RECRUITMENT_ACTION_FAILED");
  }
  const requirements: RequirementRow[] = (reqRes.data ?? []).map((r: Loose) => ({
    id: r.id,
    kind: r.kind,
    labelSv: r.label_sv,
    labelEn: r.label_en,
    position: r.position,
  }));
  const questions: QuestionRow[] = (qRes.data ?? []).map((q: Loose) => ({
    id: q.id,
    requirementId: q.requirement_id,
    promptSv: q.prompt_sv,
    promptEn: q.prompt_en,
    answerKind: q.answer_kind,
    isRequired: q.is_required,
    position: q.position,
  }));
  return { requirements, questions };
}

export const getRecruitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), jobId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<RecruitmentDetail> => {
    const ctx = context as Ctx;
    const { role } = await requireMember(ctx, data.employerId);

    const { data: job, error: jobErr } = await ctx.supabase
      .from("jobs")
      .select("id")
      .eq("id", data.jobId)
      .eq("employer_id", data.employerId)
      .maybeSingle();
    if (jobErr) throw toCode(jobErr, "getRecruitment job");
    if (!job) throw new Error("RECRUITMENT_NOT_FOUND");

    const [settingsRes, structure, appCount, team] = await Promise.all([
      ctx.supabase
        .from("recruitment_settings")
        .select("responsible_user_id, completion_state, completed_at, completion_note, version")
        .eq("job_id", data.jobId)
        .maybeSingle(),
      readStructure(ctx, data.jobId),
      ctx.supabase
        .from("job_applications")
        .select("id", { count: "exact", head: true })
        .eq("job_id", data.jobId),
      readTeam(ctx, data.employerId),
    ]);
    if (settingsRes.error || appCount.error)
      throw toCode(settingsRes.error ?? appCount.error, "getRecruitment");

    const s = settingsRes.data;
    const responsibleUserId = (s?.responsible_user_id as string | null) ?? null;
    return {
      jobId: data.jobId,
      settings: {
        responsibleUserId,
        completionState: (s?.completion_state as "open" | "completed" | "cancelled") ?? "open",
        completedAt: s?.completed_at ?? null,
        completionNote: s?.completion_note ?? null,
        version: (s?.version as number) ?? 1,
      },
      ...structure,
      structureLocked: (appCount.count ?? 0) > 0,
      team,
      role,
      myUserId: ctx.userId,
      canManage: role === "owner" || role === "admin" || responsibleUserId === ctx.userId,
    };
  });

const requirementInput = z.object({
  key: z.string().min(1).max(40),
  kind: z.enum(["mandatory", "desirable"]),
  label_sv: z.string().trim().max(300).optional().nullable(),
  label_en: z.string().trim().max(300).optional().nullable(),
});
const questionInput = z.object({
  requirement_key: z.string().max(40).optional().nullable(),
  prompt_sv: z.string().trim().max(500).optional().nullable(),
  prompt_en: z.string().trim().max(500).optional().nullable(),
  answer_kind: z.enum(["text", "yes_no"]),
  is_required: z.boolean(),
});

export const saveVacancyStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        requirements: z.array(requirementInput).max(30),
        questions: z.array(questionInput).max(15),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    // Rows with no text in either language are not requirements; drop them
    // rather than let the database refuse the whole set.
    const requirements = data.requirements.filter(
      (r) => (r.label_sv ?? "").trim() || (r.label_en ?? "").trim(),
    );
    const keys = new Set(requirements.map((r) => r.key));
    const questions = data.questions
      .filter((q) => (q.prompt_sv ?? "").trim() || (q.prompt_en ?? "").trim())
      .map((q) => ({
        ...q,
        requirement_key:
          q.requirement_key && keys.has(q.requirement_key) ? q.requirement_key : null,
      }));
    const { data: result, error } = await ctx.supabase.rpc("rec_save_vacancy_structure", {
      _job_id: data.jobId,
      _requirements: requirements,
      _questions: questions,
    });
    if (error) throw toCode(error, "saveVacancyStructure");
    return result as { requirements: number; questions: number };
  });

export const setRecruitmentResponsible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        userId: z.string().uuid().nullable(),
        expectedVersion: z.number().int().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: version, error } = await ctx.supabase.rpc("rec_set_recruitment_responsible", {
      _job_id: data.jobId,
      _user_id: data.userId,
      _expected_version: data.expectedVersion,
    });
    if (error) throw toCode(error, "setRecruitmentResponsible");
    return { version: version as number };
  });

export const completeRecruitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        state: z.enum(["completed", "cancelled"]),
        note: z.string().trim().max(2000).nullable(),
        expectedVersion: z.number().int().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: version, error } = await ctx.supabase.rpc("rec_complete_recruitment", {
      _job_id: data.jobId,
      _state: data.state,
      _note: data.note,
      _expected_version: data.expectedVersion,
    });
    if (error) throw toCode(error, "completeRecruitment");
    return { version: version as number };
  });

export const reopenRecruitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: version, error } = await ctx.supabase.rpc("rec_reopen_recruitment", {
      _job_id: data.jobId,
    });
    if (error) throw toCode(error, "reopenRecruitment");
    return { version: version as number };
  });

// ═══════════════════════════════════════════════════════════════════════════
// Candidates
// ═══════════════════════════════════════════════════════════════════════════

export type CandidateRow = {
  applicationId: string;
  jobId: string;
  jobTitle: string | null;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  name: string | null;
  status: string;
  appliedAt: string;
  updatedAt: string;
  firstViewedAt: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  metaVersion: number;
  nextActivityAt: string | null;
  nextActivityTimezone: string | null;
  nextActivityStatus: string | null;
  hasCv: boolean;
  /** Mandatory yes/no questions the candidate answered "no" to. A fact about
   *  their answers, shown as such -- never a filter that removes anybody. */
  mandatoryNoCount: number;
  answeredCount: number;
};

export const listRecruitmentCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), jobId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CandidateRow[]> => {
    const ctx = context as Ctx;
    await requireMember(ctx, data.employerId);

    let appsQuery = ctx.supabase
      .from("job_applications")
      .select(
        "id, job_id, applicant_user_id, status, cv_storage_path, cv_source, created_at, updated_at, jobs(title_sv, title_en)",
      )
      .eq("employer_id", data.employerId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data.jobId) appsQuery = appsQuery.eq("job_id", data.jobId);
    const appsRes = await appsQuery;
    if (appsRes.error) throw toCode(appsRes.error, "listRecruitmentCandidates applications");
    const apps = (appsRes.data ?? []) as Loose[];
    if (apps.length === 0) return [];
    const ids = apps.map((a) => a.id as string);

    // Chunked: an `in` list of a few thousand ids does not fit in one URL.
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    const [metaRows, bookingRows, answerRows, team] = await Promise.all([
      Promise.all(
        chunks.map((c) =>
          ctx.supabase
            .from("recruitment_application_meta")
            .select("application_id, responsible_user_id, first_viewed_at, version")
            .in("application_id", c),
        ),
      ),
      Promise.all(
        chunks.map((c) =>
          ctx.supabase
            .from("recruitment_interview_bookings")
            .select("application_id, starts_at, timezone, status")
            .in("application_id", c)
            .in("status", ["planned", "invited", "confirmed"])
            .order("starts_at", { ascending: true }),
        ),
      ),
      Promise.all(
        chunks.map((c) =>
          ctx.supabase
            .from("job_application_answers")
            .select(
              "application_id, question_id, answer_kind, answer_bool, recruitment_questions(requirement_id, recruitment_requirements(kind))",
            )
            .in("application_id", c),
        ),
      ),
      readTeam(ctx, data.employerId),
    ]);
    for (const res of [...metaRows, ...bookingRows, ...answerRows]) {
      if (res.error) throw toCode(res.error, "listRecruitmentCandidates enrichment");
    }

    const meta = new Map<string, Loose>();
    for (const r of metaRows.flatMap((x) => x.data ?? [])) meta.set(r.application_id, r);
    const nextBooking = new Map<string, Loose>();
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const b of bookingRows.flatMap((x) => x.data ?? [])) {
      if (Date.parse(b.starts_at) < cutoff) continue;
      if (!nextBooking.has(b.application_id)) nextBooking.set(b.application_id, b);
    }
    const answers = new Map<string, { count: number; mandatoryNo: number }>();
    for (const a of answerRows.flatMap((x) => x.data ?? [])) {
      const cur = answers.get(a.application_id) ?? { count: 0, mandatoryNo: 0 };
      cur.count += 1;
      const q = Array.isArray(a.recruitment_questions)
        ? a.recruitment_questions[0]
        : a.recruitment_questions;
      const req = q
        ? Array.isArray(q.recruitment_requirements)
          ? q.recruitment_requirements[0]
          : q.recruitment_requirements
        : null;
      if (a.answer_kind === "yes_no" && a.answer_bool === false && req?.kind === "mandatory")
        cur.mandatoryNo += 1;
      answers.set(a.application_id, cur);
    }
    const teamNames = new Map(team.map((m) => [m.userId, m.name]));
    const names = await displayNames(apps.map((a) => a.applicant_user_id));

    return apps.map((a) => {
      const job = Array.isArray(a.jobs) ? a.jobs[0] : a.jobs;
      const m = meta.get(a.id);
      const b = nextBooking.get(a.id);
      const ans = answers.get(a.id);
      return {
        applicationId: a.id,
        jobId: a.job_id,
        jobTitle: job?.title_sv ?? job?.title_en ?? null,
        jobTitleSv: job?.title_sv ?? null,
        jobTitleEn: job?.title_en ?? null,
        name: names.get(a.applicant_user_id) ?? null,
        status: a.status,
        appliedAt: a.created_at,
        updatedAt: a.updated_at,
        firstViewedAt: m?.first_viewed_at ?? null,
        responsibleUserId: m?.responsible_user_id ?? null,
        responsibleName: m?.responsible_user_id
          ? (teamNames.get(m.responsible_user_id) ?? null)
          : null,
        metaVersion: (m?.version as number) ?? 1,
        nextActivityAt: b?.starts_at ?? null,
        nextActivityTimezone: b?.timezone ?? null,
        nextActivityStatus: b?.status ?? null,
        hasCv: Boolean(a.cv_storage_path) || a.cv_source === "cqrityjob_cv",
        mandatoryNoCount: ans?.mandatoryNo ?? 0,
        answeredCount: ans?.count ?? 0,
      };
    });
  });

// ═══════════════════════════════════════════════════════════════════════════
// One application
// ═══════════════════════════════════════════════════════════════════════════

export type AnswerRow = {
  questionId: string;
  promptSv: string | null;
  promptEn: string | null;
  answerKind: "text" | "yes_no";
  answerText: string | null;
  answerBool: boolean | null;
  requirementKind: "mandatory" | "desirable" | null;
  requirementLabelSv: string | null;
  requirementLabelEn: string | null;
};

export type CommentRow = {
  id: string;
  authorName: string | null;
  isMine: boolean;
  body: string;
  createdAt: string;
};

export type MessageRow = {
  id: string;
  kind: string;
  subject: string;
  body: string;
  language: "sv" | "en";
  status: "draft" | "sent" | "discarded";
  emailStatus: "not_attempted" | "sending" | "sent" | "failed" | "not_configured";
  emailError: string | null;
  emailAttempts: number;
  bookingId: string | null;
  createdAt: string;
  sentAt: string | null;
  authorName: string | null;
};

export type BookingRow = {
  id: string;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  locationKind: "onsite" | "video" | "phone";
  locationText: string | null;
  meetingUrl: string | null;
  interviewerNames: string | null;
  status: "planned" | "invited" | "confirmed" | "declined" | "cancelled" | "completed";
  invitedAt: string | null;
  candidateResponseAt: string | null;
  cancelledReason: string | null;
  version: number;
};

export type StageEvent = {
  id: string;
  actorRole: "candidate" | "employer";
  actorName: string | null;
  previousStatus: string;
  newStatus: string;
  note: string | null;
  createdAt: string;
};

export type ApplicationWorkspace = {
  applicationId: string;
  jobId: string;
  status: string;
  appliedAt: string;
  answers: AnswerRow[];
  meta: { responsibleUserId: string | null; firstViewedAt: string | null; version: number };
  comments: CommentRow[];
  messages: MessageRow[];
  bookings: BookingRow[];
  events: StageEvent[];
  recruitmentResponsibleUserId: string | null;
  completionState: "open" | "completed" | "cancelled";
  team: TeamMember[];
  role: Role;
  canManage: boolean;
};

export const getApplicationWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), applicationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ApplicationWorkspace> => {
    const ctx = context as Ctx;
    const { role } = await requireMember(ctx, data.employerId);

    const { data: app, error: appErr } = await ctx.supabase
      .from("job_applications")
      .select("id, job_id, status, created_at")
      .eq("id", data.applicationId)
      .eq("employer_id", data.employerId)
      .maybeSingle();
    if (appErr) throw toCode(appErr, "getApplicationWorkspace application");
    if (!app) throw new Error("APPLICATION_NOT_FOUND");

    const [
      answersRes,
      metaRes,
      commentsRes,
      messagesRes,
      bookingsRes,
      eventsRes,
      settingsRes,
      team,
    ] = await Promise.all([
      ctx.supabase
        .from("job_application_answers")
        .select(
          "question_id, prompt_sv_snapshot, prompt_en_snapshot, answer_kind, answer_text, answer_bool, recruitment_questions(position, requirement_id, recruitment_requirements(kind, label_sv, label_en))",
        )
        .eq("application_id", app.id),
      ctx.supabase
        .from("recruitment_application_meta")
        .select("responsible_user_id, first_viewed_at, version")
        .eq("application_id", app.id)
        .maybeSingle(),
      ctx.supabase
        .from("recruitment_comments")
        .select("id, author_user_id, body, created_at")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false }),
      ctx.supabase
        .from("recruitment_messages")
        .select(
          "id, kind, subject, body, language, status, email_status, email_error, email_attempts, booking_id, created_at, sent_at, created_by",
        )
        .eq("application_id", app.id)
        .neq("status", "discarded")
        .order("created_at", { ascending: false }),
      ctx.supabase
        .from("recruitment_interview_bookings")
        .select(
          "id, starts_at, duration_minutes, timezone, location_kind, location_text, meeting_url, interviewer_names, status, invited_at, candidate_response_at, cancelled_reason, version",
        )
        .eq("application_id", app.id)
        .order("starts_at", { ascending: true }),
      ctx.supabase
        .from("job_application_status_events")
        .select("id, actor_role, actor_user_id, previous_status, new_status, note, created_at")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false }),
      ctx.supabase
        .from("recruitment_settings")
        .select("responsible_user_id, completion_state")
        .eq("job_id", app.job_id)
        .maybeSingle(),
      readTeam(ctx, data.employerId),
    ]);
    for (const res of [
      answersRes,
      metaRes,
      commentsRes,
      messagesRes,
      bookingsRes,
      eventsRes,
      settingsRes,
    ]) {
      if (res.error) throw toCode(res.error, "getApplicationWorkspace");
    }

    const teamNames = new Map(team.map((m) => [m.userId, m.name]));
    const answers: AnswerRow[] = ((answersRes.data ?? []) as Loose[])
      .map((a) => {
        const q = Array.isArray(a.recruitment_questions)
          ? a.recruitment_questions[0]
          : a.recruitment_questions;
        const r = q
          ? Array.isArray(q.recruitment_requirements)
            ? q.recruitment_requirements[0]
            : q.recruitment_requirements
          : null;
        return {
          position: (q?.position as number) ?? 0,
          row: {
            questionId: a.question_id,
            promptSv: a.prompt_sv_snapshot,
            promptEn: a.prompt_en_snapshot,
            answerKind: a.answer_kind,
            answerText: a.answer_text,
            answerBool: a.answer_bool,
            requirementKind: r?.kind ?? null,
            requirementLabelSv: r?.label_sv ?? null,
            requirementLabelEn: r?.label_en ?? null,
          } as AnswerRow,
        };
      })
      .sort((x, y) => x.position - y.position)
      .map((x) => x.row);

    const recruitmentResponsible = (settingsRes.data?.responsible_user_id as string | null) ?? null;
    return {
      applicationId: app.id,
      jobId: app.job_id,
      status: app.status,
      appliedAt: app.created_at,
      answers,
      meta: {
        responsibleUserId: metaRes.data?.responsible_user_id ?? null,
        firstViewedAt: metaRes.data?.first_viewed_at ?? null,
        version: (metaRes.data?.version as number) ?? 1,
      },
      comments: ((commentsRes.data ?? []) as Loose[]).map((c) => ({
        id: c.id,
        authorName: c.author_user_id ? (teamNames.get(c.author_user_id) ?? null) : null,
        isMine: c.author_user_id === ctx.userId,
        body: c.body,
        createdAt: c.created_at,
      })),
      messages: ((messagesRes.data ?? []) as Loose[]).map((m) => ({
        id: m.id,
        kind: m.kind,
        subject: m.subject,
        body: m.body,
        language: m.language,
        status: m.status,
        emailStatus: m.email_status,
        emailError: m.email_error,
        emailAttempts: m.email_attempts,
        bookingId: m.booking_id,
        createdAt: m.created_at,
        sentAt: m.sent_at,
        authorName: m.created_by ? (teamNames.get(m.created_by) ?? null) : null,
      })),
      bookings: ((bookingsRes.data ?? []) as Loose[]).map((b) => ({
        id: b.id,
        startsAt: b.starts_at,
        durationMinutes: b.duration_minutes,
        timezone: b.timezone,
        locationKind: b.location_kind,
        locationText: b.location_text,
        meetingUrl: b.meeting_url,
        interviewerNames: b.interviewer_names,
        status: b.status,
        invitedAt: b.invited_at,
        candidateResponseAt: b.candidate_response_at,
        cancelledReason: b.cancelled_reason,
        version: b.version,
      })),
      events: ((eventsRes.data ?? []) as Loose[]).map((e) => ({
        id: e.id,
        actorRole: e.actor_role,
        actorName:
          e.actor_role === "employer" && e.actor_user_id
            ? (teamNames.get(e.actor_user_id) ?? null)
            : null,
        previousStatus: e.previous_status,
        newStatus: e.new_status,
        note: e.note,
        createdAt: e.created_at,
      })),
      recruitmentResponsibleUserId: recruitmentResponsible,
      completionState:
        (settingsRes.data?.completion_state as "open" | "completed" | "cancelled") ?? "open",
      team,
      role,
      canManage: role === "owner" || role === "admin" || recruitmentResponsible === ctx.userId,
    };
  });

export const markApplicationViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: at, error } = await ctx.supabase.rpc("rec_mark_application_viewed", {
      _application_id: data.applicationId,
    });
    if (error) throw toCode(error, "markApplicationViewed");
    return { firstViewedAt: at as string };
  });

export const setApplicationResponsible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        userId: z.string().uuid().nullable(),
        expectedVersion: z.number().int().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: version, error } = await ctx.supabase.rpc("rec_set_application_responsible", {
      _application_id: data.applicationId,
      _user_id: data.userId,
      _expected_version: data.expectedVersion,
    });
    if (error) throw toCode(error, "setApplicationResponsible");
    return { version: version as number };
  });

const stageItem = z.object({
  applicationId: z.string().uuid(),
  expectedStatus: z.enum(["submitted", "reviewing", "interview"]),
});

/** Moves one or several applications, each from the stage the caller SAW.
 *  Reports per application, so a batch where one colleague got there first
 *  says exactly which candidate moved and which did not. It never sends
 *  anything to a candidate: telling them is a separate, explicit act. */
export const setApplicationStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        items: z.array(stageItem).min(1).max(100),
        newStatus: z.enum(["reviewing", "interview", "rejected", "hired"]),
        note: z.string().trim().max(1000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const results: { applicationId: string; ok: boolean; code: string | null }[] = [];
    for (const item of data.items) {
      const { error } = await ctx.supabase.rpc("rec_set_application_stage", {
        _application_id: item.applicationId,
        _expected_status: item.expectedStatus,
        _new_status: data.newStatus,
        _note: data.note,
      });
      results.push({
        applicationId: item.applicationId,
        ok: !error,
        code: error ? toCode(error, "setApplicationStages").message : null,
      });
    }
    return { results };
  });

export const addRecruitmentComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ applicationId: z.string().uuid(), body: z.string().trim().min(1).max(4000) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("rec_add_comment", {
      _application_id: data.applicationId,
      _body: data.body,
    });
    if (error) throw toCode(error, "addRecruitmentComment");
    return { id: id as string };
  });

// ── Bookings ────────────────────────────────────────────────────────────

export const saveInterviewBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        bookingId: z.string().uuid().nullable(),
        applicationId: z.string().uuid(),
        startsAt: z.string().datetime(),
        durationMinutes: z.number().int().min(10).max(480),
        timezone: z.string().min(1).max(64),
        locationKind: z.enum(["onsite", "video", "phone"]),
        locationText: z.string().trim().max(300).nullable(),
        meetingUrl: z
          .string()
          .trim()
          .max(500)
          .regex(/^https:\/\//)
          .nullable()
          .or(z.literal("").transform(() => null)),
        interviewerNames: z.string().trim().max(300).nullable(),
        expectedVersion: z.number().int().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: result, error } = await ctx.supabase.rpc("rec_save_booking", {
      _booking_id: data.bookingId,
      _application_id: data.applicationId,
      _starts_at: data.startsAt,
      _duration_minutes: data.durationMinutes,
      _timezone: data.timezone,
      _location_kind: data.locationKind,
      _location_text: data.locationText,
      _meeting_url: data.meetingUrl,
      _interviewer_names: data.interviewerNames,
      _expected_version: data.expectedVersion,
    });
    if (error) {
      if (String(error.message ?? "").includes("recruitment_bookings_where"))
        throw new Error("BOOKING_LOCATION_MISSING");
      throw toCode(error, "saveInterviewBooking");
    }
    return result as { id: string; version: number; status: string };
  });

export const setInterviewBookingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        bookingId: z.string().uuid(),
        status: z.enum(["cancelled", "completed"]),
        reason: z.string().trim().max(500).nullable(),
        expectedVersion: z.number().int().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: version, error } = await ctx.supabase.rpc("rec_set_booking_status", {
      _booking_id: data.bookingId,
      _status: data.status,
      _reason: data.reason,
      _expected_version: data.expectedVersion,
    });
    if (error) throw toCode(error, "setInterviewBookingStatus");
    return { version: version as number };
  });

// ── Messages ────────────────────────────────────────────────────────────

const draftSchema = z.object({
  messageId: z.string().uuid().nullable(),
  applicationId: z.string().uuid(),
  kind: z.enum(["general", "interview_invitation", "rejection", "offer", "information"]),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  language: z.enum(["sv", "en"]),
  bookingId: z.string().uuid().nullable(),
  idempotencyKey: z.string().min(8).max(120).nullable(),
});

export const saveMessageDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("rec_save_message_draft", {
      _message_id: data.messageId,
      _application_id: data.applicationId,
      _kind: data.kind,
      _subject: data.subject,
      _body: data.body,
      _language: data.language,
      _booking_id: data.bookingId,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw toCode(error, "saveMessageDraft");
    return { id: id as string };
  });

export const discardMessageDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ messageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase.rpc("rec_discard_message_draft", {
      _message_id: data.messageId,
    });
    if (error) throw toCode(error, "discardMessageDraft");
    return { ok: true };
  });

export type SendOutcome = {
  messageId: string;
  /** What the database did with the message itself. */
  delivery: "delivered" | "already_sent" | "in_progress" | "refused";
  /** What happened to the e-mail copy -- only ever a provider's answer. */
  email: "sent" | "failed" | "not_configured" | "not_attempted" | "in_progress";
  code: string | null;
};

async function sendOne(ctx: Ctx, messageId: string): Promise<SendOutcome> {
  const { data: rows, error } = await ctx.supabase.rpc("rec_claim_message_send", {
    _message_id: messageId,
  });
  if (error) {
    return {
      messageId,
      delivery: "refused",
      email: "not_attempted",
      code: toCode(error, "claim").message,
    };
  }
  const claim = Array.isArray(rows) ? rows[0] : rows;
  if (!claim)
    return {
      messageId,
      delivery: "refused",
      email: "not_attempted",
      code: "RECRUITMENT_ACTION_FAILED",
    };
  if (claim.outcome === "already_sent")
    return { messageId, delivery: "already_sent", email: "sent", code: null };
  if (claim.outcome === "in_progress")
    return { messageId, delivery: "in_progress", email: "in_progress", code: null };

  const { sendRecruitmentMessageEmail } =
    await import("@/lib/email/send-recruitment-message-email.server");
  const { SITE_ORIGIN } = await import("@/lib/job-intelligence/seo");
  const result = claim.recipient_email
    ? await sendRecruitmentMessageEmail({
        recipientEmail: String(claim.recipient_email),
        language: claim.language === "en" ? "en" : "sv",
        subject: String(claim.subject),
        body: String(claim.body),
        employerName: String(claim.employer_name ?? ""),
        jobTitle: String(claim.job_title ?? ""),
        siteOrigin: process.env.PUBLIC_SITE_URL || SITE_ORIGIN,
      })
    : ({ result: "failed", error: "NO_ADDRESS" } as const);

  const { error: settleErr } = await ctx.supabase.rpc("rec_settle_message_send", {
    _message_id: messageId,
    _result: result.result,
    _error: result.result === "failed" ? result.error : null,
  });
  if (settleErr) {
    // The provider answered and we could not record it. Say so rather than
    // claiming a state the row does not hold; the claim expires and a retry
    // is safe.
    console.error("[recruitment] settle failed", settleErr);
    return {
      messageId,
      delivery: "delivered",
      email: "in_progress",
      code: "RECRUITMENT_ACTION_FAILED",
    };
  }
  return { messageId, delivery: "delivered", email: result.result, code: null };
}

export const sendRecruitmentMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ messageIds: z.array(z.string().uuid()).min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ outcomes: SendOutcome[] }> => {
    const ctx = context as Ctx;
    const outcomes: SendOutcome[] = [];
    for (const id of data.messageIds) outcomes.push(await sendOne(ctx, id));
    return { outcomes };
  });

// ═══════════════════════════════════════════════════════════════════════════
// Activity across one recruitment
// ═══════════════════════════════════════════════════════════════════════════

export type ActivityItem = {
  id: string;
  kind: "stage" | "message" | "booking" | "comment";
  at: string;
  applicationId: string;
  candidateName: string | null;
  actorName: string | null;
  detail: Record<string, string | null>;
};

export const listRecruitmentActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), jobId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ActivityItem[]> => {
    const ctx = context as Ctx;
    await requireMember(ctx, data.employerId);
    const [appsRes, eventsRes, messagesRes, bookingsRes, commentsRes, team] = await Promise.all([
      ctx.supabase
        .from("job_applications")
        .select("id, applicant_user_id")
        .eq("job_id", data.jobId)
        .eq("employer_id", data.employerId),
      ctx.supabase
        .from("job_application_status_events")
        .select(
          "id, application_id, actor_role, actor_user_id, previous_status, new_status, created_at",
        )
        .eq("job_id", data.jobId)
        .order("created_at", { ascending: false })
        .limit(200),
      ctx.supabase
        .from("recruitment_messages")
        .select("id, application_id, kind, subject, status, email_status, sent_at, sent_by")
        .eq("job_id", data.jobId)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(200),
      ctx.supabase
        .from("recruitment_interview_bookings")
        .select(
          "id, application_id, starts_at, timezone, status, created_by, created_at, updated_at",
        )
        .eq("job_id", data.jobId)
        .order("updated_at", { ascending: false })
        .limit(200),
      ctx.supabase
        .from("recruitment_comments")
        .select("id, application_id, author_user_id, created_at")
        .eq("job_id", data.jobId)
        .order("created_at", { ascending: false })
        .limit(200),
      readTeam(ctx, data.employerId),
    ]);
    for (const res of [appsRes, eventsRes, messagesRes, bookingsRes, commentsRes]) {
      if (res.error) throw toCode(res.error, "listRecruitmentActivity");
    }
    const applicant = new Map(
      ((appsRes.data ?? []) as Loose[]).map((a) => [a.id, a.applicant_user_id]),
    );
    const names = await displayNames([...applicant.values()]);
    const teamNames = new Map(team.map((m) => [m.userId, m.name]));
    const cand = (appId: string) => names.get(applicant.get(appId) ?? "") ?? null;
    const actor = (uid: string | null) => (uid ? (teamNames.get(uid) ?? null) : null);

    const items: ActivityItem[] = [
      ...((eventsRes.data ?? []) as Loose[]).map((e) => ({
        id: `stage-${e.id}`,
        kind: "stage" as const,
        at: e.created_at,
        applicationId: e.application_id,
        candidateName: cand(e.application_id),
        actorName: e.actor_role === "employer" ? actor(e.actor_user_id) : null,
        detail: { actorRole: e.actor_role, from: e.previous_status, to: e.new_status },
      })),
      ...((messagesRes.data ?? []) as Loose[]).map((m) => ({
        id: `message-${m.id}`,
        kind: "message" as const,
        at: m.sent_at,
        applicationId: m.application_id,
        candidateName: cand(m.application_id),
        actorName: actor(m.sent_by),
        detail: { messageKind: m.kind, subject: m.subject, emailStatus: m.email_status },
      })),
      ...((bookingsRes.data ?? []) as Loose[]).map((b) => ({
        id: `booking-${b.id}`,
        kind: "booking" as const,
        at: b.updated_at,
        applicationId: b.application_id,
        candidateName: cand(b.application_id),
        actorName: actor(b.created_by),
        detail: { status: b.status, startsAt: b.starts_at, timezone: b.timezone },
      })),
      ...((commentsRes.data ?? []) as Loose[]).map((c) => ({
        id: `comment-${c.id}`,
        kind: "comment" as const,
        at: c.created_at,
        applicationId: c.application_id,
        candidateName: cand(c.application_id),
        actorName: actor(c.author_user_id),
        detail: {},
      })),
    ];
    return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 300);
  });

// ═══════════════════════════════════════════════════════════════════════════
// The candidate's side
// ═══════════════════════════════════════════════════════════════════════════

export type CandidateInboxItem = {
  applicationId: string;
  messages: {
    id: string;
    kind: string;
    subject: string;
    body: string;
    sentAt: string;
    bookingId: string | null;
  }[];
  bookings: {
    id: string;
    startsAt: string;
    durationMinutes: number;
    timezone: string;
    locationKind: "onsite" | "video" | "phone";
    locationText: string | null;
    meetingUrl: string | null;
    interviewerNames: string | null;
    status: string;
  }[];
};

/** What an employer has sent the signed-in candidate, per application. The
 *  policies show a candidate only SENT messages and INVITED bookings on their
 *  own applications -- never a draft, never an internal comment. */
export const listMyRecruitmentInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CandidateInboxItem[]> => {
    const ctx = context as Ctx;
    const [messagesRes, bookingsRes] = await Promise.all([
      ctx.supabase
        .from("recruitment_messages")
        .select("id, application_id, kind, subject, body, sent_at, booking_id")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(200),
      ctx.supabase
        .from("recruitment_interview_bookings")
        .select(
          "id, application_id, starts_at, duration_minutes, timezone, location_kind, location_text, meeting_url, interviewer_names, status",
        )
        .not("invited_at", "is", null)
        .order("starts_at", { ascending: true })
        .limit(100),
    ]);
    if (messagesRes.error || bookingsRes.error) {
      console.error("[recruitment] inbox read failed", messagesRes.error ?? bookingsRes.error);
      throw new Error("RECRUITMENT_ACTION_FAILED");
    }
    const byApp = new Map<string, CandidateInboxItem>();
    const get = (id: string) => {
      let v = byApp.get(id);
      if (!v) {
        v = { applicationId: id, messages: [], bookings: [] };
        byApp.set(id, v);
      }
      return v;
    };
    for (const m of (messagesRes.data ?? []) as Loose[]) {
      get(m.application_id).messages.push({
        id: m.id,
        kind: m.kind,
        subject: m.subject,
        body: m.body,
        sentAt: m.sent_at,
        bookingId: m.booking_id,
      });
    }
    for (const b of (bookingsRes.data ?? []) as Loose[]) {
      get(b.application_id).bookings.push({
        id: b.id,
        startsAt: b.starts_at,
        durationMinutes: b.duration_minutes,
        timezone: b.timezone,
        locationKind: b.location_kind,
        locationText: b.location_text,
        meetingUrl: b.meeting_url,
        interviewerNames: b.interviewer_names,
        status: b.status,
      });
    }
    return [...byApp.values()];
  });

export const respondToInterviewBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ bookingId: z.string().uuid(), response: z.enum(["confirmed", "declined"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: status, error } = await ctx.supabase.rpc("rec_respond_to_booking", {
      _booking_id: data.bookingId,
      _response: data.response,
    });
    if (error) throw toCode(error, "respondToInterviewBooking");
    return { status: status as string };
  });

// ═══════════════════════════════════════════════════════════════════════════
// Role templates from the profession catalogue
// ═══════════════════════════════════════════════════════════════════════════

export type RequirementTemplate = {
  kind: "mandatory" | "desirable";
  labelSv: string;
  labelEn: string;
};

/** The published requirements of a security profession, as a starting point
 *  for a vacancy's own list. The same catalogue Employee 360 reads
 *  (cig_profession_competency_req); `mandatory` stays mandatory, `preferred`
 *  becomes desirable, and `informative` is left out -- it describes the
 *  profession, not what an employer must ask for. The employer edits the
 *  result; nothing is written until they save. */
export const getProfessionRequirementTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ professionSlug: z.string().min(1).max(120) }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ state: "ready" | "notPublished"; items: RequirementTemplate[] }> => {
      const ctx = context as Ctx;
      const { data: profession, error } = await ctx.supabase
        .from("cig_professions")
        .select("id")
        .eq("slug", data.professionSlug)
        .eq("content_status", "published")
        .maybeSingle();
      if (error) throw toCode(error, "getProfessionRequirementTemplate");
      if (!profession) return { state: "notPublished", items: [] };
      const { data: reqs, error: reqErr } = await ctx.supabase
        .from("cig_profession_competency_req")
        .select("competency_id, criticality, importance")
        .eq("profession_id", profession.id)
        .eq("content_status", "published")
        .in("criticality", ["mandatory", "preferred"]);
      if (reqErr) throw toCode(reqErr, "getProfessionRequirementTemplate reqs");
      const ids = [...new Set((reqs ?? []).map((r: Loose) => r.competency_id as string))];
      if (ids.length === 0) return { state: "ready", items: [] };
      const { data: comps, error: compErr } = await ctx.supabase
        .from("cig_competencies")
        .select("id, title_sv, title_en")
        .eq("content_status", "published")
        .in("id", ids);
      if (compErr) throw toCode(compErr, "getProfessionRequirementTemplate comps");
      const byId = new Map((comps ?? []).map((c: Loose) => [c.id as string, c]));
      const items = ((reqs ?? []) as Loose[])
        .map((r) => ({ r, c: byId.get(r.competency_id) as Loose }))
        .filter((x) => x.c)
        .sort((a, b) => (b.r.importance ?? 0) - (a.r.importance ?? 0))
        .map((x) => ({
          kind: x.r.criticality === "mandatory" ? ("mandatory" as const) : ("desirable" as const),
          labelSv: String(x.c.title_sv ?? ""),
          labelEn: String(x.c.title_en ?? ""),
        }));
      return { state: "ready", items };
    },
  );
