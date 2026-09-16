import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PassportProfileIdentity } from "./credential-passport";

/** Read the same canonical sources as ProfessionalIdentityV1. Never fall back
 * to the old Passport headline or a credential-derived eligibility title. */
export async function readPassportProfileIdentity(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<PassportProfileIdentity> {
  const [profile, career] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    db
      .from("security_career_profiles")
      .select("current_profession_slug, current_profession_other")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (profile.error || career.error) throw new Error("Passport profile identity unavailable");
  const slug = career.data?.current_profession_slug;
  if (!slug) {
    const title = career.data?.current_profession_other?.trim() || null;
    return { displayName: profile.data?.display_name ?? null, titleSv: title, titleEn: title };
  }
  const profession = await db
    .from("cig_professions")
    .select("title_sv, title_en")
    .eq("slug", slug)
    .eq("content_status", "published")
    .maybeSingle();
  if (profession.error) throw new Error("Passport profession catalogue unavailable");
  return {
    displayName: profile.data?.display_name ?? null,
    titleSv:
      profession.data?.title_sv?.trim() || career.data?.current_profession_other?.trim() || null,
    titleEn:
      profession.data?.title_en?.trim() || career.data?.current_profession_other?.trim() || null,
  };
}
