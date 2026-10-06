ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false;
UPDATE public.defects SET stock_applied = true WHERE item_type = 'instrument' AND instrument_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_instrument_defect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _avail numeric;
BEGIN
  -- reverse old effect
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.stock_applied THEN
    IF OLD.item_type = 'instrument' AND OLD.instrument_id IS NOT NULL THEN
      UPDATE instruments SET quantity = quantity + COALESCE(OLD.quantity,0) WHERE id = OLD.instrument_id;
    ELSIF OLD.item_type = 'product' AND OLD.product_id IS NOT NULL THEN
      UPDATE products SET stock_qty = stock_qty + COALESCE(OLD.quantity,0) WHERE id = OLD.product_id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  -- legacy product rows edited without stock effect stay as they were
  IF TG_OP = 'UPDATE' AND NOT OLD.stock_applied THEN RETURN NEW; END IF;

  IF COALESCE(NEW.quantity,0) <= 0 THEN RAISE EXCEPTION 'Brak miqdori 0 dan katta bo''lishi kerak'; END IF;
  IF NEW.item_type = 'instrument' AND NEW.instrument_id IS NOT NULL THEN
    SELECT quantity INTO _avail FROM instruments WHERE id = NEW.instrument_id FOR UPDATE;
    IF COALESCE(_avail,0) < NEW.quantity THEN
      RAISE EXCEPTION 'Brak miqdori mavjud qoldiqdan oshib ketishi mumkin emas (mavjud: %)', COALESCE(_avail,0);
    END IF;
    UPDATE instruments SET quantity = quantity - NEW.quantity WHERE id = NEW.instrument_id;
    NEW.stock_applied := true;
  ELSIF NEW.item_type = 'product' AND NEW.product_id IS NOT NULL THEN
    SELECT stock_qty INTO _avail FROM products WHERE id = NEW.product_id FOR UPDATE;
    IF COALESCE(_avail,0) < NEW.quantity THEN
      RAISE EXCEPTION 'Brak miqdori mavjud qoldiqdan oshib ketishi mumkin emas (mavjud: %)', COALESCE(_avail,0);
    END IF;
    UPDATE products SET stock_qty = stock_qty - NEW.quantity WHERE id = NEW.product_id;
    NEW.stock_applied := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_instrument_defect ON public.defects;
CREATE TRIGGER trg_apply_instrument_defect BEFORE INSERT OR UPDATE OF quantity, product_id, instrument_id, item_type OR DELETE ON public.defects
FOR EACH ROW EXECUTE FUNCTION public.apply_instrument_defect();