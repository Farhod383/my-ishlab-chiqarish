ALTER TABLE public.products ADD COLUMN instrument_id uuid REFERENCES public.instruments(id);
COMMENT ON COLUMN public.products.instrument_id IS 'Reclassified instrument link; retain product ID and historical receipts, exclude from ordinary product stock and selectors.';
CREATE OR REPLACE FUNCTION public.route_reclassified_product_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delta numeric; remaining numeric;
BEGIN
 IF OLD.instrument_id IS NOT NULL THEN
  IF NEW.instrument_id IS DISTINCT FROM OLD.instrument_id THEN RAISE EXCEPTION 'Instrument bog‘lanishini o‘zgartirish mumkin emas'; END IF;
  delta := COALESCE(NEW.stock_qty,0)-COALESCE(OLD.stock_qty,0);
  IF delta <> 0 THEN
   UPDATE public.instruments SET quantity=quantity+delta WHERE id=OLD.instrument_id AND quantity+delta>=0 RETURNING quantity INTO remaining;
   IF NOT FOUND THEN RAISE EXCEPTION 'Instrument qoldig‘i yetarli emas'; END IF;
  END IF;
  NEW.stock_qty := 0;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER route_reclassified_product_stock BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.route_reclassified_product_stock();