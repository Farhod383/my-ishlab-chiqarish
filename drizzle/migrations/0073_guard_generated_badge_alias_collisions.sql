CREATE OR REPLACE FUNCTION public.employee_badge_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text;
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('employee-badge-claims',0));
  LOOP
   NEW.badge_code:='MCT'||lpad(nextval('public.employee_badge_sequence')::text,5,'0');
   EXIT WHEN NOT EXISTS(SELECT 1 FROM public.employees WHERE badge_code=NEW.badge_code) AND NOT EXISTS(SELECT 1 FROM public.employee_badge_aliases WHERE code=NEW.badge_code);
  END LOOP;
  RETURN NEW;
 END IF;
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