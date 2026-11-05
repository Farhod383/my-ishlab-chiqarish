BEGIN;
DO $$
DECLARE eid uuid; code text; previous text; rejected boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE badge_code IS NULL OR badge_code !~ '^MCT[0-9]{5}$') THEN RAISE EXCEPTION 'Invalid existing badge'; END IF;
  IF (SELECT count(*) FROM public.employees) <> (SELECT count(DISTINCT badge_code) FROM public.employees) THEN RAISE EXCEPTION 'Duplicate badge'; END IF;
  INSERT INTO public.employees(full_name,position,department,hire_date) VALUES ('Badge rollback check '||gen_random_uuid(),'Test','Test',CURRENT_DATE) RETURNING id,badge_code INTO eid,code;
  IF code IS NULL OR code !~ '^MCT[0-9]{5}$' THEN RAISE EXCEPTION 'New employee missing badge'; END IF;
  UPDATE public.employees SET position='Changed' WHERE id=eid RETURNING badge_code INTO previous;
  IF previous <> code THEN RAISE EXCEPTION 'Ordinary edit changed badge'; END IF;
  BEGIN
    UPDATE public.employees SET badge_code='MCT99999' WHERE id=eid;
  EXCEPTION WHEN OTHERS THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Badge edit allowed'; END IF;
END $$;
ROLLBACK;