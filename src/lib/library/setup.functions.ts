// The recruitment setup: the library choice a case or BESKT assignment was
// started with, recorded once (scp_record_recruitment_setup, 20261201090000)
// and read back wherever the case or assignment is readable. The database
// decides who may record and who may read; these are typed pass-throughs.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  EnvironmentKey,
  LibraryMethod,
  RoleGroup,
  RoleProfileKey,
} from "@/lib/library/catalogue";

export const setupShape = z.object({
  method: z.enum(["trust", "beskt"]),
  roleGroup: z.enum(["operational", "strategic"]),
  roleProfile: z.enum(["vaktare", "security_manager"]),
  environment: z.enum(["general", "data_centre", "hospital", "shopping_centre"]),
});

export interface RecruitmentSetup {
  readonly setupId: string;
  readonly method: LibraryMethod;
  readonly roleGroup: RoleGroup;
  readonly roleProfile: RoleProfileKey;
  readonly environment: EnvironmentKey;
  readonly interviewCaseId: string | null;
  readonly besktAssignmentId: string | null;
  readonly createdAt: string;
}

export type SetupDb = {
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
    };
  };
};

export async function recordSetup(
  db: SetupDb,
  employerId: string,
  setup: z.infer<typeof setupShape>,
  anchors: { interviewCaseId: string | null; besktAssignmentId: string | null },
): Promise<string> {
  const { data, error } = await db.rpc(
    "scp_record_recruitment_setup" as never,
    {
      _employer_id: employerId,
      _method: setup.method,
      _role_group: setup.roleGroup,
      _role_profile: setup.roleProfile,
      _environment: setup.environment,
      _interview_case_id: anchors.interviewCaseId,
      _beskt_assignment_id: anchors.besktAssignmentId,
    } as never,
  );
  if (error) throw new Error(error.message);
  return data as string;
}

export async function readSetup(
  db: SetupDb,
  column: "interview_case_id" | "beskt_assignment_id",
  id: string,
): Promise<RecruitmentSetup | null> {
  const { data, error } = await db
    .from("scp_recruitment_setups" as never)
    .select(
      "id, method, role_group, role_profile, environment, interview_case_id, beskt_assignment_id, created_at",
    )
    .eq(column, id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, string | null>;
  return {
    setupId: r.id as string,
    method: r.method as LibraryMethod,
    roleGroup: r.role_group as RoleGroup,
    roleProfile: r.role_profile as RoleProfileKey,
    environment: r.environment as EnvironmentKey,
    interviewCaseId: r.interview_case_id,
    besktAssignmentId: r.beskt_assignment_id,
    createdAt: r.created_at as string,
  };
}

/** Records the setup a BESKT assignment was started with. */
export const recordBesktSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    setupShape
      .extend({ employerId: z.string().uuid(), besktAssignmentId: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly setupId: string }> => {
    const { employerId, besktAssignmentId, ...setup } = data;
    const setupId = await recordSetup(context.supabase as unknown as SetupDb, employerId, setup, {
      interviewCaseId: null,
      besktAssignmentId,
    });
    return { setupId };
  });

/** The setup of a case, or null when the case was started outside the library. */
export const getCaseSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(
    async ({ context, data }): Promise<RecruitmentSetup | null> =>
      readSetup(context.supabase as unknown as SetupDb, "interview_case_id", data.caseId),
  );

/** The setup of a BESKT assignment, or null. */
export const getBesktAssignmentSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(d))
  .handler(
    async ({ context, data }): Promise<RecruitmentSetup | null> =>
      readSetup(context.supabase as unknown as SetupDb, "beskt_assignment_id", data.assignmentId),
  );
