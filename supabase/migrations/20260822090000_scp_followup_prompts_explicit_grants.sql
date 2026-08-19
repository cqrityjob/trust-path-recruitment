-- Restore the privilege state that the canonical report-payload migration
-- left implicit.
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────
--
-- 20260820100000_scp_report_audience_payloads.sql creates
-- public.scp_followup_prompts with RLS enabled and two policies, but issues
-- no GRANT at all. On a clean replay the table therefore ends up with no
-- privileges for `authenticated`, and the author-write policy governs a
-- privilege nobody holds -- the policy is unreachable rather than restrictive.
--
-- Lovable's re-issue of that migration (20260818194409_d794b35e-…, removed
-- from the repository by the canonical-baseline repair) DID carry three
-- explicit GRANT statements. Comparing the two files with comments stripped,
-- those three lines were the only semantic difference between them, so the
-- hosted database has privileges that the canonical file cannot reproduce.
--
-- Deleting the re-issue without restating its grants would have silently
-- changed the intended schema. This migration restates them, so canonical
-- replay and hosted production describe the same privilege state.
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────
--
-- Not a widening. RLS is already enabled on the table and both policies are
-- unchanged: reads stay `USING (true)` for authenticated, writes stay
-- restricted to public.scp_can_author(auth.uid()). A table privilege without
-- a matching policy grants nothing.
--
-- The `anon` position is deliberately NOT set here -- it is a trust decision
-- rather than a replay-parity fact, and it is made explicitly in
-- 20260822091000_trust_findings_least_privilege.sql.
--
-- Idempotent and forward-only. Remediation: REVOKE the three grants.

DO $$
BEGIN
  IF to_regclass('public.scp_followup_prompts') IS NULL THEN
    RAISE EXCEPTION
      'scp_followup_prompts is absent; 20260820100000 must run before this migration';
  END IF;
END $$;

GRANT SELECT                   ON public.scp_followup_prompts TO authenticated;
GRANT INSERT, UPDATE, DELETE   ON public.scp_followup_prompts TO authenticated;
GRANT ALL                      ON public.scp_followup_prompts TO service_role;
