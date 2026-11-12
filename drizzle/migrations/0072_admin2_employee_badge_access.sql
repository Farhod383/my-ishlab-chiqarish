CREATE OR REPLACE FUNCTION public.can_manage_employee_badges() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid()='e28cdde9-7d09-4a92-a17d-0feb26cc370c'::uuid AND public.has_role(auth.uid(),'admin'); $$;
REVOKE ALL ON FUNCTION public.can_manage_employee_badges() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_employee_badges() TO authenticated,service_role;
CREATE TABLE public.employee_badge_aliases (code text PRIMARY KEY, employee_id uuid NOT NULL REFERENCES public.employees(id), created_at timestamptz NOT NULL DEFAULT now(), created_by uuid);
GRANT SELECT ON public.employee_badge_aliases TO authenticated;
GRANT ALL ON public.employee_badge_aliases TO service_role;
ALTER TABLE public.employee_badge_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY badge_alias_admin2_read ON public.employee_badge_aliases FOR SELECT TO authenticated USING (public.can_manage_employee_badges());
CREATE OR REPLACE FUNCTION public.normalize_employee_badge(_code text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT upper(translate(lower(regexp_replace(coalesce(_code,''),'[[:space:][:cntrl:]]+','','g')),'йцукенгшщзфывапролдячсмить','qwertyuiopasdfghjklzxcvbnm')); $$;
ALTER TABLE public.employees DROP CONSTRAINT employees_badge_code_format;
ALTER TABLE public.employees ADD CONSTRAINT employees_badge_code_format CHECK (badge_code ~ '^MCT[A-Z0-9]{1,61}$');
CREATE OR REPLACE FUNCTION public.employee_badge_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text;
BEGIN
 IF TG_OP='INSERT' THEN NEW.badge_code:='MCT'||lpad(nextval('public.employee_badge_sequence')::text,5,'0'); RETURN NEW; END IF;
 IF NEW.badge_code IS NOT DISTINCT FROM OLD.badge_code THEN RETURN NEW; END IF;
 IF NOT public.can_manage_employee_badges() THEN RAISE EXCEPTION 'Faqat Admin 2 shtrix-kodni o‘zgartira oladi'; END IF;
 NEW.badge_code:=public.normalize_employee_badge(NEW.badge_code);
 IF NEW.badge_code !~ '^MCT[A-Z0-9]{1,61}$' THEN RAISE EXCEPTION 'Xodim kodi MCT bilan boshlanishi kerak (4–64 belgi)'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('employee-badge-claims',0));
 IF EXISTS(SELECT 1 FROM public.employees WHERE badge_code=NEW.badge_code AND id<>NEW.id) OR EXISTS(SELECT 1 FROM public.employee_badge_aliases WHERE code=NEW.badge_code AND employee_id<>NEW.id) THEN RAISE EXCEPTION 'Bu shtrix-kod boshqa xodimga biriktirilgan'; END IF;
 IF OLD.badge_code IS NOT NULL THEN INSERT INTO public.employee_badge_aliases(code,employee_id,created_by) VALUES(OLD.badge_code,OLD.id,auth.uid()) ON CONFLICT(code) DO NOTHING; END IF;
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name,role) VALUES('employee_badge',NEW.id,'Shtrix-kod o‘zgartirildi',jsonb_build_object('badge_code',OLD.badge_code),jsonb_build_object('badge_code',NEW.badge_code),auth.uid(),actor,'admin');
 RETURN NEW;
END $$;
REVOKE SELECT,INSERT,UPDATE ON public.employees FROM anon,authenticated;
GRANT SELECT(id,full_name,position,department,phone,hire_date,leave_date,status,created_at,updated_at,salary,neighborhood,birth_date,passport,address,note,login,password,hikvision_person_id,work_site,shift_id,photo_url) ON public.employees TO anon,authenticated;
GRANT INSERT(id,full_name,position,department,phone,hire_date,leave_date,status,created_at,updated_at,salary,neighborhood,birth_date,passport,address,note,login,password,hikvision_person_id,work_site,shift_id,photo_url), UPDATE(id,full_name,position,department,phone,hire_date,leave_date,status,created_at,updated_at,salary,neighborhood,birth_date,passport,address,note,login,password,hikvision_person_id,work_site,shift_id,photo_url) ON public.employees TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_employee_badges() RETURNS TABLE(id uuid,badge_code text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.can_manage_employee_badges() THEN RAISE EXCEPTION 'Faqat Admin 2'; END IF; RETURN QUERY SELECT e.id,e.badge_code FROM public.employees e ORDER BY e.full_name; END $$;
CREATE OR REPLACE FUNCTION public.set_employee_badge(_employee_id uuid,_code text,_expected_code text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE old_code text; new_code text; BEGIN
 IF NOT public.can_manage_employee_badges() THEN RAISE EXCEPTION 'Faqat Admin 2'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('employee-badge-claims',0));
 SELECT badge_code INTO old_code FROM public.employees WHERE id=_employee_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Xodim topilmadi'; END IF;
 IF old_code IS DISTINCT FROM _expected_code THEN RAISE EXCEPTION 'Kod boshqa oynada o‘zgargan. Yangilang'; END IF;
 UPDATE public.employees SET badge_code=_code WHERE id=_employee_id RETURNING badge_code INTO new_code; RETURN new_code;
END $$;
CREATE OR REPLACE FUNCTION public.resolve_employee_badge(_code text) RETURNS TABLE(id uuid,full_name text,status text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'supply') OR public.has_role(auth.uid(),'chief_accountant')) THEN RAISE EXCEPTION 'Xodimni skanerlashga ruxsat yo‘q'; END IF;
 RETURN QUERY SELECT e.id,e.full_name,e.status FROM public.employees e WHERE e.badge_code=public.normalize_employee_badge(_code) OR EXISTS(SELECT 1 FROM public.employee_badge_aliases a WHERE a.employee_id=e.id AND a.code=public.normalize_employee_badge(_code));
END $$;
REVOKE ALL ON FUNCTION public.get_employee_badges(),public.set_employee_badge(uuid,text,text),public.resolve_employee_badge(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_employee_badges(),public.set_employee_badge(uuid,text,text),public.resolve_employee_badge(text) TO authenticated,service_role;
ALTER POLICY ea_read_all ON public.entity_audit USING(entity IS DISTINCT FROM 'employee_badge' OR public.can_manage_employee_badges());
ALTER POLICY "Warehouse roles read scan history" ON public.scan_history USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'chief_accountant')) AND (kind IS DISTINCT FROM 'employee' OR public.can_manage_employee_badges()));