
CREATE OR REPLACE FUNCTION public.enforce_stage_role_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := public.has_role(uid, 'admin');
  is_otk boolean := public.has_role(uid, 'otk');
  is_manager boolean := public.has_role(uid, 'manager');
  is_marketing boolean := public.has_role(uid, 'marketing');
  qc_changed boolean := (COALESCE(NEW.qc_passed, false) IS DISTINCT FROM COALESCE(OLD.qc_passed, false))
                        OR (COALESCE(NEW.otk_comment, '') IS DISTINCT FROM COALESCE(OLD.otk_comment, ''))
                        OR (NEW.otk_checked_at IS DISTINCT FROM OLD.otk_checked_at);
  prod_changed boolean := (NEW.status IS DISTINCT FROM OLD.status)
                          OR (NEW.started_at IS DISTINCT FROM OLD.started_at)
                          OR (NEW.finished_at IS DISTINCT FROM OLD.finished_at)
                          OR (COALESCE(NEW.worker_name, '') IS DISTINCT FROM COALESCE(OLD.worker_name, ''))
                          OR (NEW.worker_id IS DISTINCT FROM OLD.worker_id);
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF qc_changed AND NOT (is_admin OR is_otk) THEN
    RAISE EXCEPTION 'Faqat OTK yoki Admin sifat nazoratini o''zgartira oladi';
  END IF;
  IF prod_changed AND NOT (is_admin OR is_manager OR is_marketing) THEN
    RAISE EXCEPTION 'Faqat Nachalnik yoki Admin ishlab chiqarish bosqichini o''zgartira oladi';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_stage_role_separation ON public.order_stages;
CREATE TRIGGER trg_enforce_stage_role_separation
BEFORE UPDATE ON public.order_stages
FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_role_separation();
