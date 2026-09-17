/**
 * Negative controls for `nullable-rpc-contract:check`.
 *
 * The guard passed the first time it ran, which for a guard made of regular
 * expressions over a 19 000-line generated file proves nothing at all. Each
 * assertion is proved here by planting the defect it exists to catch and
 * requiring the named diagnostic.
 *
 * The first two are the defect itself, exactly as a regeneration plants it.
 * The rest are the ways the exception could be "kept" while no longer being
 * true, or kept green while being bypassed.
 *
 * Every file is restored byte-for-byte by the shared runner.
 *
 * Run: bun run negative-controls:nullable-rpc-contract
 */
import { runControls, type Mutation } from "./runner";

const TYPES = "src/integrations/supabase/types.ts";
const BESKT = "src/lib/beskt/interview-conduct.functions.ts";
const IV = "src/lib/interview-intelligence/runtime.functions.ts";
const BESKT_SQL = "supabase/migrations/20261113090000_bcp_interview_conduct.sql";
const IV_SQL = "supabase/migrations/20261107090000_scp_iv_report_basis_integrity.sql";
const GUARD = "nullable-rpc-contract:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The regeneration, replayed -----------------------------------------
  {
    id: "NRC-NC-REGEN-ERASES-BESKT",
    defect:
      "a types regeneration rewrites the BESKT divergent statement back to a bare string, exactly as c655d82 did, so the honest `?? null` call stops compiling",
    file: TYPES,
    find: "          _divergent_statement: string | null",
    replace: "          _divergent_statement: string",
    guard: GUARD,
    expect: "_divergent_statement is typed `string | null`",
  },
  {
    id: "NRC-NC-REGEN-ERASES-FINALISE",
    defect:
      "a types regeneration rewrites the finalisation RPC's draft run id back to a bare string",
    file: TYPES,
    find: "Args: { _case_id: string; _expected_basis_hash: string; _draft_run_id: string | null }",
    replace: "Args: { _case_id: string; _expected_basis_hash: string; _draft_run_id: string }",
    guard: GUARD,
    expect: "_draft_run_id is typed `string | null`",
  },

  // ---- The exception kept, but wrongly ------------------------------------
  {
    id: "NRC-NC-MADE-OPTIONAL-INSTEAD",
    defect:
      "somebody 'fixes' the type by making the argument optional, which compiles and then fails at runtime: there is no SQL default, so PostgREST cannot resolve the function without it",
    file: TYPES,
    find: "Args: { _case_id: string; _expected_basis_hash: string; _draft_run_id: string | null }",
    replace:
      "Args: { _case_id: string; _expected_basis_hash: string; _draft_run_id?: string | null }",
    guard: GUARD,
    expect: "_draft_run_id is not optional",
  },
  {
    id: "NRC-NC-EXCEPTION-WIDENED",
    defect:
      "the exception spreads to an argument the database does require, so a null rationale type-checks and is refused at runtime",
    file: TYPES,
    find: "          _divergent_statement: string | null\n          _expected_revision: number\n          _item_key: string\n          _operation_id: string\n          _panel_id: string\n          _rationale: string",
    replace:
      "          _divergent_statement: string | null\n          _expected_revision: number\n          _item_key: string\n          _operation_id: string\n          _panel_id: string\n          _rationale: string | null",
    guard: GUARD,
    expect: "every other argument is still the generator's own non-null type",
  },
  {
    id: "NRC-NC-THIRD-EXCEPTION-ADDED-QUIETLY",
    defect:
      "a third hand-maintained nullable argument is added to the generated file without being pinned, so the next regeneration erases it as silently as it erased these",
    file: TYPES,
    find: "      scp_iv_finalise_report: {\n        Args: { _case_id: string; _draft_run_id?: string }",
    replace:
      "      scp_iv_finalise_report: {\n        Args: { _case_id: string | null; _draft_run_id?: string }",
    guard: GUARD,
    expect: "every hand-maintained nullable RPC argument is one this guard pins",
  },

  // ---- The database stops justifying it -----------------------------------
  {
    id: "NRC-NC-SQL-GAINS-A-DEFAULT",
    defect:
      "a migration gives the draft run id a DEFAULT, after which the generator CAN express it and the hand-maintained entry is stale rather than necessary",
    file: IV_SQL,
    find: "  _case_id uuid, _expected_basis_hash text, _draft_run_id uuid)\nRETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$\nDECLARE\n  _c public.scp_interview_cases%ROWTYPE;\n  _blockers text; _n integer; _next integer; _report_id uuid; _payload jsonb;\n  _latest_id",
    replace:
      "  _case_id uuid, _expected_basis_hash text, _draft_run_id uuid DEFAULT NULL)\nRETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$\nDECLARE\n  _c public.scp_interview_cases%ROWTYPE;\n  _blockers text; _n integer; _next integer; _report_id uuid; _payload jsonb;\n  _latest_id",
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
