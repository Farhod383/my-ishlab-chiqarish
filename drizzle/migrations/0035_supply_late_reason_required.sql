CREATE OR REPLACE FUNCTION public.enforce_supply_late_reason()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'fulfilled' AND COALESCE(OLD.status,'') <> 'fulfilled'
     AND NEW.required_date IS NOT NULL
     AND NEW.required_date < (now() AT TIME ZONE 'Asia/Tashkent')::date
     AND length(trim(COALESCE(NEW.late_reason,''))) = 0 THEN
    RAISE EXCEPTION 'Muddati o''tgan buyurtma uchun izoh (kechikish sababi) majburiy';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_supply_late_reason ON public.order_supply_requests;
CREATE TRIGGER trg_enforce_supply_late_reason BEFORE UPDATE ON public.order_supply_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_supply_late_reason();