// The actions that tie a test or a BESKT preparation to its interview:
//
//   sendTestFromSetup          sends the setup's candidate test for an
//                              application and records the setup it was sent
//                              with (scp_record_assessment_setup);
//   startApplicationInterview  "Förbered intervju" / a new case for an
//                              application: the interview of ONE start -- a
//                              completed test, or an explicitly chosen setup;
//   startBesktInterview        the interview of a submitted BESKT preparation,
//                              from an application or an accepted invitation.
//
// Each start is ONE database call (scp_iv_start_interview, 20261202): it
// verifies the source, the candidate, the setup, the test and the guide
// against scp_recruitment_content_links before its first write, serialises on
// the start, and writes case, setup, material and (BESKT) the governed link
// together. When a source carries no setup, the choices come from the same
// rows (scp_iv_start_choices). Nothing here decides which guide belongs to
// which role.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isSetupRequired,
  refusalOf,
  type StartRefusal,
  type StartSetup,
} from "@/lib/library/start-routing";

const startSetupShape = z.object({
  roleGroup: z.enum(["operational", "strategic"]),
  roleProfile: z.enum(["vaktare", "security_manager"]),
  environment: z.enum(["general", "data_centre", "hospital", "shopping_centre"]),
});

type Db = {
  rpc: (
    fn: never,
    args: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (t: never) => {
    select: (c: string) => {
      eq: (
        col: string,
        v: string,
      ) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        eq: (
          col: string,
          v: string,
        ) => {
          maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };
};

async function rpc(db: Db, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

export type StartResult =
  | {
      readonly kind: "started";
      readonly caseId: string;
      readonly created: boolean;
      /** False when the case's setup or its seeded material is missing --
       *  said on screen, never presented as complete. */
      readonly complete: boolean;
      readonly setup: StartSetup;
    }
  | { readonly kind: "choose"; readonly choices: readonly StartSetup[] }
  | { readonly kind: "refused"; readonly reason: StartRefusal };

/** One call to the start; a missing setup becomes the choice list, and a
 *  refusal the employer can act on becomes its reason. */
async function start(
  db: Db,
  args: {
    employerId: string;
    applicationId: string | null;
    sourceKind: "assessment_assignment" | "beskt_assignment" | "chosen_setup";
    sourceId: string | null;
    method: "trust" | "beskt";
    packVersionId: string | null;
    setup: z.infer<typeof startSetupShape> | null;
    title: string | null;
  },
): Promise<StartResult> {
  const { data, error } = await db.rpc(
    "scp_iv_start_interview" as never,
    {
      _employer_id: args.employerId,
      _application_id: args.applicationId,
      _source_kind: args.sourceKind,
      _source_id: args.sourceId,
      _method: args.method,
      _pack_version_id: args.packVersionId,
      _role_group: args.setup?.roleGroup ?? null,
      _role_profile: args.setup?.roleProfile ?? null,
      _environment: args.setup?.environment ?? null,
      _title: args.title,
    } as never,
  );
  if (error) {
    if (isSetupRequired(error.message)) {
      const rows = (await rpc(db, "scp_iv_start_choices", {
        _employer_id: args.employerId,
        _assessment_assignment_id:
          args.sourceKind === "assessment_assignment" ? args.sourceId : null,
      })) as Array<{ role_group: string; role_profile: string; environment: string }> | null;
      const choices = (rows ?? []).map((r) => ({
        roleGroup: r.role_group as StartSetup["roleGroup"],
        roleProfile: r.role_profile as StartSetup["roleProfile"],
        environment: r.environment as StartSetup["environment"],
      }));
      return choices.length > 0
        ? { kind: "choose", choices }
        : { kind: "refused", reason: "no_setup_for_test" };
    }
    const refusal = refusalOf(error.message);
    if (refusal) return { kind: "refused", reason: refusal };
    throw new Error(error.message);
  }
  const res = data as {
    case_id: string;
    created: boolean;
    setup_recorded: boolean;
    material: number;
    role_group: string;
    role_profile: string;
    environment: string;
  };
  return {
    kind: "started",
    caseId: res.case_id,
    created: res.created,
    complete: res.setup_recorded && res.material > 0,
    setup: {
      roleGroup: res.role_group as StartSetup["roleGroup"],
      roleProfile: res.role_profile as StartSetup["roleProfile"],
      environment: res.environment as StartSetup["environment"],
    },
  };
}

export const startApplicationInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        applicationId: z.string().uuid(),
        // The completed test this start comes from; null = before any test.
        assessmentAssignmentId: z.string().uuid().nullable(),
        setup: startSetupShape.nullable().optional(),
        // A guide the employer chose explicitly (the new-case form). The
        // database verifies it is the setup's guide; null = the database
        // takes the setup's guide.
        packVersionId: z.string().uuid().nullable().optional(),
        title: z.string().min(1).max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(
    ({ context, data }): Promise<StartResult> =>
      start(context.supabase as unknown as Db, {
        employerId: data.employerId,
        applicationId: data.applicationId,
        sourceKind: data.assessmentAssignmentId ? "assessment_assignment" : "chosen_setup",
        sourceId: data.assessmentAssignmentId,
        method: "trust",
        packVersionId: data.packVersionId ?? null,
        setup: data.setup ?? null,
        title: data.title ?? null,
      }),
  );

/** The interview of a submitted BESKT preparation, created WITH its governed
 *  link in the same transaction -- from an application, or from an accepted
 *  standalone invitation (no application is invented for it). */
export const startBesktInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        besktAssignmentId: z.string().uuid(),
        applicationId: z.string().uuid().nullable(),
        packVersionId: z.string().uuid().nullable().optional(),
        setup: startSetupShape.nullable().optional(),
        title: z.string().min(1).max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(
    ({ context, data }): Promise<StartResult> =>
      start(context.supabase as unknown as Db, {
        employerId: data.employerId,
        applicationId: data.applicationId,
        sourceKind: "beskt_assignment",
        sourceId: data.besktAssignmentId,
        method: "beskt",
        packVersionId: data.packVersionId ?? null,
        setup: data.setup ?? null,
        title: data.title ?? null,
      }),
  );

/** The start a case came from, when it came from one: what the interview
 *  views show as its source. Null for a case started any other way. */
export const getCaseStart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      readonly sourceKind: "assessment_assignment" | "beskt_assignment" | "chosen_setup";
      readonly sourceId: string | null;
      readonly applicationId: string | null;
    } | null> => {
      const db = context.supabase as unknown as Db;
      const { data: row, error } = await db
        .from("scp_interview_starts" as never)
        .select("source_kind, source_id, application_id")
        .eq("interview_case_id", data.caseId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return null;
      const r = row as {
        source_kind: string;
        source_id: string | null;
        application_id: string | null;
      };
      return {
        sourceKind: r.source_kind as "assessment_assignment" | "beskt_assignment" | "chosen_setup",
        sourceId: r.source_id,
        applicationId: r.application_id,
      };
    },
  );

export type TestInvitationOutcome = {
  /** What the database did with the message: delivered to the candidate's
   *  CQrityjob inbox, or not. */
  readonly delivery: "delivered" | "already_sent" | "in_progress" | "refused" | "failed";
  /** The e-mail copy, as the provider answered -- "not_configured" is the
   *  honest state on a deployment without a mail provider. */
  readonly email:
    | "sent"
    | "failed"
    | "not_configured"
    | "not_attempted"
    | "in_progress"
    | "unknown";
};

export type SendTestResult = {
  readonly assignmentId: string;
  readonly attemptId: string | null;
  readonly setupRecorded: boolean;
  /** The invitation, or null when it could not be written at all. The test
   *  is sent either way: the candidate finds it in their account. */
  readonly invitation: TestInvitationOutcome | null;
};

/** Sends the setup's candidate test for an application, records the setup
 *  it was sent with so the interview after it needs no second choice, and
 *  tells the candidate -- in the language the employer chose -- through the
 *  recruitment's own message channel (their CQrityjob inbox, plus e-mail
 *  when a provider is configured). The test is the one the setup's content
 *  link names -- read from the database, never from a constant in this file.
 *
 *  Idempotent end to end: the assignment reuses an existing attempt
 *  (20261209090000), the setup refuses only a DIFFERENT setup, and the
 *  message is keyed on the assignment so a retry cannot write a second one. */
export const sendTestFromSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    startSetupShape
      .extend({
        employerId: z.string().uuid(),
        applicationId: z.string().uuid(),
        language: z.enum(["sv", "en"]).default("sv"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<SendTestResult> => {
    const db = context.supabase as unknown as Db;
    const profile = await db
      .from("scp_recruitment_role_profiles" as never)
      .select("role_group")
      .eq("role_profile", data.roleProfile)
      .maybeSingle();
    if (profile.error) throw new Error(profile.error.message);
    const link = await db
      .from("scp_recruitment_content_links" as never)
      .select("assessment_definition_id")
      .eq("role_profile", data.roleProfile)
      .eq("environment", data.environment)
      .maybeSingle();
    if (link.error) throw new Error(link.error.message);
    const definitionId = (link.data as { assessment_definition_id: string | null } | null)
      ?.assessment_definition_id;
    if (
      (profile.data as { role_group: string } | null)?.role_group !== data.roleGroup ||
      !definitionId
    ) {
      throw new Error("SCP_START_NO_TEST: this setup has no candidate test.");
    }
    const library = (await rpc(db, "scp_employer_content_library", {
      _employer_id: data.employerId,
    })) as Array<{
      library_kind: string;
      parent_id: string;
      item_id: string;
      assignable: boolean;
    }> | null;
    const version = (library ?? []).find(
      (r) => r.library_kind === "assessment" && r.parent_id === definitionId && r.assignable,
    );
    if (!version) {
      throw new Error("SCP_START_NO_TEST: the setup's test cannot be sent by this organisation.");
    }
    const assigned = (await rpc(db, "scp_assign_from_application", {
      _employer_id: data.employerId,
      _application_id: data.applicationId,
      _assessment_version_id: version.item_id,
      _deadline: null,
      _language: data.language,
    })) as
      | Array<{ assignment_id: string; attempt_id?: string }>
      | { assignment_id: string; attempt_id?: string };
    const row = Array.isArray(assigned) ? assigned[0] : assigned;
    const assignmentId = row!.assignment_id;
    const attemptId = row?.attempt_id ? String(row.attempt_id) : null;
    let setupRecorded = true;
    try {
      await rpc(db, "scp_record_assessment_setup", {
        _employer_id: data.employerId,
        _assessment_assignment_id: assignmentId,
        _role_group: data.roleGroup,
        _role_profile: data.roleProfile,
        _environment: data.environment,
      });
    } catch (e) {
      // The test is sent. Without its setup the interview after it asks for
      // an explicit choice instead of guessing -- so say it, do not hide it.
      console.error("[library] test setup not recorded", e);
      setupRecorded = false;
    }
    const invitation = await inviteCandidate(context, {
      employerId: data.employerId,
      applicationId: data.applicationId,
      assignmentId,
      language: data.language,
      assessmentName: (library ?? []).find((r) => r.item_id === version.item_id) as
        | { name_sv?: string; name_en?: string }
        | undefined,
    });
    return { assignmentId, attemptId, setupRecorded, invitation };
  });

/** The invitation, through the recruitment's own message channel.
 *
 *  Best effort and never the reason a send fails: the assignment already
 *  exists and the candidate's account already lists it. The message is
 *  drafted with an idempotency key on the assignment (a retry returns the
 *  same draft) and delivered by the ONE delivery implementation the rest of
 *  the recruitment uses, so its delivery state is recorded exactly like any
 *  other message to the candidate. */
async function inviteCandidate(
  context: { supabase: unknown; userId?: string },
  p: {
    employerId: string;
    applicationId: string;
    assignmentId: string;
    language: "sv" | "en";
    assessmentName: { name_sv?: string; name_en?: string } | undefined;
  },
): Promise<TestInvitationOutcome | null> {
  try {
    const sb = context.supabase as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            v: string,
          ) => {
            maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
          };
        };
      };
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
    const [employer, application] = await Promise.all([
      sb.from("employers").select("name").eq("id", p.employerId).maybeSingle(),
      sb
        .from("job_applications")
        .select("applicant_user_id, job_id")
        .eq("id", p.applicationId)
        .maybeSingle(),
    ]);
    const employerName = String((employer.data as { name?: string } | null)?.name ?? "").trim();
    const app = application.data as { applicant_user_id?: string | null; job_id?: string } | null;
    // The name the candidate set for themselves, read the way the
    // applications list reads it; a missing name is simply no greeting.
    let candidateName: string | null = null;
    if (app?.applicant_user_id) {
      const profile = await sb
        .from("profiles")
        .select("display_name")
        .eq("id", app.applicant_user_id)
        .maybeSingle();
      const dn = (profile.data as { display_name?: string | null } | null)?.display_name;
      candidateName = dn && dn.trim() ? dn.trim() : null;
    }
    let jobTitle = "";
    if (app?.job_id) {
      const job = await sb
        .from("jobs")
        .select("title_sv, title_en")
        .eq("id", app.job_id)
        .maybeSingle();
      const j = job.data as { title_sv?: string | null; title_en?: string | null } | null;
      jobTitle = String((p.language === "en" ? j?.title_en : j?.title_sv) || j?.title_sv || "");
    }
    const assessmentName = String(
      (p.language === "en" ? p.assessmentName?.name_en : p.assessmentName?.name_sv) ||
        p.assessmentName?.name_sv ||
        "",
    );
    if (!employerName || !assessmentName) return null;
    const { SITE_ORIGIN } = await import("@/lib/job-intelligence/seo");
    const { testInvitationMessage } = await import("@/lib/recruitment/message-templates");
    const message = testInvitationMessage({
      language: p.language,
      candidateName,
      employerName,
      jobTitle: jobTitle || (p.language === "en" ? "the position" : "tjänsten"),
      assessmentName,
      academyUrl: `${process.env.PUBLIC_SITE_URL || SITE_ORIGIN}/academy`,
    });
    const draft = await sb.rpc("rec_save_message_draft", {
      _message_id: null,
      _application_id: p.applicationId,
      _kind: "information",
      _subject: message.subject,
      _body: message.body,
      _language: p.language,
      _booking_id: null,
      _idempotency_key: `test-invitation:${p.assignmentId}`,
    });
    if (draft.error || typeof draft.data !== "string") {
      console.error("[library] test invitation not drafted", draft.error);
      return null;
    }
    const { deliverRecruitmentMessage } = await import("@/lib/recruitment/recruitment.functions");
    const outcome = await deliverRecruitmentMessage(
      { supabase: context.supabase, userId: context.userId ?? "" },
      draft.data,
    );
    return { delivery: outcome.delivery, email: outcome.email };
  } catch (e) {
    console.error("[library] test invitation failed", e);
    return { delivery: "failed", email: "not_attempted" };
  }
}
