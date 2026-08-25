-- "Annat" is a different answer from "Ej angivet", and the schema has to know it.
--
-- ── WHY BOTH CONCEPTS ───────────────────────────────────────────────────
--
-- The job form's two taxonomy selects offered exactly one non-answer, labelled
-- "Ej angivet". A customer asked for "Annat", and the two are not the same
-- thing:
--
--   Ej angivet   the employer did not say, or does not know
--   Annat        the employer DID say: their role is not in our list
--
-- Collapsing them loses the only signal that tells us the taxonomy is
-- incomplete. Fourteen career families and a fixed profession list will not
-- cover every security role in Sweden, let alone the UK or the UAE, and the
-- employers hitting that edge are precisely the ones worth hearing from. A
-- NULL cannot say "you are missing something"; an explicit Annat can.
--
-- ── WHY THE CANONICAL COLUMNS STAY UNTOUCHED ────────────────────────────
--
-- family_id is checked against assert_cig_family_id() -- fourteen ids -- and
-- profession_slug against cig_professions. Both are exact-match filters on the
-- public job search:
--
--     query.eq("family_id", args.familyId)
--     query.eq("profession_slug", args.professionSlug)
--
-- Writing 'other', or the employer's own words, into either would either fail
-- the trigger or silently pollute a controlled vocabulary that analytics and
-- candidate-facing filters both read. So an Annat job leaves them NULL, which
-- is already the correct answer for a filter: the job genuinely is not in any
-- family we publish, and it should not appear under one.
--
-- ── WHY FOUR COLUMNS AND NOT TWO ────────────────────────────────────────
--
-- Two independent facts per field, and the second is optional:
--
--   did they choose Annat          a decision, always known
--   what do they call it           free text, optional by product decision
--
-- One column cannot carry both without an in-band sentinel -- NULL for "not
-- Annat", empty string for "Annat, said nothing", text for "Annat, said this".
-- Empty-string-as-a-value is the thing that breaks two years later when
-- somebody trims the input. So the decision is a boolean and the words are
-- text, and the CHECKs below make the illegal combinations unrepresentable
-- rather than merely discouraged.
--
-- Additive, forward-only, every column defaulted or NULLable. No existing row
-- changes meaning: family_other defaults false, which is what every current
-- row is. Remediation:
--   ALTER TABLE public.jobs
--     DROP COLUMN family_other, DROP COLUMN family_other_text,
--     DROP COLUMN profession_other, DROP COLUMN profession_other_text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS family_other          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS family_other_text     text,
  ADD COLUMN IF NOT EXISTS profession_other      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profession_other_text text;

COMMENT ON COLUMN public.jobs.family_other IS
  'The employer chose "Annat": their career area is not in the canonical '
  'fourteen. Distinct from family_id IS NULL, which means they did not say. '
  'Never a substitute for a canonical id -- family_id stays NULL.';
COMMENT ON COLUMN public.jobs.family_other_text IS
  'What the employer calls that career area, in their own words. Optional. '
  'Never read by a filter; it is a signal that the taxonomy is incomplete.';
COMMENT ON COLUMN public.jobs.profession_other IS
  'The employer chose "Annat" for the role. Distinct from profession_slug IS '
  'NULL, which means they did not say.';
COMMENT ON COLUMN public.jobs.profession_other_text IS
  'What the employer calls that role, in their own words. Optional.';

-- ---------------------------------------------------------------------------
-- The combinations that must not exist
-- ---------------------------------------------------------------------------

-- Annat and a canonical id are contradictory answers to one question. Allowing
-- both would leave every reader to guess which one wins.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_family_other_excludes_id;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_family_other_excludes_id
  CHECK (NOT family_other OR family_id IS NULL);

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_profession_other_excludes_slug;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_profession_other_excludes_slug
  CHECK (NOT profession_other OR profession_slug IS NULL);

-- Free text without the choice it belongs to is orphaned data: it would sit in
-- the row describing a career area the employer never said was Annat.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_family_other_text_needs_choice;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_family_other_text_needs_choice
  CHECK (family_other_text IS NULL OR family_other);

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_profession_other_text_needs_choice;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_profession_other_text_needs_choice
  CHECK (profession_other_text IS NULL OR profession_other);

-- Bounded, like every other free-text field an employer can type into. Long
-- enough for "Skyddsvakt vid samhällsviktig verksamhet", short enough that it
-- cannot become a description.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_family_other_text_length;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_family_other_text_length
  CHECK (family_other_text IS NULL OR length(family_other_text) <= 120);

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_profession_other_text_length;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_profession_other_text_length
  CHECK (profession_other_text IS NULL OR length(profession_other_text) <= 120);
