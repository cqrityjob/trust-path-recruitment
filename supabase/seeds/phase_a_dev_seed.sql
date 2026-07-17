-- ============================================================================
-- DEVELOPMENT SEED ONLY. DO NOT APPLY IN PRODUCTION.
-- ============================================================================
--
-- Fictional employers and jobs for local development and preview databases.
-- Every row is clearly marked with "(demo)" or "[TEST DATA]" so it cannot be
-- confused with real content.
--
-- This file is NOT part of the migration pipeline. It is applied manually,
-- exactly once per dev database, by running:
--
--   psql "$SUPABASE_DB_URL" -f supabase/seeds/phase_a_dev_seed.sql
--
-- The file is idempotent: it uses ON CONFLICT DO NOTHING on natural keys.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Employers (5 fictional companies, all marked "(demo)")
-- ---------------------------------------------------------------------------
INSERT INTO public.employers (slug, name, logo_url, website, country, description_sv, description_en) VALUES
  ('nordic-guarding-demo',
   'Nordic Guarding AB (demo)',
   NULL, 'https://example.com/nordic-guarding', 'SE',
   '[TEST DATA] Fiktivt bevakningsföretag för utveckling.',
   '[TEST DATA] Fictional guarding company used for development.'),
  ('aurora-corporate-security-demo',
   'Aurora Corporate Security (demo)',
   NULL, 'https://example.com/aurora-corporate', 'SE',
   '[TEST DATA] Fiktivt företag för säkerhetsledning.',
   '[TEST DATA] Fictional corporate-security firm.'),
  ('fjord-cyber-sentinel-demo',
   'Fjord Cyber Sentinel (demo)',
   NULL, 'https://example.com/fjord-cyber', 'SE',
   '[TEST DATA] Fiktivt cybersäkerhetsbolag.',
   '[TEST DATA] Fictional cybersecurity provider.'),
  ('sentinel-public-safety-demo',
   'Sentinel Public Safety (demo)',
   NULL, 'https://example.com/sentinel-public', 'SE',
   '[TEST DATA] Fiktiv myndighet för utveckling.',
   '[TEST DATA] Fictional public-safety authority.'),
  ('karnkraft-skyddscentrum-demo',
   'Kärnkraft Skyddscentrum (demo)',
   NULL, 'https://example.com/karnkraft-skydd', 'SE',
   '[TEST DATA] Fiktivt centrum för fysisk och teknisk säkerhet.',
   '[TEST DATA] Fictional physical/technical security centre.')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Jobs (8 fictional postings, all prefixed "[TEST DATA]")
-- profession_slug values are real published slugs from cig_professions.
-- family_id values use the canonical 13-family code whitelist.
-- ---------------------------------------------------------------------------
WITH src AS (
  SELECT id FROM public.job_import_sources WHERE name = 'manual'
), e AS (
  SELECT slug, id FROM public.employers WHERE slug LIKE '%-demo'
)
INSERT INTO public.jobs (
  slug, short_id, source_id, employer_id,
  profession_slug, family_id,
  title_sv, title_en, description_sv, description_en,
  location_text, country, city, workplace_type, employment_type, experience_level,
  regulated, application_method, application_url,
  status, published_at, deadline_at
)
SELECT * FROM (VALUES
  ('nordic-guarding-demo-vaktare-stockholm-demo0001','DEMO0001',
   (SELECT id FROM src), (SELECT id FROM e WHERE slug='nordic-guarding-demo'),
   'vaktare','guarding',
   '[TEST DATA] Väktare — Stockholm','[TEST DATA] Security Officer — Stockholm',
   '[TEST DATA] Fiktiv annons för väktartjänst.','[TEST DATA] Fictional listing for a security-officer role.',
   'Stockholm, Sverige','SE','Stockholm','onsite','full_time','entry',
   true,'external','https://example.com/apply/1',
   'published', now() - interval '3 days', now() + interval '27 days'),

  ('aurora-corporate-security-demo-sakerhetschef-goteborg-demo0002','DEMO0002',
   (SELECT id FROM src), (SELECT id FROM e WHERE slug='aurora-corporate-security-demo'),
   'sakerhetschef','corporate',
   '[TEST DATA] Säkerhetschef — Göteborg','[TEST DATA] Head of Security — Gothenburg',
   '[TEST DATA] Fiktiv annons för säkerhetschef.','[TEST DATA] Fictional listing for a head-of-security role.',
   'Göteborg, Sverige','SE','Göteborg','hybrid','full_time','senior',
   false,'external','https://example.com/apply/2',
   'published', now() - interval '5 days', now() + interval '25 days'),

  ('fjord-cyber-sentinel-demo-soc-analytiker-malmo-demo0003','DEMO0003',
   (SELECT id FROM src), (SELECT id FROM e WHERE slug='fjord-cyber-sentinel-demo'),
   'soc-analytiker','cyber_infosec',
   '[TEST DATA] SOC-analytiker — Malmö','[TEST DATA] SOC Analyst — Malmö',
   '[TEST DATA] Fiktiv annons för SOC-analytiker.','[TEST DATA] Fictional SOC-analyst listing.',
   'Malmö, Sverige','SE','Malmö','remote','full_time','mid',
   false,'external','https://example.com/apply/3',
   'published', now() - interval '1 day', now() + interval '30 days'),

  ('sentinel-public-safety-demo-polis-uppsala-demo0004','DEMO0004',
   (SELECT id FROM src), (SELECT id FROM e WHERE slug='sentinel-public-safety-demo'),
   'polis','police_public',
   '[TEST DATA] Polisassistent — Uppsala','[TEST DATA] Police Assistant — Uppsala',
   '[TEST DATA] Fiktiv annons för polistjänst.','[TEST DATA] Fictional police-role listing.',
   'Uppsala, Sverige','SE','Uppsala','onsite','full_time','entry',
   true,'external','https://example.com/apply/4',
   'published', now() - interval '7 days', now() + interval '21 days'),

  ('karnkraft-skyddscentrum-demo-sakerhetstekniker-linkoping-demo0005','DEMO0005',
   (SELECT id FROM src), (SELECT id FROM e WHERE slug='karnkraft-skyddscentrum-demo'),
   'sakerhetstekniker','physical_technical',
   '[TEST DATA] Säkerhetstekniker — Linköping','[TEST DATA] Security Technician — Linköping',
   '[TEST DATA] Fiktiv annons för säkerhetstekniker.','[TEST DATA] Fictional security-technician listing.',
   'Linköping, Sverige','SE','Linköping','onsite','full_time','mid',
   false,'email',NULL,
   'published', now() - interval '2 days', now() + interval '28 days'),

  ('nordic-guarding-demo-skyddsvakt-stockholm-demo0006','DEMO0006',
   (SELECT id FROM src), (SELECT id FROM e WHERE slug='nordic-guarding-demo'),
   'skyddsvakt','defence_protective',
   '[TEST DATA] Skyddsvakt — Stockholm','[TEST DATA] Protective Guard — Stockholm',
   '[TEST DATA] Fiktiv annons för skyddsvakt.','[TEST DATA] Fictional protective-guard listing.',
   'Stockholm, Sverige','SE','Stockholm','onsite','part_time','entry',
   true,'external','https://example.com/apply/6',
   'published', now() - interval '4 days', NULL),

  ('sentinel-public-safety-demo-ordningsvakt-stockholm-demo0007','DEMO0007',
   (SELECT id FROM src), (SELECT id FROM e WHERE slug='sentinel-public-safety-demo'),
   'ordningsvakt','police_public',
   '[TEST DATA] Ordningsvakt — Stockholm','[TEST DATA] Public-Order Guard — Stockholm',
   '[TEST DATA] Fiktiv annons för ordningsvakt.','[TEST DATA] Fictional public-order-guard listing.',
   'Stockholm, Sverige','SE','Stockholm','onsite','full_time','entry',
   true,'external','https://example.com/apply/7',
   'published', now() - interval '6 days', now() + interval '24 days'),

  ('aurora-corporate-security-demo-livvakt-stockholm-demo0008','DEMO0008',
   (SELECT id FROM src), (SELECT id FROM e WHERE slug='aurora-corporate-security-demo'),
   'livvakt','defence_protective',
   '[TEST DATA] Livvakt — Stockholm','[TEST DATA] Close-Protection Officer — Stockholm',
   '[TEST DATA] Fiktiv annons för livvakt.','[TEST DATA] Fictional close-protection listing.',
   'Stockholm, Sverige','SE','Stockholm','onsite','full_time','senior',
   true,'external','https://example.com/apply/8',
   'published', now() - interval '10 days', now() + interval '20 days')
) AS v(slug, short_id, source_id, employer_id, profession_slug, family_id,
       title_sv, title_en, description_sv, description_en,
       location_text, country, city, workplace_type, employment_type, experience_level,
       regulated, application_method, application_url,
       status, published_at, deadline_at)
-- Fill in the application_email for the row that uses application_method='email'
-- and let ON CONFLICT skip re-inserts.
ON CONFLICT (slug) DO NOTHING;

-- Post-fill: give the 'email' seed row a valid application_email so the
-- publication trigger accepts it. (The VALUES list above cannot vary column
-- shape row-by-row.)
UPDATE public.jobs
   SET application_email = 'demo-apply@example.com'
 WHERE slug = 'karnkraft-skyddscentrum-demo-sakerhetstekniker-linkoping-demo0005'
   AND application_email IS NULL;

COMMIT;

-- ============================================================================
-- End of dev seed. Do not append production data below this line.
-- ============================================================================