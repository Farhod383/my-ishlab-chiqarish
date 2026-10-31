ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mxik_code text, ADD COLUMN IF NOT EXISTS old_names text[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.instruments ADD COLUMN IF NOT EXISTS mxik_code text, ADD COLUMN IF NOT EXISTS old_names text[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS barcode text;
CREATE SEQUENCE IF NOT EXISTS public.catalog_barcode_seq;
CREATE OR REPLACE FUNCTION public.catalog_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF TG_OP='UPDATE' THEN
 IF NEW.name IS DISTINCT FROM OLD.name AND coalesce(btrim(OLD.name),'')<>'' AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(NEW.old_names,'{}')) n WHERE lower(btrim(n))=lower(btrim(OLD.name))) THEN NEW.old_names:=coalesce(NEW.old_names,'{}')||btrim(OLD.name); END IF;
 IF OLD.barcode IS NOT NULL AND NEW.barcode IS DISTINCT FROM OLD.barcode THEN RAISE EXCEPTION 'Mahsulot shtrix-kodini o‘zgartirish mumkin emas'; END IF;
END IF;
IF nullif(btrim(NEW.barcode),'') IS NULL THEN NEW.barcode:='ERP'||lpad(nextval('public.catalog_barcode_seq')::text,9,'0'); END IF;
RETURN NEW; END $$;
CREATE TRIGGER catalog_product_identity BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.catalog_identity_guard();
CREATE TRIGGER catalog_instrument_identity BEFORE INSERT OR UPDATE ON public.instruments FOR EACH ROW EXECUTE FUNCTION public.catalog_identity_guard();
UPDATE public.products SET barcode='ERP'||lpad(nextval('public.catalog_barcode_seq')::text,9,'0') WHERE barcode IS NULL;
UPDATE public.instruments SET barcode='ERP'||lpad(nextval('public.catalog_barcode_seq')::text,9,'0') WHERE barcode IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique ON public.products(barcode);
CREATE UNIQUE INDEX IF NOT EXISTS instruments_barcode_unique ON public.instruments(barcode);
CREATE INDEX IF NOT EXISTS products_mxik_idx ON public.products(mxik_code);
CREATE INDEX IF NOT EXISTS products_old_names_gin ON public.products USING gin(old_names);
CREATE TABLE public.catalog_import_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), actor_id uuid, source_key text NOT NULL UNIQUE, results jsonb NOT NULL DEFAULT '[]', summary jsonb NOT NULL DEFAULT '{}');
GRANT SELECT,INSERT ON public.catalog_import_runs TO authenticated; GRANT ALL ON public.catalog_import_runs TO service_role;
ALTER TABLE public.catalog_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_import_read ON public.catalog_import_runs FOR SELECT TO authenticated USING(true);
CREATE POLICY catalog_import_admin_insert ON public.catalog_import_runs FOR INSERT TO authenticated WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.catalog_product_backups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.catalog_import_runs(id), product_id uuid NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.catalog_product_backups TO authenticated; GRANT ALL ON public.catalog_product_backups TO service_role;
ALTER TABLE public.catalog_product_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_backup_admin_read ON public.catalog_product_backups FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.catalog_name_key(_name text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT lower(regexp_replace(btrim(coalesce(_name,'')), '\s+', ' ', 'g')) $$;
CREATE OR REPLACE FUNCTION public.apply_catalog_mapping(_rows jsonb, _source_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE run uuid; r jsonb; old_ids uuid[]; new_ids uuid[]; target uuid; old_n text; new_n text; code text; outcome text; results jsonb:='[]'; renamed int:=0; coded int:=0; pending int:=0; p public.products%ROWTYPE;
BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Faqat Admin'; END IF;
IF _source_key<>'warehouse-mxik-451-2026-10-31' OR jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows)<>451 THEN RAISE EXCEPTION '451 ta moslik talab qilinadi'; END IF;
PERFORM pg_advisory_xact_lock(hashtext('warehouse-catalog-import'));
SELECT id INTO run FROM public.catalog_import_runs WHERE source_key=_source_key;
IF run IS NOT NULL THEN RETURN (SELECT summary FROM public.catalog_import_runs WHERE id=run); END IF;
LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.catalog_import_runs(actor_id,source_key) VALUES(auth.uid(),_source_key) RETURNING id INTO run;
INSERT INTO public.catalog_product_backups(run_id,product_id,snapshot) SELECT run,id,to_jsonb(products) FROM public.products;
FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
old_n:=r->>'old_name'; new_n:=r->>'new_name'; code:=nullif(r->>'mxik',''); target:=NULL;
SELECT array_agg(id) INTO old_ids FROM public.products WHERE instrument_id IS NULL AND public.catalog_name_key(name)=public.catalog_name_key(old_n);
SELECT array_agg(id) INTO new_ids FROM public.products WHERE instrument_id IS NULL AND public.catalog_name_key(name)=public.catalog_name_key(new_n);
IF cardinality(old_ids)>1 THEN outcome:='Eski nom takrorlangan';
ELSIF cardinality(old_ids)=1 THEN
 target:=old_ids[1];
 IF EXISTS(SELECT 1 FROM public.products WHERE instrument_id IS NULL AND id<>target AND public.catalog_name_key(name)=public.catalog_name_key(new_n)) THEN target:=NULL; outcome:='Yangi nom boshqa mahsulotda mavjud'; ELSE outcome:='Yangilandi'; END IF;
ELSIF cardinality(new_ids)=1 THEN target:=new_ids[1]; outcome:='Yangi nom mavjud';
ELSIF cardinality(new_ids)>1 THEN outcome:='Yangi nom takrorlangan';
ELSE outcome:='Mos mahsulot topilmadi'; END IF;
IF target IS NOT NULL THEN
 SELECT * INTO p FROM public.products WHERE id=target;
 IF code IS NOT NULL AND code !~ '^[0-9]{17}$' THEN code:=NULL; END IF;
 IF p.name IS DISTINCT FROM new_n THEN renamed:=renamed+1; END IF;
 IF code IS NOT NULL AND p.mxik_code IS DISTINCT FROM code THEN coded:=coded+1; END IF;
 UPDATE public.products SET name=new_n,mxik_code=coalesce(code,mxik_code),old_names=CASE WHEN public.catalog_name_key(old_n)<>public.catalog_name_key(new_n) AND NOT EXISTS(SELECT 1 FROM unnest(old_names) a WHERE public.catalog_name_key(a)=public.catalog_name_key(old_n)) THEN old_names||old_n ELSE old_names END WHERE id=target;
 IF code IS NULL THEN outcome:=outcome||' · MXIK tekshiruvi kerak'; END IF;
END IF;
IF target IS NULL OR code IS NULL THEN pending:=pending+1; END IF;
results:=results||jsonb_build_array(jsonb_build_object('n',r->'n','old_name',old_n,'new_name',new_n,'mxik',code,'product_id',target,'outcome',outcome,'review',target IS NULL OR code IS NULL));
END LOOP;
UPDATE public.catalog_import_runs SET results=results,summary=jsonb_build_object('renamed',renamed,'mxik_updated',coded,'review',pending,'source_rows',451,'run_id',run) WHERE id=run;
INSERT INTO public.audit_log(actor_id,actor_name,action,entity,details) SELECT auth.uid(),full_name,'Sklad nomlari va MXIK yangilandi','products',jsonb_build_object('run_id',run,'renamed',renamed,'mxik_updated',coded,'review',pending)::text FROM public.profiles WHERE id=auth.uid();
RETURN jsonb_build_object('renamed',renamed,'mxik_updated',coded,'review',pending,'source_rows',451,'run_id',run);
END $$;
REVOKE ALL ON FUNCTION public.apply_catalog_mapping(jsonb,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.apply_catalog_mapping(jsonb,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.resolve_catalog_scan(_code text) RETURNS SETOF public.products LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT p.* FROM public.products p WHERE p.instrument_id IS NULL AND (p.barcode=btrim(_code) OR (p.mxik_code=btrim(_code) AND NOT EXISTS(SELECT 1 FROM public.products b WHERE b.instrument_id IS NULL AND b.barcode=btrim(_code)))) $$;
REVOKE ALL ON FUNCTION public.resolve_catalog_scan(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.resolve_catalog_scan(text) TO authenticated;