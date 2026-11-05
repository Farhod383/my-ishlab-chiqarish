CREATE SEQUENCE public.employee_badge_sequence MINVALUE 1 MAXVALUE 99999 NO CYCLE;
ALTER TABLE public.employees ADD COLUMN badge_code text;
WITH numbered AS (SELECT id, nextval('public.employee_badge_sequence') AS n FROM public.employees ORDER BY created_at, id) UPDATE public.employees e SET badge_code='MCT'||lpad(n.n::text,5,'0') FROM numbered n WHERE e.id=n.id;
ALTER TABLE public.employees ADD CONSTRAINT employees_badge_code_unique UNIQUE (badge_code);
ALTER TABLE public.employees ADD CONSTRAINT employees_badge_code_format CHECK (badge_code ~ '^MCT[0-9]{5}$');
CREATE FUNCTION public.employee_badge_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF TG_OP='UPDATE' THEN IF NEW.badge_code IS DISTINCT FROM OLD.badge_code THEN RAISE EXCEPTION 'Xodim bejik kodi o‘zgarmaydi'; END IF; ELSE NEW.badge_code := 'MCT'||lpad(nextval('public.employee_badge_sequence')::text,5,'0'); END IF; RETURN NEW; END $$;
CREATE TRIGGER employee_badge_guard BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.employee_badge_guard();
ALTER TABLE public.employees ALTER COLUMN badge_code SET NOT NULL;