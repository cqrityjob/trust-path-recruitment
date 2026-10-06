// Plant defects in the stable overlay, SQL and callers; each must fail the
// compiler-backed contract guard. Regeneration itself is a POSITIVE control
// inside that guard, because it must now succeed rather than require repair.
import { runControls, type Mutation } from "./runner";
const OVERLAY = "src/integrations/supabase/database.ts";
const BESKT = "src/lib/beskt/interview-conduct.functions.ts";
const IV = "src/lib/interview-intelligence/runtime.functions.ts";
const BESKT_SQL = "supabase/migrations/20261113090000_bcp_interview_conduct.sql";
const IV_SQL = "supabase/migrations/20270111090000_interview_beskt_active_employer.sql";
const GUARD = "nullable-rpc-contract:check";
const MUTATIONS: readonly Mutation[] = [
  {
    id: "NRC-NC-NULLABILITY-REMOVED",
    defect: "the stable override rejects null again",
    file: OVERLAY,
    find: "Exclude<Args[Key], undefined> | null",
    replace: "Exclude<Args[Key], undefined | null>",
    guard: GUARD,
    expect: "_agreed_statement is typed `string | null`",
  },
  {
    id: "NRC-NC-OVERRIDE-REMOVED",
    defect:
      "finalisation relies on the manual generated annotation again, so regeneration breaks it",
    file: OVERLAY,
    find: 'Args: RequiredNullable<Functions["scp_iv_finalise_previewed_report"]["Args"], "_draft_run_id">;',
    replace: 'Args: Functions["scp_iv_finalise_previewed_report"]["Args"];',
    guard: GUARD,
    expect: "regeneration-safe RPC calls compile",
  },
  {
    id: "NRC-NC-MADE-OPTIONAL-INSTEAD",
    defect: "nullable arguments become optional even though SQL supplies no defaults",
    file: OVERLAY,
    find: "[Key in Keys]-?:",
    replace: "[Key in Keys]?:",
    guard: GUARD,
    expect: "_draft_run_id is not optional",
  },
  {
    id: "NRC-NC-EXCEPTION-WIDENED",
    defect: "a required rationale now accepts null",
    file: OVERLAY,
    find: '"_agreed_statement" | "_divergent_statement"',
    replace: '"_agreed_statement" | "_divergent_statement" | "_rationale"',
    guard: GUARD,
    expect: "every other argument is still the generator's own non-null type",
  },
  {
    id: "NRC-NC-THIRD-EXCEPTION-ADDED-QUIETLY",
    defect: "an unreviewed function gains a new override",
    file: OVERLAY,
    find: "type Overrides = {",
    replace: 'type Overrides = {\n  scp_iv_finalise_report: Functions["scp_iv_finalise_report"];',
    guard: GUARD,
    expect: "only the documented functions have overrides",
  },
  // ---- The database stops justifying it -----------------------------------
  {
    id: "NRC-NC-SQL-GAINS-A-DEFAULT",
    defect:
      "a migration gives the draft run id a DEFAULT, after which the generator CAN express it and the hand-maintained entry is stale rather than necessary",
    file: IV_SQL,
    find: "scp_iv_finalise_previewed_report(_case_id uuid, _expected_basis_hash text, _draft_run_id uuid)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER",
    replace:
      "scp_iv_finalise_previewed_report(_case_id uuid, _expected_basis_hash text, _draft_run_id uuid DEFAULT NULL)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER",
    guard: GUARD,
    expect: "_draft_run_id has no DEFAULT",
  },
  {
    id: "NRC-NC-SQL-BECOMES-STRICT",
    defect:
      "the BESKT function is declared STRICT, so a NULL statement returns NULL without running the body and the nullable type describes a call that silently does nothing",
    file: BESKT_SQL,
    find: "  _divergent_statement text,\n  _rationale text)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER",
    replace:
      "  _divergent_statement text,\n  _rationale text)\nRETURNS jsonb\nLANGUAGE plpgsql\nSTRICT\nSECURITY DEFINER",
    guard: GUARD,
    expect: "the function is not STRICT",
  },
  {
    id: "NRC-NC-SQL-ARITY-DRIFTS",
    defect:
      "the function gains an argument the guard has never heard of, so the pinned contract describes a signature that no longer exists",
    file: BESKT_SQL,
    find: "  _divergent_statement text,\n  _rationale text)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER",
    replace:
      "  _divergent_statement text,\n  _rationale text,\n  _note text)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER",
    guard: GUARD,
    expect: "its arguments are the ones this guard knows",
  },

  // ---- The call site stops being honest -----------------------------------
  {
    id: "NRC-NC-CAST-RETURNS",
    defect:
      "the cast the owner reverted on 2026-09-16 comes back: the call site tells the compiler a null is a string",
    file: IV,
    find: "      _draft_run_id: data.draftRunId ?? null,",
    replace: "      _draft_run_id: (data.draftRunId ?? null) as unknown as string,",
    guard: GUARD,
    expect: "_draft_run_id is passed as `… ?? null`",
  },
  {
    id: "NRC-NC-EMPTY-STRING-INSTEAD-OF-NULL",
    defect:
      "the BESKT call passes an empty string for 'not provided', which type-checks against a bare string and violates the resolution table's shape CHECK at runtime",
    file: BESKT,
    find: "      _divergent_statement: data.divergentStatement ?? null,",
    replace: '      _divergent_statement: data.divergentStatement ?? "",',
    guard: GUARD,
    expect: "_divergent_statement is passed as `… ?? null`",
  },
];

runControls("nullable-rpc-contract", MUTATIONS);
