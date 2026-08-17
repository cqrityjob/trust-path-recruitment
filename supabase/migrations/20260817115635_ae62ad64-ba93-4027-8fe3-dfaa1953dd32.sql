INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e.id, '0084c766-f80f-4030-ac8c-dba6777b300f'::uuid, 'admin', 'active'
FROM public.employers e
WHERE e.slug = 'h31-test-co-etlqoz'
  AND NOT EXISTS (
    SELECT 1 FROM public.employer_memberships m
    WHERE m.employer_id = e.id AND m.user_id = '0084c766-f80f-4030-ac8c-dba6777b300f'::uuid
  );