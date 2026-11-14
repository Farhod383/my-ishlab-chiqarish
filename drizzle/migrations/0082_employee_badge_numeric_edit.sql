CREATE OR REPLACE FUNCTION public.set_employee_badge(_employee_id uuid, _code text, _expected_code text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE old_code text; new_code text; BEGIN
 IF NOT public.can_manage_employee_badges() THEN RAISE EXCEPTION 'Faqat Admin 2'; END IF;
 new_code:=public.normalize_employee_badge(_code);
 IF new_code IS NULL OR new_code !~ '^MCT[0-9]{1,61}$' THEN RAISE EXCEPTION 'MCT dan keyin faqat 0–9 raqamlar bo‘lishi kerak (1–61 raqam)'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('employee-badge-claims',0));
 SELECT badge_code INTO old_code FROM public.employees WHERE id=_employee_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Xodim topilmadi'; END IF;
 IF old_code IS DISTINCT FROM _expected_code THEN RAISE EXCEPTION 'Kod boshqa oynada o‘zgargan. Yangilang'; END IF;
 UPDATE public.employees SET badge_code=new_code WHERE id=_employee_id RETURNING badge_code INTO new_code; RETURN new_code;
END $$;
REVOKE ALL ON FUNCTION public.set_employee_badge(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_employee_badge(uuid,text,text) TO authenticated,service_role;