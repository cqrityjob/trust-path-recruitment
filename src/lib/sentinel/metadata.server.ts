import type { Ctx, RpcRow } from "@/lib/security-competency/rpc-types";
/** Adds authorised status facts to the existing read models; never responses,
 * keys, scores or broader visibility. Supports pre-migration app previews. */
export async function withSentinelStatus(ctx: Ctx, rows: RpcRow[]): Promise<RpcRow[]> {
  const ids = rows
    .map((r) => r.attempt_id ?? (r.work_kind === "assessment" ? r.work_id : null))
    .filter(Boolean);
  if (!ids.length) return rows;
  const { data, error } = await ctx.supabase.rpc("sentinel_status", { _attempt_ids: ids });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) return rows;
    console.error("[sentinel-status]", error);
    throw new Error("SENTINEL_STATUS_FAILED");
  }
  const states = (data ?? []) as RpcRow[];
  return rows.map((r) => {
    const s = states.find((s) => s.attempt_id === (r.attempt_id ?? r.work_id));
    if (!s) return r;
    return {
      ...r,
      ...s,
      status: s.attempt_status,
      progress_done: s.answered,
      progress_total: s.total_items,
      programme_name_sv: s.name_sv,
      programme_name_en: s.name_en,
      title_sv: s.name_sv,
      title_en: s.name_en,
    };
  });
}
