
ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS instrument_id uuid;

CREATE OR REPLACE FUNCTION public.apply_instrument_defect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_type = 'instrument' AND NEW.instrument_id IS NOT NULL THEN
      UPDATE public.instruments SET quantity = quantity - COALESCE(NEW.quantity,0) WHERE id = NEW.instrument_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_type = 'instrument' AND OLD.instrument_id IS NOT NULL THEN
      UPDATE public.instruments SET quantity = quantity + COALESCE(OLD.quantity,0) WHERE id = OLD.instrument_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_instrument_defect ON public.defects;
CREATE TRIGGER trg_apply_instrument_defect
AFTER INSERT OR DELETE ON public.defects
FOR EACH ROW EXECUTE FUNCTION public.apply_instrument_defect();
