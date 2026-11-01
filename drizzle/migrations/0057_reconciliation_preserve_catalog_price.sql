CREATE OR REPLACE FUNCTION public.update_product_last_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.reconciliation_key IS NOT NULL THEN RETURN NEW; END IF;
 IF NEW.direction='in' AND NEW.product_id IS NOT NULL AND coalesce(NEW.unit_price,0)>0 THEN UPDATE public.products SET last_price=NEW.unit_price WHERE id=NEW.product_id; END IF;
 RETURN NEW;
END $$;