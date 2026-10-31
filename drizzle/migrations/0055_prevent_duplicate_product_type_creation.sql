CREATE OR REPLACE FUNCTION public.prevent_duplicate_product_type() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(public.catalog_name_key(NEW.name)||'|'||coalesce(NEW.unit,''),0));
 IF EXISTS(SELECT 1 FROM public.products p WHERE p.instrument_id IS NULL AND public.catalog_name_key(p.name)=public.catalog_name_key(NEW.name) AND p.unit IS NOT DISTINCT FROM NEW.unit AND p.metal_type IS NOT DISTINCT FROM NEW.metal_type AND p.thickness_mm IS NOT DISTINCT FROM NEW.thickness_mm AND p.width_mm IS NOT DISTINCT FROM NEW.width_mm AND p.length_mm IS NOT DISTINCT FROM NEW.length_mm AND p.weight_kg IS NOT DISTINCT FROM NEW.weight_kg) THEN RAISE EXCEPTION 'Bu mahsulot turi katalogda mavjud. Yangi partiya uchun mavjud mahsulotni tanlang.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_product_type_duplicate_guard BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_product_type();
REVOKE ALL ON FUNCTION public.prevent_duplicate_product_type() FROM PUBLIC,anon,authenticated;