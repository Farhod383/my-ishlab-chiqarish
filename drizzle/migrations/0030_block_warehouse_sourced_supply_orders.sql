CREATE OR REPLACE FUNCTION public.enforce_supply_request_creator() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p record;
BEGIN
  IF NEW.source = 'warehouse' THEN
    RAISE EXCEPTION 'Buyurtma faqat Ta''minot → Yangi buyurtma orqali beriladi.' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    IF public.has_role(auth.uid(), 'supply') AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Ta''minotchi o''ziga buyurtma bera olmaydi.' USING ERRCODE = '42501';
    END IF;
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    SELECT unit INTO _p FROM public.products WHERE id = NEW.product_id;
    IF _p.unit IS NOT NULL THEN NEW.unit := _p.unit; END IF;
  END IF;
  RETURN NEW;
END $$;