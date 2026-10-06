import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LifecycleOverview = {
  months: 6 | 24;
  canSetRetention: boolean;
  jobs: Array<{
    id: string;
    archivedAt: string | null;
    completedAt: string | null;
    state: string;
    canManage: boolean;
    missingDate: boolean;
    purgeAt: string | null;
  }>;
  applications: Array<{
    id: string;
    jobId: string;
    archivedAt: string | null;
    recruitmentArchivedAt: string | null;
    status: string;
  }>;
  erasures: Array<{
    id: string;
    jobId: string;
    applicationIds: string[];
    completedAt: string | null;
    rowsDeletedAt: string | null;
    attempts: number;
    error: string | null;
    pendingFiles: number;
  }>;
};
export type ErasurePreview = {
  applications: number;
  counts: Record<string, number>;
  files: number;
  sharedFiles: number;
  fingerprint: string;
};
const scope = z.object({
  jobId: z.string().uuid(),
  applicationId: z.string().uuid().nullable().default(null),
});
// These endpoints use the caller's own authenticated client. Every mutation
// re-derives organisation, management role and eligibility in PostgreSQL.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc(client: any, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const code = String(error.message).match(/(?:RETENTION|RECRUITMENT|APPLICATION)_[A-Z_]+/)?.[0];
    throw new Error(code ?? "RETENTION_ACTION_FAILED");
  }
  return data;
}
export const getLifecycleOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employerId: z.string().uuid() }).parse(d))
  .handler(
    async ({ data, context }): Promise<LifecycleOverview> =>
      rpc(context.supabase, "rec_retention_overview", { _employer_id: data.employerId }),
  );
export const archiveMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scope.extend({ archive: z.boolean() }).parse(d))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "rec_archive_material", {
      _job_id: data.jobId,
      _application_id: data.applicationId,
      _archive: data.archive,
    }),
  );
export const setEmployerRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ employerId: z.string().uuid(), months: z.union([z.literal(6), z.literal(24)]) })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "rec_set_retention", {
      _employer_id: data.employerId,
      _months: data.months,
    }),
  );
export const previewErasure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scope.parse(d))
  .handler(
    async ({ data, context }): Promise<ErasurePreview> =>
      rpc(context.supabase, "rec_preview_erasure", {
        _job_id: data.jobId,
        _application_id: data.applicationId,
      }),
  );
export const requestErasure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    scope.extend({ fingerprint: z.string().regex(/^[a-f0-9]{32}$/) }).parse(d),
  )
  .handler(
    async ({ data, context }): Promise<string> =>
      rpc(context.supabase, "rec_request_erasure", {
        _job_id: data.jobId,
        _application_id: data.applicationId,
        _fingerprint: data.fingerprint,
      }),
  );

export const retryErasure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ erasureId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "rec_retry_erasure", { _id: data.erasureId }),
  );
