/**
 * BESKT PR 4 negative controls: every material assertion of the
 * interview-case bridge guard must detect a planted defect in the REAL
 * computation — the migration's function bodies, DDL, triggers, indexes and
 * grants, the rollback's verbatim restore and drop order, the harness
 * ordering and the release bookkeeping — never a comment, and never an
 * error-message string on its own.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte (proved by the shared
 * runner).
 */
import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261112090000_bcp_interview_case_bridge.sql";
const RB = "supabase/rollback/20261112090000_bcp_interview_case_bridge_rollback.sql";
const SUITE = "supabase/tests/bcp_interview_case_bridge_test.sql";
const DB = "scripts/db-test.sh";
const STATE = "supabase/release-state.json";
const PKG = "package.json";
const TSCONFIG = "tsconfig.scripts.json";
const CI = ".github/workflows/ci.yml";
const FRONTIER = "scripts/release-frontier-check.ts";
const GUARD = "beskt-interview-case-bridge:check";
const RB_SUITE = "supabase/tests/scp_a_rollback_test.sql";

const MUTATIONS: readonly Mutation[] = [
  // ---- No parallel case system --------------------------------------------
  {
    id: "BRG-NC-PARALLEL-CASE-TABLE",
    defect:
      "PR 4 opens a case store of its own instead of using the interview case that already exists",
    file: MIG,
    find: "CREATE TABLE public.bcp_case_topics (",
    replace:
      "CREATE TABLE public.bcp_interview_sessions (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid()\n);\n\nCREATE TABLE public.bcp_case_topics (",
    guard: GUARD,
    expect: "BRIDGE-NO-PARALLEL",
  },
  {
    id: "BRG-NC-CREATES-THE-CASE",
    defect: "the bridge creates the interview case rather than binding to one that exists",
    file: MIG,
    find: "  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;",
    replace:
      "  INSERT INTO public.scp_interview_cases (id) VALUES (_case_id) ON CONFLICT DO NOTHING;\n  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;",
    guard: GUARD,
    expect: "BRIDGE-REUSE",
  },
  {
    id: "BRG-NC-NO-EVIDENCE-REUSE",
    defect:
      "the link stops registering itself on the existing case-sources structure, so the interview has no governed record of where the material came from",
    file: MIG,
    find: "  INSERT INTO public.scp_interview_case_sources",
    replace: "  INSERT INTO public.scp_interview_case_sources_disabled",
    guard: GUARD,
    expect: "BRIDGE-REUSE",
  },

  // ---- The governed vocabularies ------------------------------------------
  {
    id: "BRG-NC-CONSTRAINT-BY-NAME",
    defect:
      "the source-kind constraint is looked up by a generated name instead of through the catalogue, so a differently-named constraint would be silently left in place",
    file: MIG,
    find: "   AND pg_get_constraintdef(c.oid) LIKE '%source_kind%'",
    replace: "   AND c.conname = 'scp_interview_case_sources_source_kind_check'",
    guard: GUARD,
    expect: "BRIDGE-VOCABULARY",
  },
  {
    id: "BRG-NC-EVENT-VOCABULARY-NARROWED",
    defect: "the rebuilt event CHECK silently drops an existing member, breaking PR 3's own writes",
    file: MIG,
    find: "    'assignment_created', 'notice_acknowledged', 'response_saved',",
    replace: "    'assignment_created', 'notice_acknowledged',",
    guard: GUARD,
    expect: "BRIDGE-VOCABULARY",
  },

  // ---- The bound snapshot --------------------------------------------------
  {
    id: "BRG-NC-SNAPSHOT-COLUMN-DROPPED",
    defect:
      "the link stops carrying the notice locale, so which language the candidate actually read is no longer answerable from the row",
    file: MIG,
    find: "  bound_notice_locale text NOT NULL CHECK (length(btrim(bound_notice_locale)) > 0),",
    replace: "",
    guard: GUARD,
    expect: "BRIDGE-SNAPSHOT",
  },
  {
    id: "BRG-NC-HASH-UNCONSTRAINED",
    defect:
      "the bound answers hash loses its digest shape, so a placeholder string could be bound as the snapshot identity",
    file: MIG,
    find: "  bound_answers_content_hash text NOT NULL CHECK (bound_answers_content_hash ~ '^[0-9a-f]{64}$'),",
    replace: "  bound_answers_content_hash text NOT NULL,",
    guard: GUARD,
    expect: "BRIDGE-SNAPSHOT",
  },
  {
    id: "BRG-NC-TRIGGER-TRUSTS-CALLER",
    defect:
      "the trigger stops re-deriving the bound content hash from the preparation, so a direct write can assert a snapshot it does not have",
    file: MIG,
    find: "     OR NEW.bound_content_hash <> _a.pinned_content_hash\n",
    replace: "",
    guard: GUARD,
    expect: "BRIDGE-SNAPSHOT",
  },
  {
    id: "BRG-NC-NOTICE-LOCALE-UNBOUND",
    defect:
      "the acknowledgement no longer has to match the locale that was bound, so a link can claim the candidate read a notice in a language they never saw",
    file: MIG,
    find: "       AND ack.locale = NEW.bound_notice_locale) THEN",
    replace: "       ) THEN",
    guard: GUARD,
    expect: "BRIDGE-SNAPSHOT",
  },
  {
    id: "BRG-NC-DRAFT-LINKABLE",
    defect:
      "the trigger stops requiring a submitted response, so a candidate's DRAFT can reach an employer's interview case",
    file: MIG,
    find: "  IF _r.response_state <> 'submitted' OR _r.submitted_at IS NULL THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "BRIDGE-SUBMITTED-ONLY",
  },

  // ---- What the employer may read -----------------------------------------
  {
    id: "BRG-NC-BASIS-READS-ANY-RESPONSE",
    defect:
      "the employer read model reads answers by assignment rather than by the bound submitted response, so a later draft would surface",
    file: MIG,
    find: "       WHERE an.response_id = _l.bound_response_id), '[]'::jsonb),",
    replace:
      "       WHERE an.response_id IN (SELECT id FROM public.bcp_responses WHERE assignment_id = _l.assignment_id)), '[]'::jsonb),",
    guard: GUARD,
    expect: "BRIDGE-NO-DRAFTS",
  },
  {
    id: "BRG-NC-BASIS-CLAIMS-A-SCORE",
    defect: "the employer read model starts claiming to produce a score",
    file: MIG,
    find: "    'produces_score', false,",
    replace: "    'produces_score', true,",
    guard: GUARD,
    expect: "BRIDGE-NO-SCORE",
  },
  {
    id: "BRG-NC-CANDIDATE-VIEW-LEAKS-CASE",
    defect:
      "the candidate's own view starts returning the employer's case id, which is nothing the candidate is party to",
    file: MIG,
    find: "    'linked_at', _l.linked_at,\n    'topic_count'",
    replace: "    'linked_at', _l.linked_at,\n    'case_id', _l.case_id,\n    'topic_count'",
    guard: GUARD,
    expect: "BRIDGE-CANDIDATE-VIEW",
  },
  {
    id: "BRG-NC-CANDIDATE-VIEW-UNGUARDED",
    defect: "the candidate read model stops checking that the preparation belongs to the caller",
    file: MIG,
    find: "  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "BRIDGE-CANDIDATE-VIEW",
  },

  // ---- Nowhere to put a judgement -----------------------------------------
  {
    id: "BRG-NC-JUDGEMENT-COLUMN",
    defect: "a column for a reading of the candidate's omission appears on the topic table",
    file: MIG,
    find: "  display_order integer NOT NULL CHECK (display_order >= 1),\n  created_at timestamptz NOT NULL DEFAULT now(),\n\n  UNIQUE (link_id, item_id)",
    replace:
      "  display_order integer NOT NULL CHECK (display_order >= 1),\n  concern_level integer,\n  created_at timestamptz NOT NULL DEFAULT now(),\n\n  UNIQUE (link_id, item_id)",
    guard: GUARD,
    expect: "BRIDGE-NO-JUDGEMENT",
  },
  {
    id: "BRG-NC-THIRD-REASON",
    defect:
      "the reason vocabulary admits a third, judgemental value beside the candidate's own two states",
    file: MIG,
    find: "  topic_reason text NOT NULL CHECK (topic_reason IN ('omitted', 'discuss_orally')),",
    replace:
      "  topic_reason text NOT NULL CHECK (topic_reason IN ('omitted', 'discuss_orally', 'refused')),",
    guard: GUARD,
    expect: "BRIDGE-NEUTRAL-STATES",
  },
  {
    id: "BRG-NC-DERIVATION-SELECTS",
    defect:
      "the derivation stops being the whole neutral set and starts selecting a subset, which is a judgement about which omissions matter",
    file: MIG,
    find: "     AND an.response_state IN ('omitted', 'discuss_orally');",
    replace: "     AND an.response_state = 'omitted';",
    guard: GUARD,
    expect: "BRIDGE-DERIVATION",
  },
  {
    id: "BRG-NC-DERIVATION-ORDER-NONDETERMINISTIC",
    defect:
      "the topic order stops being the governed content's own order, so the same snapshot can produce two different orderings",
    file: MIG,
    find: "         row_number() OVER (ORDER BY s.display_order, i.display_order, an.item_key)",
    replace: "         row_number() OVER (ORDER BY an.item_id)",
    guard: GUARD,
    expect: "BRIDGE-DERIVATION",
  },
  {
    id: "BRG-NC-TOPIC-REASON-ASSERTED",
    defect:
      "the topic trigger stops reading the reason from the bound snapshot, so a caller can record 'omitted' against a question the candidate answered in full",
    file: MIG,
    find: "  IF _state <> NEW.topic_reason THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "BRIDGE-DERIVATION",
  },

  // ---- Idempotency, revision and concurrency ------------------------------
  {
    id: "BRG-NC-REPLAY-AFTER-WRITE",
    defect:
      "the replay check moves after the first write, so a retried request links twice before it is recognised",
    file: MIG,
    find: "  _replay := public.bcp_operation_begin(_operation_id, _hash);\n  IF _replay IS NOT NULL THEN RETURN _replay; END IF;\n\n  -- Serialise against the preparation",
    replace: "  -- Serialise against the preparation",
    guard: GUARD,
    expect: "BRIDGE-IDEMPOTENCY",
  },
  {
    id: "BRG-NC-NO-ADVISORY-LOCK",
    defect:
      "the link RPC stops serialising on the preparation, so two members pressing the button at once can tear the write",
    file: MIG,
    find: "  PERFORM pg_advisory_xact_lock(hashtextextended(_assignment_id::text, 0));",
    replace: "",
    guard: GUARD,
    expect: "BRIDGE-CONCURRENCY",
  },
  {
    id: "BRG-NC-LIVE-SLOT-NOT-UNIQUE",
    defect:
      "one-live-link-per-preparation stops being an index, leaving only a read-then-write a concurrent transaction can race past",
    file: MIG,
    find: "CREATE UNIQUE INDEX bcp_case_links_one_live_per_assignment_idx\n  ON public.bcp_case_links (live_slot) WHERE live_slot IS NOT NULL;",
    replace:
      "CREATE INDEX bcp_case_links_one_live_per_assignment_idx\n  ON public.bcp_case_links (live_slot) WHERE live_slot IS NOT NULL;",
    guard: GUARD,
    expect: "BRIDGE-CONCURRENCY",
  },
  {
    id: "BRG-NC-OPERATION-ID-NOT-UNIQUE",
    defect:
      "the link's operation id stops being unique on the row, so a replay that got past the ledger could duplicate the link",
    file: MIG,
    find: "  link_operation_id uuid NOT NULL UNIQUE,",
    replace: "  link_operation_id uuid NOT NULL,",
    guard: GUARD,
    expect: "BRIDGE-IDEMPOTENCY",
  },
  {
    id: "BRG-NC-NO-REVISION-CAS",
    defect:
      "the link RPC stops refusing a stale revision, so a member can link against a preparation that changed under them",
    file: MIG,
    find: "    RAISE EXCEPTION 'BCP_STALE_REVISION: the preparation is at revision % but the request expected %. Reload and retry.',",
    replace:
      "    RAISE EXCEPTION 'BCP_REVISION_NOTE: the preparation is at revision % but the request expected %.',",
    guard: GUARD,
    expect: "BRIDGE-REVISION",
  },
  {
    id: "BRG-NC-ANY-SIGNED-IN-USER-MAY-LINK",
    defect:
      "the link RPC stops checking employer membership, so any signed-in user can attach a preparation to a case",
    file: MIG,
    find: "  IF NOT public.has_employer_role(_caller, _a.employer_id, ARRAY['owner', 'admin', 'member']) THEN\n    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'",
    replace:
      "  IF _caller IS NULL THEN\n    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'",
    guard: GUARD,
    expect: "BRIDGE-AUTHORISATION",
  },
  {
    id: "BRG-NC-UNLINK-REASON-OPTIONAL",
    defect:
      "unlinking stops requiring a reason, so the history an audit reads afterwards says only that something was removed",
    file: MIG,
    find: "  IF length(btrim(coalesce(_reason, ''))) < 3 THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "BRIDGE-REVISION",
  },

  // ---- Append-only ---------------------------------------------------------
  {
    id: "BRG-NC-UNLINK-DELETES",
    defect: "unlinking deletes the link instead of marking it, destroying the history",
    file: MIG,
    find: "  UPDATE public.bcp_case_links\n     SET unlinked_at = now(), unlinked_by = _caller, unlinked_reason = _reason,\n         unlink_operation_id = _operation_id\n   WHERE id = _link_id;",
    replace: "  DELETE FROM public.bcp_case_links WHERE id = _link_id;",
    guard: GUARD,
    expect: "BRIDGE-APPEND-ONLY",
  },
  {
    id: "BRG-NC-LINK-DELETABLE",
    defect: "the trigger stops refusing a DELETE, so append-only no longer holds against the owner",
    file: MIG,
    find: "  IF TG_OP = 'DELETE' THEN\n    RAISE EXCEPTION 'BCP_CASE_LINK_NO_DELETE:",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BCP_CASE_LINK_NO_DELETE:",
    guard: GUARD,
    expect: "BRIDGE-APPEND-ONLY",
  },
  {
    id: "BRG-NC-LINK-REPOINTABLE",
    defect:
      "a link can be re-pointed at a different case, which breaks the binding the table exists to provide",
    file: MIG,
    find: "       OR NEW.case_id <> OLD.case_id\n",
    replace: "",
    guard: GUARD,
    expect: "BRIDGE-APPEND-ONLY",
  },
  {
    id: "BRG-NC-TOPIC-MUTABLE",
    defect: "a derived topic becomes updatable, so the frozen derivation can be edited afterwards",
    file: MIG,
    find: "  IF TG_OP <> 'INSERT' THEN\n    RAISE EXCEPTION 'BCP_CASE_TOPIC_APPEND_ONLY:",
    replace: "  IF TG_OP = 'TRUNCATE' THEN\n    RAISE EXCEPTION 'BCP_CASE_TOPIC_APPEND_ONLY:",
    guard: GUARD,
    expect: "BRIDGE-APPEND-ONLY",
  },

  // ---- RLS, grants and the PostgREST surface ------------------------------
  {
    id: "BRG-NC-FORCE-RLS",
    defect: "FORCE RLS is removed from the link table, so the owner's own writes bypass the policy",
    file: MIG,
    find: "ALTER TABLE public.bcp_case_links  FORCE  ROW LEVEL SECURITY;",
    replace: "ALTER TABLE public.bcp_case_links  NO FORCE ROW LEVEL SECURITY;",
    guard: GUARD,
    expect: "BRIDGE-RLS",
  },
  {
    id: "BRG-NC-SERVICE-ROLE-NOT-REVOKED",
    defect: "the topic table is left with service_role's default write privileges",
    file: MIG,
    find: "REVOKE ALL ON public.bcp_case_topics FROM PUBLIC, anon, authenticated, service_role;",
    replace: "REVOKE ALL ON public.bcp_case_topics FROM PUBLIC, anon, authenticated;",
    guard: GUARD,
    expect: "BRIDGE-GRANTS",
  },
  {
    id: "BRG-NC-CLIENT-WRITE-GRANT",
    defect: "a client role is granted INSERT on the link table",
    file: MIG,
    find: "GRANT SELECT ON public.bcp_case_links  TO authenticated, service_role;",
    replace:
      "GRANT SELECT ON public.bcp_case_links  TO authenticated, service_role;\nGRANT INSERT ON public.bcp_case_links TO authenticated;",
    guard: GUARD,
    expect: "BRIDGE-GRANTS",
  },
  {
    id: "BRG-NC-UNCONDITIONAL-POLICY",
    defect: "the link policy becomes unconditional, so every signed-in user reads every link",
    file: MIG,
    find: "CREATE POLICY bcp_case_links_party_read ON public.bcp_case_links\n  FOR SELECT TO authenticated\n  USING (",
    replace:
      "CREATE POLICY bcp_case_links_party_read ON public.bcp_case_links\n  FOR SELECT TO authenticated\n  USING (true OR",
    guard: GUARD,
    expect: "BRIDGE-RLS",
  },
  {
    id: "BRG-NC-TRIGGER-FN-PUBLISHED",
    defect:
      "the link trigger function keeps its default PUBLIC EXECUTE, so PostgREST publishes an invariant-checker as a callable API",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_guard_case_link() FROM PUBLIC, anon, authenticated, service_role;",
    replace: "REVOKE ALL ON FUNCTION public.bcp_guard_case_link() FROM anon;",
    guard: GUARD,
    expect: "BRIDGE-SURFACE",
  },
  {
    id: "BRG-NC-SEARCH-PATH-UNPINNED",
    defect:
      "a SECURITY DEFINER RPC loses its pinned search_path, so a caller-controlled schema can shadow the objects it reads",
    file: MIG,
    find: "CREATE OR REPLACE FUNCTION public.bcp_case_preparation_basis(_case_id uuid)\nRETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public",
    replace:
      "CREATE OR REPLACE FUNCTION public.bcp_case_preparation_basis(_case_id uuid)\nRETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER",
    guard: GUARD,
    expect: "BRIDGE-SURFACE",
  },
  {
    id: "BRG-NC-ANON-GRANTED-EXECUTE",
    defect: "anon is left able to execute the employer read model",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_case_preparation_basis(uuid) FROM PUBLIC, anon;",
    replace: "REVOKE ALL ON FUNCTION public.bcp_case_preparation_basis(uuid) FROM PUBLIC;",
    guard: GUARD,
    expect: "BRIDGE-SURFACE",
  },

  // ---- The rollback --------------------------------------------------------
  {
    id: "BRG-NC-ROLLBACK-DISCARDS-HISTORY",
    defect:
      "the rollback stops refusing while links exist, so it would silently destroy the record that candidates' preparations were attached to real interviews",
    file: RB,
    find: "  SELECT count(*) INTO _n FROM public.bcp_case_links;",
    replace: "  SELECT 0 INTO _n;",
    guard: GUARD,
    expect: "BRIDGE-ROLLBACK",
  },
  {
    id: "BRG-NC-ROLLBACK-CASCADE",
    defect:
      "the rollback drops with CASCADE, taking whatever else came to depend on the bridge without saying so",
    file: RB,
    find: "DROP TABLE IF EXISTS public.bcp_case_links;",
    replace: "DROP TABLE IF EXISTS public.bcp_case_links CASCADE;",
    guard: GUARD,
    expect: "BRIDGE-ROLLBACK",
  },
  {
    id: "BRG-NC-ROLLBACK-DROP-ORDER",
    defect: "the rollback drops the parent table before its child",
    file: RB,
    find: "DROP TABLE IF EXISTS public.bcp_case_topics;\nDROP TABLE IF EXISTS public.bcp_case_links;",
    replace:
      "DROP TABLE IF EXISTS public.bcp_case_links;\nDROP TABLE IF EXISTS public.bcp_case_topics;",
    guard: GUARD,
    expect: "BRIDGE-ROLLBACK",
  },
  {
    id: "BRG-NC-ROLLBACK-VOCABULARY-NOT-VERBATIM",
    defect:
      "the restored source vocabulary silently loses a member it had before PR 4, so the rollback leaves the schema different from what it found",
    file: RB,
    find: "    'passport_disclosure'));",
    replace: "    'transcript'));",
    guard: GUARD,
    expect: "BRIDGE-ROLLBACK",
  },

  // ---- Registration: a guard nothing runs is not a guard -------------------
  {
    id: "BRG-NC-SUITE-NOT-RUN",
    defect: "the behaviour suite stops running in the database harness",
    file: DB,
    find: '  -f supabase/tests/bcp_interview_case_bridge_test.sql 2>&1)"',
    replace: "  -c 'SELECT 1' 2>&1)\"",
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },
  {
    id: "BRG-NC-SUITE-FLOOR-REMOVED",
    defect:
      "the suite's assertion floor is lowered to nothing, so a suite that silently stopped asserting would pass",
    file: DB,
    find: 'if [ "$BRG_PASSED" -lt 45 ]; then',
    replace: 'if [ "$BRG_PASSED" -lt 0 ]; then',
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },
  {
    id: "BRG-NC-ROLLBACK-PROOF-NOT-REQUIRED",
    defect:
      "the harness stops requiring the rollback's own proof line, so a rollback that quietly did nothing would pass",
    file: DB,
    find: 'echo "$BRG_RB" | grep -q "BESKT_INTERVIEW_CASE_BRIDGE_ROLLBACK ok"',
    replace: "true",
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },
  {
    id: "BRG-NC-CLAIMED-PENDING",
    defect:
      "the applied migration is walked back to pending, so the repository stops recording a hosted apply that really happened",
    file: STATE,
    find: '"file": "20261112090000_bcp_interview_case_bridge.sql",\n      "hostedState": "applied",',
    replace:
      '"file": "20261112090000_bcp_interview_case_bridge.sql",\n      "hostedState": "pending",',
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },
  {
    id: "BRG-NC-APPLIED-WITHOUT-EVIDENCE",
    defect:
      "the applied entry keeps its status but loses the evidence naming the hosted version and project, leaving an owner-level claim about production with nothing behind it",
    file: STATE,
    // Seven entries open their evidence with the same phrase, so the anchor runs
    // on into the clause only this one has -- and it renames the KEY, because
    // merely softening the prose would still leave an evidenceSource behind and
    // the assertion would go on passing.
    find: '"evidenceSource": "Applied to owner production wrygicdfxwjnrugduxnt through the official Supabase GitHub integration when PR #229 merged',
    replace:
      '"evidenceSourceRemoved": "Applied to owner production wrygicdfxwjnrugduxnt through the official Supabase GitHub integration when PR #229 merged',
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },
  {
    id: "BRG-NC-FRONTIER-STALE-PENDING",
    defect:
      "the applied migration is put back on the owner-level frontier list, where a resolved name hides the next genuinely stuck migration behind an expectation",
    file: FRONTIER,
    // PR 5A put its own genuinely pending migration in the list, so the anchor
    // is that line rather than an empty one. The planted defect is unchanged:
    // the APPLIED migration back on the frontier.
    find: "const expectedPending: string[] = [];",
    replace:
      'const expectedPending: string[] = [\n  "20261112090000_bcp_interview_case_bridge.sql",\n];',
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },
  {
    id: "BRG-NC-CONTROLS-NOT-IN-ALL",
    defect: "these very controls are dropped from negative-controls:all",
    file: PKG,
    find: "bun run negative-controls:beskt-interview-case-bridge && ",
    replace: "",
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },
  {
    id: "BRG-NC-GUARD-NOT-IN-CI",
    defect: "the guard stops running in CI",
    file: CI,
    find: "        run: bun run beskt-interview-case-bridge:check",
    replace: "        run: true",
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },
  {
    id: "BRG-NC-GUARD-NOT-TYPECHECKED",
    defect:
      "the guard leaves the typecheck net, which is how a guard silently stops enforcing without an error",
    file: TSCONFIG,
    find: '    "scripts/beskt-interview-case-bridge-check.ts",\n',
    replace: "",
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },

  {
    id: "BRG-NC-DOCUMENTED-UNWIND-ORDER",
    defect:
      "the documented full-unwind procedure drops PR 3's tables before the bridge that points into them, so the published procedure would fail on a foreign key",
    file: RB_SUITE,
    find: "DROP TABLE IF EXISTS public.bcp_case_topics;\nDROP TABLE IF EXISTS public.bcp_case_links;",
    replace: "-- moved after PR 3",
    guard: GUARD,
    expect: "BRIDGE-REGISTRATION",
  },

  // ---- The suite proves rather than reports -------------------------------
  {
    id: "BRG-NC-SUITE-PLANTS-ITS-OWN-SOURCE",
    defect:
      "the suite plants the bridge's own source row by hand, so the assertion that the RPC registers one proves nothing",
    file: SUITE,
    find: "-- L2 -- Every WRONG case is refused, before the right one is accepted.",
    replace:
      "-- planted\nINSERT INTO public.scp_interview_case_sources (case_id, source_kind, label)\n  SELECT case_a, 'beskt_preparation', 'planted' FROM lk;\n-- L2 -- Every WRONG case is refused, before the right one is accepted.",
    guard: GUARD,
    expect: "BRIDGE-SUITE",
  },
  {
    id: "BRG-NC-SUITE-SEEDS-THE-DATABASE",
    defect:
      "the suite stops rolling its transaction back, so every run leaves synthetic recruitment data behind",
    file: SUITE,
    find: "\nROLLBACK;",
    replace: "\nCOMMIT;",
    guard: GUARD,
    expect: "BRIDGE-SUITE",
  },
];

runControls("beskt-interview-case-bridge", MUTATIONS);
