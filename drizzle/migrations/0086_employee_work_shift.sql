ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS work_shift smallint;
ALTER TABLE public.employees ADD CONSTRAINT employees_work_shift_check CHECK (work_shift IS NULL OR work_shift BETWEEN 1 AND 3);
GRANT SELECT (work_shift) ON public.employees TO authenticated;
CREATE OR REPLACE FUNCTION public.set_employee_work_shift(_employee_id uuid, _shift smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old smallint; _name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Faqat Admin smenani o''zgartira oladi'; END IF;
  IF _shift IS NOT NULL AND (_shift < 1 OR _shift > 3) THEN RAISE EXCEPTION 'Smena 1, 2 yoki 3 bo''lishi kerak'; END IF;
  SELECT work_shift, full_name INTO _old, _name FROM public.employees WHERE id = _employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Xodim topilmadi'; END IF;
  IF _old IS NOT DISTINCT FROM _shift THEN RETURN; END IF;
  UPDATE public.employees SET work_shift = _shift WHERE id = _employee_id;
  INSERT INTO public.audit_log(actor_id, action, entity, details)
  VALUES (auth.uid(), 'employee.work_shift', 'employee', _name || ': ' || coalesce(_old::text,'—') || ' → ' || coalesce(_shift::text,'—'));
END $$;
REVOKE ALL ON FUNCTION public.set_employee_work_shift(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_work_shift(uuid, smallint) TO authenticated;