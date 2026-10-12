ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.instrument_assignments(id);
ALTER TABLE public.instrument_assignments ADD COLUMN IF NOT EXISTS written_off boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.apply_instrument_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.returned_at IS NULL THEN
      UPDATE public.instruments SET quantity = quantity - NEW.quantity WHERE id = NEW.instrument_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- written-off (brak) assignments never touch warehouse stock
    IF NEW.written_off OR OLD.written_off THEN
      RETURN NEW;
    END IF;
    IF OLD.returned_at IS NULL AND NEW.returned_at IS NOT NULL THEN
      UPDATE public.instruments SET quantity = quantity + NEW.quantity WHERE id = NEW.instrument_id;
    ELSIF OLD.returned_at IS NOT NULL AND NEW.returned_at IS NULL THEN
      UPDATE public.instruments SET quantity = quantity - NEW.quantity WHERE id = NEW.instrument_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.returned_at IS NULL AND NOT OLD.written_off THEN
      UPDATE public.instruments SET quantity = quantity + OLD.quantity WHERE id = OLD.instrument_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.apply_instrument_defect() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _avail numeric; _a record;
BEGIN
  -- assignment-based brak: reopen the assignment on delete, no stock effect
  IF TG_OP = 'DELETE' AND OLD.assignment_id IS NOT NULL THEN
    UPDATE instrument_assignments SET returned_at = NULL, written_off = false, return_comment = NULL WHERE id = OLD.assignment_id AND written_off;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignment_id IS NOT NULL THEN
    NEW.assignment_id := OLD.assignment_id; NEW.quantity := OLD.quantity; NEW.instrument_id := OLD.instrument_id; NEW.item_type := OLD.item_type;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.assignment_id IS NOT NULL THEN
    SELECT * INTO _a FROM instrument_assignments WHERE id = NEW.assignment_id FOR UPDATE;
    IF _a.id IS NULL OR _a.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Bu instrument xodimda emas'; END IF;
    NEW.item_type := 'instrument'; NEW.instrument_id := _a.instrument_id; NEW.quantity := _a.quantity; NEW.product_id := NULL;
    NEW.stock_applied := false;
    UPDATE instrument_assignments SET returned_at = now(), written_off = true, returned_by = auth.uid(),
      return_comment = 'Brak: ' || COALESCE(NEW.reason, '') WHERE id = _a.id;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE','DELETE') AND OLD.stock_applied THEN
    IF OLD.item_type = 'instrument' AND OLD.instrument_id IS NOT NULL THEN
      UPDATE instruments SET quantity = quantity + COALESCE(OLD.quantity,0) WHERE id = OLD.instrument_id;
    ELSIF OLD.item_type = 'product' AND OLD.product_id IS NOT NULL THEN
      UPDATE products SET stock_qty = stock_qty + COALESCE(OLD.quantity,0) WHERE id = OLD.product_id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
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