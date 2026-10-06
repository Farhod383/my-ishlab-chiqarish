CREATE OR REPLACE FUNCTION public.employee_name_key(_n text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(regexp_replace(btrim(coalesce(_n,'')), '\s+', ' ', 'g'))
$$;

CREATE INDEX IF NOT EXISTS employees_name_key_idx ON public.employees (public.employee_name_key(full_name));

CREATE OR REPLACE FUNCTION public.enforce_unique_employee_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.full_name := regexp_replace(btrim(NEW.full_name), '\s+', ' ', 'g');
  IF TG_OP = 'UPDATE' AND public.employee_name_key(NEW.full_name) = public.employee_name_key(OLD.full_name) THEN
    RETURN NEW; -- existing historical duplicates may still be edited
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('employee_name:' || public.employee_name_key(NEW.full_name)));
  IF EXISTS (SELECT 1 FROM public.employees e
             WHERE public.employee_name_key(e.full_name) = public.employee_name_key(NEW.full_name)
               AND e.id <> NEW.id) THEN
    RAISE EXCEPTION 'Bu ism va familiyadagi xodim allaqachon ro''yxatda mavjud.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_employees_unique_name ON public.employees;
CREATE TRIGGER trg_employees_unique_name BEFORE INSERT OR UPDATE OF full_name ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_employee_name();