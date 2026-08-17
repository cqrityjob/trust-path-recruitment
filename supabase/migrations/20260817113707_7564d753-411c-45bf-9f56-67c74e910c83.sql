DO $$
DECLARE
  v_employer uuid;
  v_admin uuid := '51749208-75e7-4e0b-a107-d2fbbd235173';
BEGIN
  SELECT id INTO v_employer FROM public.employers WHERE slug = 'h31-test-co-etlqoz';
  IF v_employer IS NULL OR EXISTS (SELECT 1 FROM public.jobs WHERE short_id = 'PILOT001') THEN
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);

  INSERT INTO public.jobs (
    slug, short_id, employer_id, profession_slug, family_id,
    title_sv, title_en, description_sv, description_en,
    responsibilities, requirements,
    location_text, country, region, city,
    workplace_type, employment_type, experience_level,
    language_requirements, shift_work, night_work,
    driving_licence_required, security_vetting_mentioned,
    application_method, status, published_at, expires_at, source_type
  ) VALUES (
    'sakerhet-ab-vaktare-stockholm-pilot001', 'PILOT001', v_employer, 'vaktare', 'protective_operations',
    'Väktare — Stockholm (pilotannons)',
    'Security Officer — Stockholm (pilot listing)',
    'Pilotannons för CQrityjobs stängda pilot. Som väktare arbetar du med bevakning av kunders lokaler, ronderande tillsyn och incidenthantering i Stockholmsområdet. Annonsen är testdata och avser ingen verklig anställning.',
    'Pilot listing for the CQrityjob closed pilot. As a security officer you carry out site protection, patrol rounds and incident handling in the Stockholm area. This listing is test data and does not represent a real vacancy.',
    '["Ronderande bevakning","Incidenthantering och rapportering","Kundkontakt på plats"]'::jsonb,
    '["Godkänd väktarutbildning (BYA GK1)","B-körkort","Svenska och engelska i tal och skrift"]'::jsonb,
    'Stockholm', 'SE', 'Stockholms län', 'Stockholm',
    'onsite', 'full_time', 'entry',
    ARRAY['sv','en'], true, true,
    true, true,
    'internal', 'published', now() - interval '1 hour', now() + interval '60 days', 'employer_entered'
  );
END $$;