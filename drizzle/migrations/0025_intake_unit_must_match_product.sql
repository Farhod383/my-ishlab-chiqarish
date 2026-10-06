CREATE OR REPLACE FUNCTION public.enforce_intake_item_unit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pu text;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id AND NEW.unit IS NOT DISTINCT FROM OLD.unit THEN
    RETURN NEW;
  END IF;
  SELECT unit INTO _pu FROM products WHERE id = NEW.product_id;
  IF _pu IS NOT NULL AND lower(trim(_pu)) <> lower(trim(coalesce(NEW.unit, ''))) THEN
    RAISE EXCEPTION 'O''lchov birligi mos emas: mahsulot "%" birligida yuritiladi, kirim "%" bo''lishi mumkin emas', _pu, NEW.unit;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_intake_item_unit ON public.intake_items;
CREATE TRIGGER trg_enforce_intake_item_unit BEFORE INSERT OR UPDATE OF product_id, unit ON public.intake_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_intake_item_unit();