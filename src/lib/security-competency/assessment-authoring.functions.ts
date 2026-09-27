import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type Context = { supabase: SupabaseClient<Database>; userId: string };
async function assertAuthor(context: Context) {
  const { data, error } = await context.supabase.rpc("scp_can_author", {
    _user_id: context.userId,
  });
  if (error || data !== true) throw new Error("SCP_AUTHOR_REQUIRED");
}
export const listRecruitmentContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAuthor(context);
    const { data, error } = await context.supabase
      .from("scp_assessment_definitions")
      .select(
        "id,slug,name_sv,name_en,scp_assessment_versions(id,version_number,content_status,validation_status,notes)",
      )
      .eq("designed_for", "recruitment_support")
      .order("name_sv");
    if (error) throw new Error("Could not load recruitment content.");
    return data;
  });
export const previewRecruitmentContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ versionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAuthor(context);
    const { data: forms, error } = await context.supabase
      .from("scp_forms")
      .select(
        "id,name_sv,name_en,scp_form_items(item_version_id,display_order,scp_item_versions(scp_item_texts(language,scenario,prompt)))",
      )
      .eq("assessment_version_id", data.versionId);
    if (error) throw new Error("Could not preview recruitment content.");
    return forms;
  });
export const saveRecruitmentDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sourceVersionId: z.string().uuid(),
        notes: z.string().max(10000),
        itemVersionIds: z.array(z.string().uuid()).min(1).max(200),
        newSlug: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{2,79}$/)
          .nullable(),
        nameSv: z.string().max(200).nullable(),
        nameEn: z.string().max(200).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<string> => {
    await assertAuthor(context);
    const { data: id, error } = await context.supabase.rpc(
      "scp_author_assessment_draft" as never,
      {
        _source_version_id: data.sourceVersionId,
        _notes: data.notes,
        _item_version_ids: data.itemVersionIds,
        _new_slug: data.newSlug,
        _name_sv: data.nameSv,
        _name_en: data.nameEn,
      } as never,
    );
    if (error) throw new Error(error.message);
    return String(id);
  });
