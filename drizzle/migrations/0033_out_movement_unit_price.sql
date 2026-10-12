CREATE OR REPLACE FUNCTION public.fill_out_movement_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.direction = 'out' AND COALESCE(NEW.unit_price,0) = 0 AND NEW.product_id IS NOT NULL THEN
    SELECT unit_price, currency INTO r FROM public.stock_movements
     WHERE product_id = NEW.product_id AND direction = 'in' AND unit_price > 0
     ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN NEW.unit_price := r.unit_price; NEW.currency := r.currency; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fill_out_movement_price ON public.stock_movements;
CREATE TRIGGER trg_fill_out_movement_price BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.fill_out_movement_price();