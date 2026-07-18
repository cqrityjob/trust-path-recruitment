-- Phase 2 final closure: rewrite two career-transition rationales that
-- implied a personal background for the user and used unsupported
-- "natural career path" wording. Neutral, role-level phrasing only.
UPDATE public.cig_career_transitions
SET rationale_sv = 'En möjlig fortsatt riktning mot en ledande säkerhetsroll.',
    rationale_en = 'A possible continued direction toward a security leadership role.'
WHERE rationale_sv = 'Naturlig karriärväg mot ledande säkerhetsroll.';

UPDATE public.cig_career_transitions
SET rationale_sv = 'Övergång från teknisk säkerhet till samordningsroll.',
    rationale_en = 'Transition from a technical security role into coordination.'
WHERE rationale_sv = 'Teknisk säkerhetsbakgrund ger grund för samordning.';