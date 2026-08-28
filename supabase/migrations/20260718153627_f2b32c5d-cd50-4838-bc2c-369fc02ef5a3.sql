CREATE TABLE public.security_career_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_version TEXT NOT NULL DEFAULT 'scp-v1',
  current_status TEXT CHECK (current_status IN (
    'new_to_industry',
    'student',
    'working_in_industry',
    'career_change',
    'changing_role',
    'other'
  )),
  current_profession_slug TEXT
    REFERENCES public.cig_professions(slug)
    ON DELETE SET NULL,
  current_profession_other TEXT CHECK (
    current_profession_other IS NULL
    OR char_length(current_profession_other) <= 120
  ),
  years_of_experience TEXT CHECK (
    years_of_experience IN ('<1','1-3','3-5','5-10','10+')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    current_profession_slug IS NULL
    OR current_profession_other IS NULL
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_career_profiles TO authenticated;
GRANT ALL ON public.security_career_profiles TO service_role;

ALTER TABLE public.security_career_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own scp select"
ON public.security_career_profiles
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "own scp insert"
ON public.security_career_profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own scp update"
ON public.security_career_profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own scp delete"
ON public.security_career_profiles
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER set_security_career_profiles_updated_at
BEFORE UPDATE ON public.security_career_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.assessment_runs
ADD COLUMN IF NOT EXISTS profile_snapshot JSONB;