// The two library actions that tie a test to its interview:
//
//   sendTestFromSetup        sends the role's candidate test for an
//                            application and records the setup it was sent
//                            with (scp_record_assessment_setup);
//   startApplicationInterview "Förbered intervju": the interview that belongs
//                            to ONE start -- a completed test, or an
//                            explicitly chosen setup before any test.
//
// The start itself is one database call (scp_iv_start_interview, 20261202):
// it verifies the source, binds the application's own candidate, serialises
// on the start and writes the case, its setup and its material together. This
// file only decides which guide the setup leads to, and reads nothing it would
// treat as "no case" when the read fails.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TRUST_CONTENT, type RoleProfileKey } from "@/lib/library/catalogue";
import {
  routeInterviewStart,
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
      };
      in: (
        col: string,
        v: readonly string[],
      ) => PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
};

async function rpc(db: Db, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

/** The startable version of the guide the setup leads to, from what this
 *  employer may start today. */
async function startableGuide(db: Db, employerId: string, packSlug: string): Promise<string> {
  const rows = (await rpc(db, "scp_iv_startable_pack_versions", {
    _employer_id: employerId,
  })) as Array<{ pack_version_id: string }> | null;
  const ids = (rows ?? []).map((r) => r.pack_version_id);
  if (ids.length === 0)
    throw new Error("SCP_IV_NO_GUIDE: no interview guide for the role is available.");
  const slugs = await db
    .from("scp_interview_pack_versions" as never)
    .select("id, scp_interview_packs(slug)")
    .in("id", ids);
  if (slugs.error) throw new Error(slugs.error.message);
  const hit = (
    (slugs.data ?? []) as Array<{ id: string; scp_interview_packs: { slug: string } | null }>
  ).find((r) => r.scp_interview_packs?.slug === packSlug);
  if (!hit) throw new Error("SCP_IV_NO_GUIDE: no interview guide for the role is available.");
  return hit.id;
}

async function recordedTestSetup(db: Db, assignmentId: string): Promise<StartSetup | null> {
  const { data, error } = await db
    .from("scp_assessment_setups" as never)
    .select("role_group, role_profile, environment")
    .eq("assessment_assignment_id", assignmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as { role_group: string; role_profile: string; environment: string };
  return {
    roleGroup: r.role_group as StartSetup["roleGroup"],
    roleProfile: r.role_profile as StartSetup["roleProfile"],
    environment: r.environment as StartSetup["environment"],
  };
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
  | { readonly kind: "refused"; readonly reason: StartRefusal | "test_not_on_application" };

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
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<StartResult> => {
    const db = context.supabase as unknown as Db;

    let testSlug: string | null = null;
    let recorded: StartSetup | null = null;
    if (data.assessmentAssignmentId) {
      // The application's own tests, membership-checked. A failed read is an
      // error, never "this test is not here".
      const rows = (await rpc(db, "scp_application_assessments", {
        _application_id: data.applicationId,
      })) as Array<{ assignment_id: string; assessment_slug: string | null }> | null;
      const row = (rows ?? []).find((r) => r.assignment_id === data.assessmentAssignmentId);
      if (!row?.assessment_slug) return { kind: "refused", reason: "test_not_on_application" };
      testSlug = row.assessment_slug;
      recorded = await recordedTestSetup(db, data.assessmentAssignmentId);
    }

    const route = routeInterviewStart({ testSlug, recorded, chosen: data.setup ?? null });
    if (route.kind !== "route") return route;

    const packVersionId = await startableGuide(db, data.employerId, route.guidePackSlug);
    const res = (await rpc(db, "scp_iv_start_interview", {
      _employer_id: data.employerId,
      _application_id: data.applicationId,
      _source_kind: data.assessmentAssignmentId ? "assessment_assignment" : "chosen_setup",
      _source_id: data.assessmentAssignmentId,
      _pack_version_id: packVersionId,
      _method: "trust",
      _role_group: route.setup.roleGroup,
      _role_profile: route.setup.roleProfile,
      _environment: route.setup.environment,
    })) as { case_id: string; created: boolean; setup_recorded: boolean; material: number };
    return {
      kind: "started",
      caseId: res.case_id,
      created: res.created,
      complete: res.setup_recorded && res.material > 0,
      setup: route.setup,
    };
  });

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
      readonly applicationId: string;
    } | null> => {
      const db = context.supabase as unknown as Db;
      const { data: row, error } = await db
        .from("scp_interview_starts" as never)
        .select("source_kind, source_id, application_id")
        .eq("interview_case_id", data.caseId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return null;
      const r = row as { source_kind: string; source_id: string | null; application_id: string };
      return {
        sourceKind: r.source_kind as "assessment_assignment" | "beskt_assignment" | "chosen_setup",
        sourceId: r.source_id,
        applicationId: r.application_id,
      };
    },
  );

/** Sends the role's candidate test for an application, and records the setup
 *  it was sent with so the interview after it needs no second choice. */
export const sendTestFromSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    startSetupShape
      .extend({ employerId: z.string().uuid(), applicationId: z.string().uuid() })
      .parse(d),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ readonly assignmentId: string; readonly setupRecorded: boolean }> => {
      const db = context.supabase as unknown as Db;
      const content = TRUST_CONTENT[data.roleProfile as RoleProfileKey];
      const route = routeInterviewStart({
        testSlug: content?.assessmentSlug ?? null,
        recorded: null,
        chosen: {
          roleGroup: data.roleGroup,
          roleProfile: data.roleProfile,
          environment: data.environment,
        },
      });
      if (route.kind !== "route" || !content?.assessmentSlug) {
        throw new Error("SCP_START_NO_TEST: this setup has no candidate test.");
      }
      const library = (await rpc(db, "scp_employer_content_library", {
        _employer_id: data.employerId,
      })) as Array<{
        library_kind: string;
        slug: string;
        item_id: string;
        assignable: boolean;
      }> | null;
      const version = (library ?? []).find(
        (r) => r.library_kind === "assessment" && r.slug === content.assessmentSlug && r.assignable,
      );
      if (!version)
        throw new Error("SCP_START_NO_TEST: the role's test cannot be sent by this organisation.");
      const assigned = (await rpc(db, "scp_assign_from_application", {
        _employer_id: data.employerId,
        _application_id: data.applicationId,
        _assessment_version_id: version.item_id,
        _deadline: null,
        _language: "sv",
      })) as Array<{ assignment_id: string }> | { assignment_id: string };
      const assignmentId = (Array.isArray(assigned) ? assigned[0] : assigned)!.assignment_id;
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
      return { assignmentId, setupRecorded };
    },
  );
