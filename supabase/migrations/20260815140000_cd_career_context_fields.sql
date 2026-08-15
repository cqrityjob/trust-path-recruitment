-- Master Completion Mandate item 2: minimal current-career context.
--
-- C1 alone ("I already work in security") cannot mean the same baseline for
-- a Väktare, a Security Coordinator and a Security Manager. Add three
-- nullable columns to cd_sessions to capture a LIGHTWEIGHT, optional,
-- post-assessment self-report -- current canonical profession (or "not
-- listed" / "prefer not to say") and a coarse experience band. This is
-- collected AFTER the 26 scored questions and does not change the 26-item
-- count or feed Career DNA scoring in any way -- it is read only by
-- Recommendation Priority / stage interpretation (see professions.ts and
-- the v31-layer4-implementation-state.md architecture notes), never by
-- scoring.ts. All three columns are nullable: the step is skippable and
-- irrelevant for a candidate who is not yet working in security at all
-- (context_status = 'exploring_security').

alter table public.cd_sessions
  add column if not exists current_profession_slug text,
  add column if not exists current_profession_status text,
  add column if not exists current_experience_band text;

alter table public.cd_sessions
  add constraint cd_sessions_current_profession_status_check
    check (current_profession_status is null or current_profession_status in (
      'selected', 'not_listed', 'prefer_not_to_say'
    ));

alter table public.cd_sessions
  add constraint cd_sessions_current_experience_band_check
    check (current_experience_band is null or current_experience_band in (
      'under_1y', '1_3y', '4_7y', '8_plus_y'
    ));

comment on column public.cd_sessions.current_profession_slug is
  'Self-reported current profession (cig_professions.slug), only when current_profession_status = selected. Contextual self-report, never scored.';
comment on column public.cd_sessions.current_profession_status is
  'selected | not_listed | prefer_not_to_say | null (step skipped or not shown).';
comment on column public.cd_sessions.current_experience_band is
  'Coarse self-reported experience band in the current profession. Contextual self-report, never scored.';
