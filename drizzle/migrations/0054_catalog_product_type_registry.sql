CREATE TABLE public.product_types (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), barcode text NOT NULL UNIQUE, name text NOT NULL, unit text, technical jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.product_types TO authenticated; GRANT ALL ON public.product_types TO service_role;
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_types_read ON public.product_types FOR SELECT TO authenticated USING(public.has_any_role(auth.uid()));
ALTER TABLE public.products ADD COLUMN product_type_id uuid REFERENCES public.product_types(id);
ALTER TABLE public.instruments ADD COLUMN product_type_id uuid REFERENCES public.product_types(id);
INSERT INTO public.product_types(id,barcode,name,unit,technical) SELECT id,barcode,name,unit,jsonb_build_object('metal_type',metal_type,'thickness_mm',thickness_mm,'width_mm',width_mm,'length_mm',length_mm,'weight_kg',weight_kg) FROM public.products WHERE instrument_id IS NULL;
INSERT INTO public.product_types(id,barcode,name,unit,technical) SELECT id,barcode,name,'dona',jsonb_build_object('category',category,'inventory_number',inventory_number) FROM public.instruments;
UPDATE public.products SET product_type_id=coalesce(instrument_id,id);
UPDATE public.instruments SET product_type_id=id;
CREATE TABLE public.product_type_barcode_aliases (barcode text PRIMARY KEY, product_type_id uuid NOT NULL REFERENCES public.product_types(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.product_type_barcode_aliases TO authenticated; GRANT ALL ON public.product_type_barcode_aliases TO service_role;
ALTER TABLE public.product_type_barcode_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_type_aliases_read ON public.product_type_barcode_aliases FOR SELECT TO authenticated USING(public.has_any_role(auth.uid()));
INSERT INTO public.product_type_barcode_aliases(barcode,product_type_id,reason) SELECT barcode,product_type_id,'Historical reclassified product barcode' FROM public.products WHERE instrument_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.catalog_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.name IS DISTINCT FROM OLD.name AND coalesce(btrim(OLD.name),'')<>'' AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(NEW.old_names,'{}')) n WHERE lower(btrim(n))=lower(btrim(OLD.name))) THEN NEW.old_names:=coalesce(NEW.old_names,'{}')||btrim(OLD.name); END IF;
  IF OLD.barcode IS NOT NULL AND NEW.barcode IS DISTINCT FROM OLD.barcode THEN RAISE EXCEPTION 'Mahsulot shtrix-kodini o‘zgartirish mumkin emas'; END IF;
  IF NEW.product_type_id IS DISTINCT FROM OLD.product_type_id THEN RAISE EXCEPTION 'Mahsulot turi identifikatorini o‘zgartirish mumkin emas'; END IF;
 ELSE
  IF NEW.product_type_id IS NOT NULL THEN RAISE EXCEPTION 'Yangi partiya uchun mavjud katalog mahsulotini tanlang'; END IF;
  NEW.product_type_id:=NEW.id;
  NEW.barcode:='ERP'||lpad(nextval('public.catalog_barcode_seq')::text,9,'0');
  INSERT INTO public.product_types(id,barcode,name,unit,technical) VALUES(NEW.product_type_id,NEW.barcode,NEW.name,CASE WHEN TG_TABLE_NAME='products' THEN to_jsonb(NEW)->>'unit' ELSE 'dona' END,jsonb_build_object('metal_type',to_jsonb(NEW)->'metal_type','thickness_mm',to_jsonb(NEW)->'thickness_mm','width_mm',to_jsonb(NEW)->'width_mm','length_mm',to_jsonb(NEW)->'length_mm','weight_kg',to_jsonb(NEW)->'weight_kg','category',to_jsonb(NEW)->'category','inventory_number',to_jsonb(NEW)->'inventory_number'));
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.catalog_type_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='products' AND to_jsonb(NEW)->>'instrument_id' IS NOT NULL THEN RETURN NEW; END IF;
 UPDATE public.product_types SET name=NEW.name,unit=CASE WHEN TG_TABLE_NAME='products' THEN to_jsonb(NEW)->>'unit' ELSE 'dona' END,technical=jsonb_build_object('metal_type',to_jsonb(NEW)->'metal_type','thickness_mm',to_jsonb(NEW)->'thickness_mm','width_mm',to_jsonb(NEW)->'width_mm','length_mm',to_jsonb(NEW)->'length_mm','weight_kg',to_jsonb(NEW)->'weight_kg','category',to_jsonb(NEW)->'category','inventory_number',to_jsonb(NEW)->'inventory_number') WHERE id=NEW.product_type_id;
 RETURN NEW;
END $$;
CREATE TRIGGER product_type_sync AFTER UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.catalog_type_sync();
CREATE TRIGGER instrument_type_sync AFTER UPDATE ON public.instruments FOR EACH ROW EXECUTE FUNCTION public.catalog_type_sync();
CREATE OR REPLACE FUNCTION public.resolve_catalog_scan(_code text) RETURNS SETOF public.products LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT DISTINCT ON(p.product_type_id) p.* FROM public.products p JOIN public.product_types t ON t.id=p.product_type_id WHERE p.instrument_id IS NULL AND (t.barcode=btrim(_code) OR EXISTS(SELECT 1 FROM public.product_type_barcode_aliases a WHERE a.product_type_id=t.id AND a.barcode=btrim(_code))) ORDER BY p.product_type_id,p.created_at,p.id $$;
REVOKE ALL ON FUNCTION public.catalog_type_sync() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolve_catalog_scan(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.resolve_catalog_scan(text) TO authenticated;
COMMENT ON COLUMN public.products.barcode IS 'Persistent legacy-compatible barcode; canonical uniqueness resides in product_types. Reclassified product codes are retained as aliases.';
COMMENT ON COLUMN public.products.product_type_id IS 'Permanent catalog type identity. Movement and intake product_id joins retain this identity without changing historical IDs.';