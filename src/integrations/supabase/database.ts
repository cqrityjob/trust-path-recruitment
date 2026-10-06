import type { Database as GeneratedDatabase } from "./types";

// Keep the generator's output untouched. These SQL arguments have no DEFAULT,
// and their non-STRICT functions deliberately accept NULL. Lovable/Supabase
// regenerations therefore cannot erase the application's required nullability.
type Functions = GeneratedDatabase["public"]["Functions"];
type RequiredNullable<Args, Keys extends keyof Args> = Omit<Args, Keys> & {
  [Key in Keys]-?: Exclude<Args[Key], undefined> | null;
};
type Overrides = {
  bcp_conduct_record_resolution: Omit<Functions["bcp_conduct_record_resolution"], "Args"> & {
    Args: RequiredNullable<
      Functions["bcp_conduct_record_resolution"]["Args"],
      "_agreed_statement" | "_divergent_statement"
    >;
  };
  scp_iv_finalise_previewed_report: Omit<Functions["scp_iv_finalise_previewed_report"], "Args"> & {
    Args: RequiredNullable<Functions["scp_iv_finalise_previewed_report"]["Args"], "_draft_run_id">;
  };
};
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<Functions, keyof Overrides> & Overrides;
  };
};
