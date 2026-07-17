
-- =====================================================================
-- Epic 1: Career Intelligence Graph — Lifecycle, Quality, Versioning
-- =====================================================================
-- Governance-only. No user-visible behaviour changes. Enforcement is
-- gated by a settings row (default OFF) so this migration is safe to
-- apply in production without disturbing current results.
-- =====================================================================

-- 1. Extend content_status enum with lifecycle states from doc §14 -----
ALTER TYPE public.cig_content_status ADD VALUE IF NOT EXISTS 'researched'          BEFORE 'published';
ALTER TYPE public.cig_content_status ADD VALUE IF NOT EXISTS 'awaiting_human_review' BEFORE 'published';
ALTER TYPE public.cig_content_status ADD VALUE IF NOT EXISTS 'reviewed'            BEFORE 'published';

-- 2. graph_versions ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.graph_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version      text NOT NULL UNIQUE,
  notes        text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  is_active    boolean NOT NULL DEFAULT false
);

-- Only one active version at a time.
CREATE UNIQUE INDEX IF NOT EXISTS graph_versions_only_one_active
  ON public.graph_versions ((is_active)) WHERE is_active;

GRANT SELECT ON public.graph_versions TO anon, authenticated;
GRANT ALL    ON public.graph_versions TO service_role;

ALTER TABLE public.graph_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "graph_versions read all"
  ON public.graph_versions FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "graph_versions admin write"
  ON public.graph_versions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Immutability: block UPDATE/DELETE (governance archive).
CREATE OR REPLACE FUNCTION public.graph_versions_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Allow only setting/clearing is_active + published_at (activation moves).
    IF NEW.id           IS DISTINCT FROM OLD.id
    OR NEW.version      IS DISTINCT FROM OLD.version
    OR NEW.notes        IS DISTINCT FROM OLD.notes
    OR NEW.created_by   IS DISTINCT FROM OLD.created_by
    OR NEW.created_at   IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'graph_versions rows are immutable except is_active/published_at'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'graph_versions rows cannot be deleted (governance archive)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER graph_versions_immutable_tg
  BEFORE UPDATE OR DELETE ON public.graph_versions
  FOR EACH ROW EXECUTE FUNCTION public.graph_versions_immutable();

-- Seed the currently-active graph version, matching cig_professions data.
INSERT INTO public.graph_versions (version, notes, is_active, published_at)
VALUES (
  'cig-2026.07-09C.1',
  'Initial governance record for the graph version currently backing all published professions. Created by Epic 1 migration.',
  true,
  now()
)
ON CONFLICT (version) DO NOTHING;

-- 3. cig_profession_reviews -------------------------------------------
CREATE TABLE IF NOT EXISTS public.cig_profession_reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id      uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  reviewer_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_label     text NOT NULL,          -- durable, survives user deletion
  review_date        timestamptz NOT NULL DEFAULT now(),
  review_scope       text NOT NULL,          -- e.g. 'full', 'requirements', 'competencies'
  review_notes       text,
  source_reference   text,
  next_review_due    timestamptz,
  graph_version      text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cig_profession_reviews_by_profession
  ON public.cig_profession_reviews (profession_id, review_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cig_profession_reviews TO authenticated;
GRANT ALL ON public.cig_profession_reviews TO service_role;

ALTER TABLE public.cig_profession_reviews ENABLE ROW LEVEL SECURITY;

-- Admin-only. Reviews contain governance/legal notes, not public content.
CREATE POLICY "cig_profession_reviews admin all"
  ON public.cig_profession_reviews FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. cig_governance_settings (single-row enforcement flag) -------------
CREATE TABLE IF NOT EXISTS public.cig_governance_settings (
  id                     boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  lifecycle_enforced     boolean NOT NULL DEFAULT false,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.cig_governance_settings TO authenticated;
GRANT ALL    ON public.cig_governance_settings TO service_role;

ALTER TABLE public.cig_governance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cig_governance_settings read authenticated"
  ON public.cig_governance_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "cig_governance_settings admin write"
  ON public.cig_governance_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.cig_governance_settings (id, lifecycle_enforced)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

-- Helper: is enforcement on?
CREATE OR REPLACE FUNCTION public.cig_lifecycle_enforced()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT lifecycle_enforced FROM public.cig_governance_settings WHERE id = true), false);
$$;

-- 5. cig_professions publication validation trigger --------------------
CREATE OR REPLACE FUNCTION public.cig_professions_validate_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_review_count int;
  v_gv_ok boolean;
BEGIN
  -- Only enforce when the governance flag is on. Off = current behaviour.
  IF NOT public.cig_lifecycle_enforced() THEN
    RETURN NEW;
  END IF;

  IF NEW.content_status = 'published' THEN
    -- Graph version must exist in the governance archive.
    SELECT EXISTS (SELECT 1 FROM public.graph_versions gv WHERE gv.version = NEW.graph_version)
      INTO v_gv_ok;
    IF NOT v_gv_ok THEN
      RAISE EXCEPTION 'Publishing profession % requires graph_version % to exist in graph_versions',
        NEW.slug, NEW.graph_version
        USING ERRCODE = 'check_violation';
    END IF;

    -- At least one review must exist.
    SELECT count(*) INTO v_review_count
      FROM public.cig_profession_reviews r
      WHERE r.profession_id = NEW.id;
    IF v_review_count = 0 THEN
      RAISE EXCEPTION 'Publishing profession % requires at least one review row', NEW.slug
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cig_professions_validate_before_write_tg ON public.cig_professions;
CREATE TRIGGER cig_professions_validate_before_write_tg
  BEFORE INSERT OR UPDATE ON public.cig_professions
  FOR EACH ROW EXECUTE FUNCTION public.cig_professions_validate_before_write();

-- 6. Backfill: synthetic system review for every already-published row.
-- This ensures that when enforcement is later turned on, existing
-- published rows continue to satisfy the "at least one review" rule.
INSERT INTO public.cig_profession_reviews
  (profession_id, reviewer_label, review_scope, review_notes, graph_version)
SELECT
  p.id,
  'system-backfill',
  'epic1-backfill',
  'Auto-generated review for content already published prior to Epic 1 governance rollout.',
  p.graph_version
FROM public.cig_professions p
LEFT JOIN public.cig_profession_reviews r
  ON r.profession_id = p.id
WHERE p.content_status = 'published'
  AND r.id IS NULL;
