CREATE POLICY "employers_owner_admin_update" ON public.employers
  FOR UPDATE
  TO authenticated
  USING (
    public.has_employer_role(auth.uid(), id, ARRAY['owner', 'admin'])
    AND public.employer_members_can_edit(id)
  )
  WITH CHECK (
    public.has_employer_role(auth.uid(), id, ARRAY['owner', 'admin'])
    AND public.employer_members_can_edit(id)
  );

CREATE OR REPLACE FUNCTION public.employers_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.is_platform_admin(auth.uid()) THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'status is a moderation-owned field and cannot be changed by an employer member'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'slug cannot be changed by an employer member'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER employers_validate_before_write_trigger
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.employers_validate_before_write();