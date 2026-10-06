import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PassportProfileIdentity } from "./credential-passport";
import { readHolderDisplayName } from "./holder-display-name.server";

/** Read the same canonical sources as ProfessionalIdentityV1. Never fall back
 * to the old Passport headline or a credential-derived eligibility title.
 * The name is the holder's Passport name, with the account name as the
 * reserve (holder-display-name.ts). */
export async function readPassportProfileIdentity(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<PassportProfileIdentity> {
  const [holder, career] = await Promise.all([
    readHolderDisplayName(db, userId),
    db
      .from("security_career_profiles")
      .select("current_profession_slug, current_profession_other")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (holder.failed || career.error) throw new Error("Passport profile identity unavailable");
  const slug = career.data?.current_profession_slug;
  if (!slug) {
    const title = career.data?.current_profession_other?.trim() || null;
    return { displayName: holder.name, titleSv: title, titleEn: title };
  }
  const profession = await db
    .from("cig_professions")
    .select("title_sv, title_en")
    .eq("slug", slug)
    .eq("content_status", "published")
    .maybeSingle();
  if (profession.error) throw new Error("Passport profession catalogue unavailable");
  return {
    displayName: holder.name,
    titleSv:
      profession.data?.title_sv?.trim() || career.data?.current_profession_other?.trim() || null,
    titleEn:
      profession.data?.title_en?.trim() || career.data?.current_profession_other?.trim() || null,
  };
}
