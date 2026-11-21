import { z } from "zod";
import { AnalysisFailure, checked } from "../analysis-services";
import { requireWorkspace, type SecurityWorkCaller } from "../services";

const uuid = z.string().uuid();
export const teamScope = z.object({ workspaceId: uuid }).strict();
export const createInvitationInput = z
  .object({
    workspaceId: uuid,
    requestId: uuid,
    email: z.string().trim().toLowerCase().email().max(320),
    role: z.enum(["editor", "viewer"]),
    canApprove: z.boolean(),
  })
  .strict()
  .refine((value) => !value.canApprove || value.role === "editor");
export const revokeInvitationInput = z.object({ workspaceId: uuid, invitationId: uuid }).strict();
export const acceptInvitationInput = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[0-9a-f]{64}$/i),
  })
  .strict();
export const setMemberRoleInput = z
  .object({
    workspaceId: uuid,
    userId: uuid,
    role: z.enum(["owner", "editor", "viewer"]),
    canApprove: z.boolean(),
    active: z.boolean(),
  })
  .strict()
  .refine((value) => !value.canApprove || value.role !== "viewer");

export interface TeamMember {
  user_id: string;
  email: string;
  role: string;
  active: boolean;
  can_approve: boolean;
}
export interface Invitation {
  id: string;
  email: string;
  role: string;
  can_approve: boolean;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}
export interface Team {
  members: TeamMember[];
  /** Only an owner sees invitations; for everyone else this is null, not []. */
  invitations: Invitation[] | null;
  canManage: boolean;
}

async function access(caller: SecurityWorkCaller, workspaceId: string) {
  try {
    return await requireWorkspace(caller, workspaceId);
  } catch (error) {
    throw new AnalysisFailure(
      error instanceof Error && "code" in error && error.code === "ACCESS_DENIED"
        ? "ACCESS_DENIED"
        : "SAVE_FAILED",
    );
  }
}

export async function readTeam(caller: SecurityWorkCaller, workspaceId: string): Promise<Team> {
  const membership = await access(caller, workspaceId);
  const canManage = membership.role === "owner";
  const members = checked(
    await caller.supabase.rpc("sw_list_members", { _workspace_id: workspaceId }),
  );
  const invitations = canManage
    ? checked(
        await caller.supabase
          .from("sw_invitations")
          .select("id,email,role,can_approve,created_at,expires_at,accepted_at,revoked_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(100),
      )
    : null;
  return { members: members ?? [], invitations: invitations ?? (canManage ? [] : null), canManage };
}

/** The code is returned exactly once, to the owner, who hands it over in person. */
export async function createInvitation(
  caller: SecurityWorkCaller,
  data: z.infer<typeof createInvitationInput>,
): Promise<{ id: string; code: string | null; expiresAt: string }> {
  await access(caller, data.workspaceId);
  const result = checked(
    await caller.supabase.rpc("sw_create_invitation", {
      _workspace_id: data.workspaceId,
      _request_id: data.requestId,
      _email: data.email,
      _role: data.role,
      _can_approve: data.canApprove,
    }),
  );
  const parsed = z
    .object({ id: uuid, code: z.string().nullable(), expires_at: z.string() })
    .safeParse(result);
  if (!parsed.success) throw new AnalysisFailure("SAVE_FAILED");
  return { id: parsed.data.id, code: parsed.data.code, expiresAt: parsed.data.expires_at };
}

export async function revokeInvitation(
  caller: SecurityWorkCaller,
  data: z.infer<typeof revokeInvitationInput>,
) {
  await access(caller, data.workspaceId);
  return {
    revoked: Boolean(
      checked(
        await caller.supabase.rpc("sw_revoke_invitation", {
          _workspace_id: data.workspaceId,
          _invitation_id: data.invitationId,
        }),
      ),
    ),
  };
}

export async function acceptInvitation(
  caller: SecurityWorkCaller,
  data: z.infer<typeof acceptInvitationInput>,
): Promise<{ workspaceId: string }> {
  const workspaceId = checked(
    await caller.supabase.rpc("sw_accept_invitation", { _code: data.code.toLowerCase() }),
  );
  if (!workspaceId) throw new AnalysisFailure("ACCESS_DENIED");
  return { workspaceId };
}

export async function setMemberRole(
  caller: SecurityWorkCaller,
  data: z.infer<typeof setMemberRoleInput>,
) {
  await access(caller, data.workspaceId);
  checked(
    await caller.supabase.rpc("sw_set_member_role", {
      _workspace_id: data.workspaceId,
      _user_id: data.userId,
      _role: data.role,
      _can_approve: data.canApprove,
      _active: data.active,
    }),
  );
  return { userId: data.userId };
}
