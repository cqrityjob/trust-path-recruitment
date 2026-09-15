/**
 * BESKT PR 6 negative controls: every material assertion of the conduct
 * prompts-and-report guard must detect a planted defect in the REAL
 * computation — the migration's function bodies, DDL, trigger, index,
 * policies and grants, the rollback's refusals and drop order, the harness
 * ordering and the release bookkeeping — never a comment, and never an
 * error-message string on its own.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte (proved by the shared
 * runner).
 */
import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261117090000_bcp_conduct_prompts_and_report.sql";
const RB = "supabase/rollback/20261117090000_bcp_conduct_prompts_and_report_rollback.sql";
const SUITE = "supabase/tests/bcp_conduct_prompts_and_report_test.sql";
const DB = "scripts/db-test.sh";
const STATE = "supabase/release-state.json";
const PKG = "package.json";
const TSCONFIG = "tsconfig.scripts.json";
const CI = ".github/workflows/ci.yml";
const FRONTIER = "scripts/release-frontier-check.ts";
const GUARD = "beskt-conduct-report:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The prompt reader answers on the frozen version ----------------------
  {
    id: "RPT-NC-PROMPTS-LATEST-VERSION",
    defect:
      "the prompt reader resolves the method's CURRENT version instead of the one the session froze, so wordings can change under a running interview",
    file: MIG,
    find:
      "  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;\n" +
      "  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id;\n" +
      "\n" +
      "  -- A version that is no longer published stops answering.",
    replace:
      "  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;\n" +
      "  SELECT * INTO _v FROM public.beskt_method_versions v WHERE v.pack_id = (SELECT pack_id FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id) ORDER BY v.version_number DESC LIMIT 1;\n" +
      "\n" +
      "  -- A version that is no longer published stops answering.",
    guard: GUARD,
    expect: "PROMPTS-FROZEN",
  },
  {
    id: "RPT-NC-PROMPTS-UNPUBLISHED",
    defect: "a version that is no longer published goes on handing out interviewer wordings",
    file: MIG,
    find: "     OR _v.content_status <> 'published'",
    replace: "     OR false",
    guard: GUARD,
    expect: "PROMPTS-PUBLISHED",
  },
  {
    id: "RPT-NC-PROMPTS-WRONG-MODE",
    defect:
      "a security-vetting method is rendered as recruitment support, which is the one conflation BESKT exists to prevent",
    file: MIG,
    find: "     OR _v.mode <> 'recruitment_support' THEN",
    replace: "     OR false THEN",
    guard: GUARD,
    expect: "PROMPTS-MODE",
  },
  {
    id: "RPT-NC-PROMPTS-SECURITY-ACCESS-CLASS",
    defect:
      "wordings reserved for an authorised security function are returned to an ordinary recruitment interviewer",
    file: MIG,
    find:
      "               AND pi.permitted_mode = 'recruitment_support'\n" +
      "               AND pi.access_class <> 'authorised_security_function'), '[]'::jsonb))",
    replace: "               AND pi.permitted_mode = 'recruitment_support'), '[]'::jsonb))",
    guard: GUARD,
    expect: "PROMPTS-ACCESS",
  },
  {
    id: "RPT-NC-PROMPTS-EXPOSURE-PROFILE",
    defect:
      "the per-item prompt lookup stops honouring the exposure profile the assignment pinned, so a broader profile's wordings leak into a narrower interview",
    file: MIG,
    find:
      "               AND pr.item_id = t.item_id\n" +
      "               AND pr.exposure_profile_id = _a.exposure_profile_id",
    replace: "               AND pr.item_id = t.item_id",
    guard: GUARD,
    expect: "PROMPTS-FROZEN",
  },
  {
    id: "RPT-NC-PROMPTS-NO-AUTHORITY",
    defect:
      "the prompt reader stops gating on the existing case authority, so anyone who can name a session id reads the governed wordings",
    file: MIG,
    find:
      "  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN\n" +
      "    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;\n" +
      "\n" +
      "  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;",
    replace: "  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;",
    guard: GUARD,
    expect: "PROMPTS-AUTH",
  },
  {
    id: "RPT-NC-PROMPTS-SILENT-EMPTY",
    defect:
      "an unavailable version returns an empty list with no reason, which looks exactly like a method that simply has no prompts",
    file: MIG,
    find:
      "      'reason', CASE WHEN _v.id IS NULL THEN 'version_not_found'\n" +
      "                     WHEN _v.mode <> 'recruitment_support' THEN 'mode_not_permitted'\n" +
      "                     ELSE 'version_not_published' END,",
    replace: "      'reason', NULL,",
    guard: GUARD,
    expect: "PROMPTS-UNAVAILABLE",
  },

  // ---- No new access to the governed catalogue ------------------------------
  {
    id: "RPT-NC-CATALOGUE-WIDENED",
    defect:
      "the prompt catalogue is opened with a second policy instead of being read through the governed function",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_conduct_topic_prompts(uuid) FROM PUBLIC, anon;",
    replace:
      "CREATE POLICY beskt_prompts_interviewer_read ON public.beskt_prompts\n  FOR SELECT TO authenticated USING (true);\n\nREVOKE ALL ON FUNCTION public.bcp_conduct_topic_prompts(uuid) FROM PUBLIC, anon;",
    guard: GUARD,
    expect: "PROMPTS-CATALOGUE",
  },

  // ---- The report table -----------------------------------------------------
  {
    id: "RPT-NC-JUDGEMENT-COLUMN",
    defect: "the report gains somewhere to store a suitability verdict",
    file: MIG,
    find: "  version_number integer NOT NULL CHECK (version_number >= 1),",
    replace:
      "  suitability_verdict text,\n  version_number integer NOT NULL CHECK (version_number >= 1),",
    guard: GUARD,
    expect: "REPORT-NO-JUDGEMENT",
  },
  {
    id: "RPT-NC-HASH-UNCONSTRAINED",
    defect:
      "the content hash stops being constrained to a real sha256 digest and becomes free text",
    file: MIG,
    find: "  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),",
    replace: "  content_hash text NOT NULL,",
    guard: GUARD,
    expect: "REPORT-INTEGRITY",
  },
  {
    id: "RPT-NC-DRAFT-STATUS",
    defect:
      "a third report status appears, giving an edit somewhere to hide in a document that is supposed to be final or superseded and nothing else",
    file: MIG,
    find: "  status text NOT NULL CHECK (status IN ('final', 'superseded')),",
    replace: "  status text NOT NULL CHECK (status IN ('draft', 'final', 'superseded')),",
    guard: GUARD,
    expect: "REPORT-LIFECYCLE",
  },
  {
    id: "RPT-NC-TWO-FINALS",
    defect:
      "the one-final-per-session index is dropped, so two live reports can exist for one interview and nobody can say which one is the record",
    file: MIG,
    find:
      "CREATE UNIQUE INDEX bcp_conduct_reports_one_final_per_session_idx\n" +
      "  ON public.bcp_conduct_reports (session_id)\n" +
      "  WHERE status = 'final';",
    replace:
      "CREATE INDEX bcp_conduct_reports_one_final_per_session_idx\n" +
      "  ON public.bcp_conduct_reports (session_id);",
    guard: GUARD,
    expect: "REPORT-LIFECYCLE",
  },
  {
    id: "RPT-NC-OPERATION-ID-NOT-UNIQUE",
    defect:
      "the operation id stops being unique in the table, so a duplicate finalisation could land twice if the replay check were ever bypassed",
    file: MIG,
    find: "  operation_id uuid NOT NULL UNIQUE,",
    replace: "  operation_id uuid NOT NULL,",
    guard: GUARD,
    expect: "REPORT-IDEMPOTENCY",
  },
  {
    id: "RPT-NC-PROVENANCE-CASCADES",
    defect:
      "the method version a finalised report rests on can be deleted out from under it, leaving a signed document nobody can trace",
    file: MIG,
    find:
      "  bound_method_version_id uuid NOT NULL\n" +
      "    REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,",
    replace:
      "  bound_method_version_id uuid NOT NULL\n" +
      "    REFERENCES public.beskt_method_versions(id) ON DELETE SET NULL,",
    guard: GUARD,
    expect: "REPORT-PROVENANCE",
  },

  // ---- Immutability ---------------------------------------------------------
  {
    id: "RPT-NC-DELETE-PERMITTED",
    defect: "a finalised report can be deleted",
    file: MIG,
    find:
      "  IF TG_OP = 'DELETE' THEN\n" +
      "    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_IMMUTABLE: a finalised report is never deleted.'\n" +
      "      USING ERRCODE = 'check_violation';\n" +
      "  END IF;",
    replace: "  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;",
    guard: GUARD,
    expect: "REPORT-IMMUTABLE",
  },
  {
    id: "RPT-NC-PAYLOAD-EDITABLE",
    defect:
      "the payload stops being compared on update, so a supersede can quietly rewrite what the document said",
    file: MIG,
    find: "       OR NEW.payload::text <> OLD.payload::text\n",
    replace: "",
    guard: GUARD,
    expect: "REPORT-IMMUTABLE",
  },
  {
    id: "RPT-NC-SIGNER-EDITABLE",
    defect: "the recorded signer can be changed after the fact",
    file: MIG,
    find: "       OR NEW.finalised_by <> OLD.finalised_by\n",
    replace: "",
    guard: GUARD,
    expect: "REPORT-IMMUTABLE",
  },
  {
    id: "RPT-NC-STATUS-REOPENED",
    defect:
      "a superseded report can be promoted back to final, so the history of which document stood when stops being answerable",
    file: MIG,
    find: "    IF NOT (OLD.status = 'final' AND NEW.status = 'superseded') THEN",
    replace: "    IF false THEN",
    guard: GUARD,
    expect: "REPORT-IMMUTABLE",
  },
  {
    id: "RPT-NC-TRIGGER-STATEMENT-LEVEL",
    defect:
      "the immutability guard becomes a statement-level trigger, which never sees the rows it is supposed to compare",
    file: MIG,
    find:
      "CREATE TRIGGER bcp_conduct_reports_immutable\n" +
      "  BEFORE UPDATE OR DELETE ON public.bcp_conduct_reports\n" +
      "  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_report();",
    replace:
      "CREATE TRIGGER bcp_conduct_reports_immutable\n" +
      "  BEFORE UPDATE OR DELETE ON public.bcp_conduct_reports\n" +
      "  FOR EACH STATEMENT EXECUTE FUNCTION public.bcp_guard_conduct_report();",
    guard: GUARD,
    expect: "REPORT-IMMUTABLE",
  },
  {
    id: "RPT-NC-GUARD-PUBLISHED",
    defect:
      "the invariant checker is left executable by authenticated, so PostgREST publishes it as an API",
    file: MIG,
    find:
      "REVOKE ALL ON FUNCTION public.bcp_guard_conduct_report()\n" +
      "  FROM PUBLIC, anon, authenticated, service_role;",
    replace: "REVOKE ALL ON FUNCTION public.bcp_guard_conduct_report() FROM PUBLIC, anon;",
    guard: GUARD,
    expect: "REPORT-SURFACE",
  },

  // ---- RLS, grants and the surface ------------------------------------------
  {
    id: "RPT-NC-NO-FORCE-RLS",
    defect:
      "the report table stops FORCING row security, so the table owner's own reads and writes bypass every policy",
    file: MIG,
    find: "ALTER TABLE public.bcp_conduct_reports FORCE ROW LEVEL SECURITY;",
    replace: "",
    guard: GUARD,
    expect: "REPORT-RLS",
  },
  {
    id: "RPT-NC-CLIENT-DML",
    defect: "a client role is granted INSERT on the report table, bypassing the governed function",
    file: MIG,
    find: "GRANT SELECT ON public.bcp_conduct_reports TO authenticated, service_role;",
    replace:
      "GRANT SELECT ON public.bcp_conduct_reports TO authenticated, service_role;\nGRANT INSERT ON public.bcp_conduct_reports TO service_role;",
    guard: GUARD,
    expect: "REPORT-GRANTS",
  },
  {
    id: "RPT-NC-WRITE-POLICY",
    defect: "a write policy appears on the report table",
    file: MIG,
    find:
      "CREATE POLICY bcp_conduct_reports_member_read ON public.bcp_conduct_reports\n" +
      "  FOR SELECT TO authenticated\n" +
      "  USING (public.scp_iv_can_read_case(case_id));",
    replace:
      "CREATE POLICY bcp_conduct_reports_member_read ON public.bcp_conduct_reports\n" +
      "  FOR SELECT TO authenticated\n" +
      "  USING (public.scp_iv_can_read_case(case_id));\n\n" +
      "CREATE POLICY bcp_conduct_reports_member_write ON public.bcp_conduct_reports\n" +
      "  FOR INSERT TO authenticated\n" +
      "  WITH CHECK (public.scp_iv_can_write_case(case_id));",
    guard: GUARD,
    expect: "REPORT-RLS",
  },
  {
    id: "RPT-NC-ANON-CAN-PREVIEW",
    defect: "the preview is granted to anon, so an unauthenticated caller reaches the whole record",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_conduct_preview_report(uuid) FROM PUBLIC, anon;",
    replace: "REVOKE ALL ON FUNCTION public.bcp_conduct_preview_report(uuid) FROM PUBLIC;",
    guard: GUARD,
    expect: "REPORT-SURFACE",
  },
  {
    id: "RPT-NC-BUILDER-EXPOSED",
    defect:
      "the unguarded basis builder becomes callable by authenticated, so any signed-in user assembles any case's whole interview record",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_conduct_build_report_basis(uuid) FROM PUBLIC, anon, authenticated;",
    replace:
      "REVOKE ALL ON FUNCTION public.bcp_conduct_build_report_basis(uuid) FROM PUBLIC, anon;",
    guard: GUARD,
    expect: "REPORT-SURFACE",
  },
  {
    id: "RPT-NC-UNPINNED-SEARCH-PATH",
    defect:
      "the finalisation loses its pinned search_path, so a caller's path decides which functions it reaches",
    file: MIG,
    find: "  _expected_basis_hash text)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public",
    replace: "  _expected_basis_hash text)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER",
    guard: GUARD,
    expect: "REPORT-SURFACE",
  },
  {
    id: "RPT-NC-PURE-HASH-DEFINER",
    defect:
      "the pure basis hash is marked SECURITY DEFINER, handing privileges to a function that maps a value to a digest",
    file: MIG,
    find:
      "CREATE OR REPLACE FUNCTION public.bcp_conduct_basis_hash(_payload jsonb)\n" +
      "RETURNS text\nLANGUAGE sql\nIMMUTABLE\nSTRICT\nSET search_path = public",
    replace:
      "CREATE OR REPLACE FUNCTION public.bcp_conduct_basis_hash(_payload jsonb)\n" +
      "RETURNS text\nLANGUAGE sql\nIMMUTABLE\nSTRICT\nSECURITY DEFINER\nSET search_path = public",
    guard: GUARD,
    expect: "REPORT-PURITY",
  },

  // ---- Authority and order --------------------------------------------------
  {
    id: "RPT-NC-FINALISE-READ-AUTHORITY",
    defect:
      "finalising settles for the case READ authority, so anyone who may look at a case can sign its report",
    file: MIG,
    find: "  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN",
    replace: "  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN",
    guard: GUARD,
    expect: "REPORT-AUTH",
  },
  {
    id: "RPT-NC-READBACK-UNGATED",
    defect:
      "the finalised-report readback stops checking the case authority, so a signed document about a named candidate is readable by any signed-in user who can name the session",
    file: MIG,
    find:
      "  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN\n" +
      "    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;\n" +
      "\n" +
      "  SELECT * INTO _r FROM public.bcp_conduct_reports",
    replace: "  SELECT * INTO _r FROM public.bcp_conduct_reports",
    guard: GUARD,
    expect: "REPORT-AUTH",
  },

  // ---- Idempotency, concurrency, the basis contract -------------------------
  {
    id: "RPT-NC-NO-REPLAY-GUARD",
    defect:
      "the replay check is answered AFTER the record is assembled and written, so a retried finalisation writes a second report",
    file: MIG,
    find:
      "  _replay := public.bcp_operation_begin(_operation_id, _hash);\n" +
      "  IF _replay IS NOT NULL THEN RETURN _replay; END IF;\n",
    replace: "",
    guard: GUARD,
    expect: "REPORT-IDEMPOTENCY",
  },
  {
    id: "RPT-NC-NO-ADVISORY-LOCK",
    defect:
      "two simultaneous finalisations of one session stop serialising, so the one-final index decides the winner by luck",
    file: MIG,
    find: "  PERFORM pg_advisory_xact_lock(hashtextextended(_session_id::text, 0));",
    replace: "",
    guard: GUARD,
    expect: "REPORT-CONCURRENCY",
  },
  {
    id: "RPT-NC-PREVIEW-NOT-REQUIRED",
    defect:
      "a report can be signed without a preview, so what is signed is not necessarily what anybody read",
    file: MIG,
    find: "  IF _expected_basis_hash IS NULL OR btrim(_expected_basis_hash) = '' THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "REPORT-BASIS",
  },
  {
    id: "RPT-NC-STALE-PREVIEW-ACCEPTED",
    defect:
      "a preview the record has moved past is accepted, so the document signed is not the document read",
    file: MIG,
    find: "  IF _expected_basis_hash <> _basis THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "REPORT-BASIS",
  },
  {
    id: "RPT-NC-SUPERSEDE-AFTER-INSERT",
    defect:
      "the predecessor steps down AFTER the successor is inserted, so the one-final index refuses both and no report is ever written",
    file: MIG,
    find:
      "  UPDATE public.bcp_conduct_reports\n" +
      "     SET status = 'superseded'\n" +
      "   WHERE session_id = _session_id AND status = 'final';\n\n" +
      "  INSERT INTO public.bcp_conduct_reports",
    replace: "  INSERT INTO public.bcp_conduct_reports",
    guard: GUARD,
    expect: "REPORT-LIFECYCLE",
  },
  {
    id: "RPT-NC-NO-LEDGER-WRITE",
    defect:
      "signing a report stops being recorded on PR 3's append-only ledger, so the one act the chain exists to make accountable leaves no trace",
    file: MIG,
    find: "  PERFORM public.bcp_record_event(\n    _s.assignment_id, _s.bound_response_id,",
    replace:
      "  PERFORM public.bcp_record_event_disabled(\n    _s.assignment_id, _s.bound_response_id,",
    guard: GUARD,
    expect: "REPORT-AUDIT",
  },
  {
    id: "RPT-NC-BASIS-INCLUDES-LEDGER",
    defect:
      "the basis hash stops excluding the event ledger, so finalising invalidates the basis it was just signed against and no re-finalisation can ever match",
    file: MIG,
    find: "  SELECT encode(sha256(convert_to((_payload #- '{audit_events}')::text, 'UTF8')), 'hex');",
    replace: "  SELECT encode(sha256(convert_to(_payload::text, 'UTF8')), 'hex');",
    guard: GUARD,
    expect: "REPORT-BASIS",
  },
  {
    id: "RPT-NC-TWO-BUILDERS",
    defect:
      "finalisation assembles its own payload instead of calling the one builder the preview uses, so preview and signature can drift",
    file: MIG,
    find:
      "  _payload := public.bcp_conduct_build_report_basis(_session_id);\n" +
      "  _basis := public.bcp_conduct_basis_hash(_payload);",
    replace:
      "  _payload := jsonb_build_object('session_id', _session_id);\n" +
      "  _basis := public.bcp_conduct_basis_hash(_payload);",
    guard: GUARD,
    expect: "REPORT-BASIS",
  },

  // ---- Blockers -------------------------------------------------------------
  {
    id: "RPT-NC-OPEN-POSITION-IGNORED",
    defect:
      "a report can be written while an assessor's position is still open, so an unfinished independent judgement is frozen into a signed document",
    file: MIG,
    find: "  IF _unlocked > 0 THEN\n" + "    code := 'BCP_CONDUCT_POSITION_OPEN';",
    replace: "  IF false THEN\n" + "    code := 'BCP_CONDUCT_POSITION_OPEN_UNUSED';",
    guard: GUARD,
    expect: "REPORT-BLOCKERS",
  },
  {
    id: "RPT-NC-PANEL-NOT-REQUIRED",
    defect:
      "two independent positions no longer require a panel, so two assessors' differing accounts are reported with no structured resolution",
    file: MIG,
    find: "  IF _positions > 1 THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "REPORT-BLOCKERS",
  },
  {
    id: "RPT-NC-RESOLUTION-OVER-BROAD",
    defect:
      "a resolution is demanded for every documented theme rather than the ones more than one assessor documented, turning a safeguard into ceremony",
    file: MIG,
    find: "              HAVING count(DISTINCT e.position_id) > 1) shared",
    replace: "              HAVING count(*) > 0) shared",
    guard: GUARD,
    expect: "REPORT-BLOCKERS",
  },

  // ---- The payload ----------------------------------------------------------
  {
    id: "RPT-NC-PAYLOAD-NO-COUNTER-EXPLANATION",
    defect:
      "the frozen document drops the alternative explanation, so what contradicted the interviewer's reading survives nowhere in the report",
    file: MIG,
    find: "                'alternative_explanation', e.alternative_explanation,",
    replace: "",
    guard: GUARD,
    expect: "REPORT-PAYLOAD",
  },
  {
    id: "RPT-NC-PAYLOAD-NO-PROTECTIVE-FACTOR",
    defect: "what speaks in the candidate's favour is dropped from the report",
    file: MIG,
    find: "                'protective_factor', e.protective_factor,",
    replace: "",
    guard: GUARD,
    expect: "REPORT-PAYLOAD",
  },
  {
    id: "RPT-NC-PAYLOAD-NO-VERIFICATION-NEED",
    defect:
      "what still has to be checked is dropped from the report, so an open verification reads as a settled finding",
    file: MIG,
    find: "                'verification_need', e.verification_need,\n",
    replace: "",
    guard: GUARD,
    expect: "REPORT-PAYLOAD",
  },
  {
    id: "RPT-NC-PAYLOAD-NO-INFORMATION-GAPS",
    defect:
      "what remains unknown is dropped, so the report reads as more complete than the conversation was",
    file: MIG,
    find: "        'information_gaps',",
    replace: "        'information_gaps_unused',",
    guard: GUARD,
    expect: "REPORT-PAYLOAD",
  },
  {
    id: "RPT-NC-PAYLOAD-NO-AUDIT",
    defect: "the report drops the audit history it is supposed to carry",
    file: MIG,
    find: "    'audit_events',",
    replace: "    'audit_events_unused',",
    guard: GUARD,
    expect: "REPORT-PAYLOAD",
  },
  {
    id: "RPT-NC-PAYLOAD-CLAIMS-INTERPRETATION",
    defect:
      "the payload stops saying it produces no ranking, so a reader is free to take the document as one",
    file: MIG,
    find: "    'produces_ranking', false,",
    replace: "",
    guard: GUARD,
    expect: "REPORT-NO-JUDGEMENT",
  },
  {
    id: "RPT-NC-PAYLOAD-SUPERSEDED-AS-LIVE",
    defect:
      "corrected entries are reported as if they were the live record, so a superseded statement is presented as what was found",
    file: MIG,
    find:
      "             WHERE e.position_id = pos.id\n" +
      "               AND e.superseded_by_entry_id IS NULL), '[]'::jsonb),",
    replace: "             WHERE e.position_id = pos.id), '[]'::jsonb),",
    guard: GUARD,
    expect: "REPORT-PAYLOAD",
  },

  // ---- Postflight -----------------------------------------------------------
  {
    id: "RPT-NC-POSTFLIGHT-NO-PROOF",
    defect: "the migration stops proving its own outcome before committing",
    file: MIG,
    find: "  RAISE NOTICE 'BESKT_CONDUCT_PROMPTS_AND_REPORT_PROOF ok';",
    replace: "  NULL;",
    guard: GUARD,
    expect: "REPORT-POSTFLIGHT",
  },
  {
    id: "RPT-NC-POSTFLIGHT-NO-JUDGEMENT-SWEEP",
    defect:
      "the postflight stops asking the catalogue whether a judgement column exists and merely promises none does",
    file: MIG,
    find:
      "    IF EXISTS (SELECT 1 FROM information_schema.columns\n" +
      "                WHERE table_schema = 'public' AND table_name = 'bcp_conduct_reports'\n" +
      "                  AND column_name LIKE '%' || _word || '%') THEN",
    replace: "    IF false THEN",
    guard: GUARD,
    expect: "REPORT-POSTFLIGHT",
  },
  {
    id: "RPT-NC-POSTFLIGHT-PURE-HASH",
    defect:
      "the postflight stops proving the pure hash is NOT a definer function — the exact assertion this migration got wrong once",
    file: MIG,
    find:
      "                  WHERE n.nspname = 'public' AND p.proname = 'bcp_conduct_basis_hash'\n" +
      "                    AND NOT p.prosecdef\n" +
      "                    AND p.provolatile = 'i'",
    replace:
      "                  WHERE n.nspname = 'public' AND p.proname = 'bcp_conduct_basis_hash'",
    guard: GUARD,
    expect: "REPORT-POSTFLIGHT",
  },
  {
    id: "RPT-NC-VOCABULARY-NARROWED",
    defect:
      "the rebuilt event CHECK silently drops a PR 5A member, breaking the conduct layer with no error at apply time",
    file: MIG,
    find: "    'conduct_position_locked', 'conduct_position_reopened',\n    'conduct_panel_opened', 'conduct_panel_revealed',\n    'conduct_panel_resolution_recorded',\n    -- PR 6",
    replace:
      "    'conduct_position_locked', 'conduct_position_reopened',\n    'conduct_panel_opened', 'conduct_panel_revealed',\n    -- PR 6",
    guard: GUARD,
    expect: "REPORT-VOCABULARY",
  },
  {
    id: "RPT-NC-SEEDS-CONTENT",
    defect:
      "the migration seeds method content, which is exactly the governance bypass the whole BESKT stack forbids",
    file: MIG,
    find: "-- 11 · Postflight.",
    replace:
      "INSERT INTO public.beskt_prompts (id) VALUES (gen_random_uuid());\n\n-- 11 · Postflight.",
    guard: GUARD,
    expect: "REPORT-NO-SEED",
  },

  // ---- The rollback ---------------------------------------------------------
  {
    id: "RPT-NC-ROLLBACK-DISCARDS-REPORTS",
    defect:
      "the rollback drops finalised reports instead of refusing, performing the one edit the design exists to prevent",
    file: RB,
    find: "  SELECT count(*) INTO _reports FROM public.bcp_conduct_reports;\n  IF _reports <> 0 THEN",
    replace: "  SELECT count(*) INTO _reports FROM public.bcp_conduct_reports;\n  IF false THEN",
    guard: GUARD,
    expect: "REPORT-ROLLBACK",
  },
  {
    id: "RPT-NC-ROLLBACK-IGNORES-LEDGER",
    defect:
      "the rollback tries to narrow the vocabulary over an append-only ledger that already records a signed report, so it fails halfway through having already dropped the table",
    file: RB,
    find:
      "  SELECT count(*) INTO _events FROM public.bcp_events WHERE event = 'conduct_report_finalised';\n" +
      "  IF _events <> 0 THEN",
    replace:
      "  SELECT count(*) INTO _events FROM public.bcp_events WHERE event = 'conduct_report_finalised';\n" +
      "  IF false THEN",
    guard: GUARD,
    expect: "REPORT-ROLLBACK",
  },
  {
    id: "RPT-NC-ROLLBACK-CASCADE",
    defect:
      "the rollback drops with CASCADE, silently taking whatever else had come to depend on these objects",
    file: RB,
    find: "DROP TABLE IF EXISTS public.bcp_conduct_reports;",
    replace: "DROP TABLE IF EXISTS public.bcp_conduct_reports CASCADE;",
    guard: GUARD,
    expect: "REPORT-ROLLBACK",
  },
  {
    id: "RPT-NC-ROLLBACK-LEAVES-FUNCTION",
    defect: "the rollback leaves the prompt reader behind while claiming nothing of PR 6 survives",
    file: RB,
    find: "DROP FUNCTION IF EXISTS public.bcp_conduct_topic_prompts(uuid);",
    replace: "",
    guard: GUARD,
    expect: "REPORT-ROLLBACK",
  },
  {
    id: "RPT-NC-ROLLBACK-UNWINDS-PR5A",
    defect:
      "the rollback reaches past PR 6 and drops PR 5A's conduct record, which is not its to unwind",
    file: RB,
    find: "DROP FUNCTION IF EXISTS public.bcp_conduct_topic_prompts(uuid);",
    replace:
      "DROP TABLE IF EXISTS public.bcp_conduct_entries;\nDROP FUNCTION IF EXISTS public.bcp_conduct_topic_prompts(uuid);",
    guard: GUARD,
    expect: "REPORT-ROLLBACK",
  },
  {
    id: "RPT-NC-ROLLBACK-NARROWS-PAST-PR5A",
    defect:
      "the restored vocabulary drops a PR 5A member too, so unwinding PR 6 breaks the layer beneath it",
    file: RB,
    find: "    'conduct_session_started', 'conduct_entry_saved', 'conduct_entry_corrected',",
    replace: "    'conduct_entry_saved', 'conduct_entry_corrected',",
    guard: GUARD,
    expect: "REPORT-ROLLBACK",
  },
  {
    id: "RPT-NC-ROLLBACK-NO-PROOF",
    defect: "the rollback stops proving the way back is actually clear",
    file: RB,
    find: "  RAISE NOTICE 'BESKT_CONDUCT_PROMPTS_AND_REPORT_ROLLBACK ok';",
    replace: "  NULL;",
    guard: GUARD,
    expect: "REPORT-ROLLBACK",
  },

  // ---- The suite ------------------------------------------------------------
  {
    id: "RPT-NC-SUITE-SEEDS",
    defect:
      "the behaviour suite commits its synthetic world instead of rolling it back, leaving planted rows in the database",
    file: SUITE,
    find: "\nROLLBACK;",
    replace: "\nCOMMIT;",
    guard: GUARD,
    expect: "REPORT-SUITE",
  },
  {
    id: "RPT-NC-SUITE-DUPLICATE-LABEL",
    defect: "two assertions share a label, so a failure no longer names exactly one thing",
    file: SUITE,
    find: "'R1.1b the blocker reader is reachable on its own, not only through the preview'",
    replace: "'R1.1 an empty conversation is blocked for having nothing to report'",
    guard: GUARD,
    expect: "REPORT-SUITE",
  },
  {
    id: "RPT-NC-SUITE-NO-IMMUTABILITY-PROOF",
    defect:
      "the suite stops proving that a finalised report cannot be changed, which is the whole promise of the table",
    file: SUITE,
    find:
      "    UPDATE public.bcp_conduct_reports SET finalised_by = _r.rec_b WHERE id = _r.report_id;\n" +
      "    PERFORM pg_temp.ok(false, 'R4.10 FAILED: the owner changed who signed a report');\n" +
      "  EXCEPTION WHEN OTHERS THEN\n" +
      "    PERFORM pg_temp.ok(SQLERRM LIKE '%BCP_CONDUCT_REPORT_IMMUTABLE%',\n" +
      "      'R4.10 the owner cannot change who signed a report');",
    replace:
      "    UPDATE public.bcp_conduct_reports SET finalised_by = _r.rec_b WHERE id = _r.report_id;\n" +
      "    PERFORM pg_temp.ok(true, 'R4.10 the owner changed who signed a report');\n" +
      "  EXCEPTION WHEN OTHERS THEN\n" +
      "    PERFORM pg_temp.ok(true,\n" +
      "      'R4.10 the owner cannot change who signed a report');",
    guard: GUARD,
    expect: "REPORT-SUITE",
  },

  // ---- Registration and release bookkeeping ---------------------------------
  {
    id: "RPT-NC-DB-TEST-UNREGISTERED",
    defect: "the behaviour suite stops running in the database harness",
    file: DB,
    find: '  -f supabase/tests/bcp_conduct_prompts_and_report_test.sql 2>&1)"',
    replace: '  -f supabase/tests/bcp_conduct_prompts_and_report_test_unused.sql 2>&1)"',
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
  {
    id: "RPT-NC-DB-TEST-FLOOR-LOWERED",
    defect:
      "the assertion floor is lowered to nothing, so a suite that silently stopped running most of itself still passes",
    file: DB,
    find: '  if [ "$RPT_PASSED" -lt 60 ]; then',
    replace: '  if [ "$RPT_PASSED" -lt 1 ]; then',
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
  {
    id: "RPT-NC-DB-TEST-FAILURE-IGNORED",
    defect:
      "a failure in the PR 6 block prints and the run continues, so a red suite reports green",
    file: DB,
    find: '  suite_failed "BESKT prompts and report"',
    replace: '  echo "    !!  BESKT prompts and report had failures"',
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
  {
    id: "RPT-NC-DB-TEST-ORDER",
    defect:
      "PR 6 is stood down AFTER PR 5A's rollback, which cannot work: bcp_conduct_reports holds a foreign key into bcp_conduct_sessions and neither rollback uses CASCADE",
    file: DB,
    find: "# Stand PR 6 down so PR 5A can be unwound below: bcp_conduct_reports holds a\n# foreign key into bcp_conduct_sessions.",
    replace: "# (ordering note removed)",
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
  {
    id: "RPT-NC-CONTROLS-NOT-IN-ALL",
    defect:
      "these controls drop out of negative-controls:all, so a dead assertion here stops being visible",
    file: PKG,
    find: "bun run negative-controls:beskt-conduct-report && ",
    replace: "",
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
  {
    id: "RPT-NC-CI-UNREGISTERED",
    defect: "the guard stops running in CI",
    file: CI,
    find: "        run: bun run beskt-conduct-report:check",
    replace: "        run: echo skipped",
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
  {
    id: "RPT-NC-TSCONFIG-UNREGISTERED",
    defect: "the guard and its controls stop being typechecked",
    file: TSCONFIG,
    find: '    "scripts/beskt-conduct-report-check.ts",\n',
    replace: "",
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
  {
    id: "RPT-NC-STATE-CLAIMS-APPLIED",
    defect:
      "release-state.json claims the migration is applied to production when nothing established that, which is the exact unverified claim this stack exists to prevent",
    file: STATE,
    find: '"file": "20261117090000_bcp_conduct_prompts_and_report.sql",\n      "hostedState": "pending",',
    replace:
      '"file": "20261117090000_bcp_conduct_prompts_and_report.sql",\n      "hostedState": "unverified",',
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
  {
    id: "RPT-NC-STATE-HIDES-OBJECT",
    defect:
      "the report table stops being declared as introduced, so release-parity can no longer tell whether application code may depend on it",
    file: STATE,
    find: '          "object": "bcp_conduct_reports",\n          "kind": "table"\n        },\n',
    replace: "",
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
  {
    id: "RPT-NC-FRONTIER-NOT-PENDING",
    defect:
      "the migration comes off the owner-level pending list while release-state.json still says pending, so the two files disagree about production",
    file: FRONTIER,
    find: '  "20261117090000_bcp_conduct_prompts_and_report.sql",\n',
    replace: "",
    guard: GUARD,
    expect: "REPORT-REGISTRATION",
  },
];

runControls("beskt-conduct-report", MUTATIONS);
