// Compiled by nullable-rpc-contract:check with BOTH current and regenerated
// generator output. These calls are type tests only and are never executed.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/database";
import type { Database as Generated } from "../../src/integrations/supabase/types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Functions = Database["public"]["Functions"];
type Bcp = Functions["bcp_conduct_record_resolution"]["Args"];
type Finalise = Functions["scp_iv_finalise_previewed_report"]["Args"];
export type ContractAssertions = [
  Assert<Equal<Bcp["_agreed_statement"], string | null>>,
  Assert<Equal<Bcp["_divergent_statement"], string | null>>,
  Assert<Equal<Finalise["_draft_run_id"], string | null>>,
  Assert<Equal<Bcp["_rationale"], string>>,
  Assert<Equal<Bcp["_expected_revision"], number>>,
  Assert<Equal<Finalise["_case_id"], string>>,
  Assert<Equal<Finalise["_expected_basis_hash"], string>>,
  Assert<Equal<Database["public"]["Tables"], Generated["public"]["Tables"]>>,
  Assert<Equal<Database["public"]["Views"], Generated["public"]["Views"]>>,
  Assert<
    Equal<
      Omit<Functions, "bcp_conduct_record_resolution" | "scp_iv_finalise_previewed_report">,
      Omit<
        Generated["public"]["Functions"],
        "bcp_conduct_record_resolution" | "scp_iv_finalise_previewed_report"
      >
    >
  >,
  Assert<
    Equal<Functions["sentinel_session"], Generated["public"]["Functions"]["sentinel_session"]>
  >,
  Assert<
    Equal<
      Functions["scp_iv_finalise_previewed_report"]["Returns"],
      Generated["public"]["Functions"]["scp_iv_finalise_previewed_report"]["Returns"]
    >
  >,
];
declare const client: SupabaseClient<Database>;
const resolution = {
  _operation_id: "synthetic",
  _panel_id: "synthetic",
  _expected_revision: 1,
  _item_key: "synthetic",
  _resolution_kind: "agreed",
  _rationale: "synthetic",
};
client.rpc("bcp_conduct_record_resolution", {
  ...resolution,
  _agreed_statement: "Agreed",
  _divergent_statement: null,
});
client.rpc("bcp_conduct_record_resolution", {
  ...resolution,
  _agreed_statement: null,
  _divergent_statement: "Divergent",
});
client.rpc("scp_iv_finalise_previewed_report", {
  _case_id: "synthetic",
  _expected_basis_hash: "synthetic",
  _draft_run_id: null,
});
// @ts-expect-error Nullable is not optional: both statement arguments must be supplied.
client.rpc("bcp_conduct_record_resolution", { ...resolution, _agreed_statement: null });
// @ts-expect-error Nullable is not optional: the draft argument must be supplied.
client.rpc("scp_iv_finalise_previewed_report", {
  _case_id: "synthetic",
  _expected_basis_hash: "synthetic",
});
const invalidRationale = {
  ...resolution,
  _rationale: null,
  _agreed_statement: null,
  _divergent_statement: null,
};
// @ts-expect-error Only the three documented arguments are nullable.
client.rpc("bcp_conduct_record_resolution", invalidRationale);
const invalidDraftId = {
  _case_id: "synthetic",
  _expected_basis_hash: "synthetic",
  _draft_run_id: 42,
};
// @ts-expect-error A nullable UUID is still a string, never a number.
client.rpc("scp_iv_finalise_previewed_report", invalidDraftId);
