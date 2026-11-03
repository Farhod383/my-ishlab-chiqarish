DO $ddl$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.catalog_identity_guard()'::regprocedure) INTO definition;
 definition:=replace(definition, 'IF OLD.barcode IS NOT NULL AND NEW.barcode IS DISTINCT FROM OLD.barcode THEN RAISE EXCEPTION ''Mahsulot shtrix-kodini o‘zgartirish mumkin emas''; END IF;', 'IF NEW.barcode IS DISTINCT FROM OLD.barcode AND NOT ((public.has_role(auth.uid(),''admin'') OR public.has_role(auth.uid(),''warehouse'')) AND EXISTS(SELECT 1 FROM public.product_types WHERE id=NEW.product_type_id AND barcode=NEW.barcode)) THEN RAISE EXCEPTION ''Shtrix-kodni maxsus tasdiqlangan amal orqali o‘zgartiring''; END IF;');
 definition:=replace(definition,'NEW.product_type_id:=NEW.id;', 'NEW.product_type_id:=NEW.id; PERFORM pg_advisory_xact_lock(814720063);');
 definition:=replace(definition, 'NEW.barcode:=''ERP''||lpad(nextval(''public.catalog_barcode_seq'')::text,9,''0'');', 'LOOP NEW.barcode:=''ERP''||lpad(nextval(''public.catalog_barcode_seq'')::text,9,''0''); EXIT WHEN NOT EXISTS(SELECT 1 FROM public.product_types WHERE upper(barcode)=upper(NEW.barcode)) AND NOT EXISTS(SELECT 1 FROM public.product_type_barcode_aliases WHERE upper(barcode)=upper(NEW.barcode)); END LOOP;');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.warehouse_reconcile(uuid,uuid,text,text,numeric,numeric,text,jsonb,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'public.warehouse_reconcile(', 'public.warehouse_reconcile_with_barcode(');
 definition:=replace(definition,'_price numeric DEFAULT', '_barcode text, _price numeric DEFAULT');
 definition:=replace(definition,'''comment'',_comment);','''comment'',_comment,''barcode'',nullif(btrim(_barcode),''''));');
 definition:=replace(definition,'INSERT INTO public.products(name,unit,last_price','INSERT INTO public.products(barcode,name,unit,last_price');
 definition:=replace(definition,'VALUES(btrim(_name),btrim(_unit)', 'VALUES(nullif(btrim(_barcode),''''),btrim(_name),btrim(_unit)');
 definition:=replace(definition,'SELECT full_name INTO actor', 'IF _product_id IS NOT NULL AND coalesce(btrim(_barcode),'''')<>'''' THEN RAISE EXCEPTION ''Mavjud mahsulot kodini tahrirlash oynasida o‘zgartiring''; END IF; SELECT full_name INTO actor');
 EXECUTE definition;
END $ddl$;

CREATE OR REPLACE FUNCTION public.guard_type_barcode_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(814720063);
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.barcode IS DISTINCT FROM OLD.barcode) THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR current_setting('app.barcode_edit_type',true) IS DISTINCT FROM OLD.id::text OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse')) THEN RAISE EXCEPTION 'Shtrix-kodni maxsus tasdiqlangan amal orqali o‘zgartiring'; END IF;
 END IF;
 IF coalesce(btrim(NEW.barcode),'')='' OR NEW.barcode !~ '^[ -~]+$' THEN RAISE EXCEPTION 'Code 128 uchun to‘g‘ri shtrix-kod kiriting'; END IF;
 IF EXISTS(SELECT 1 FROM public.product_types WHERE upper(barcode)=upper(NEW.barcode) AND id<>NEW.id) OR EXISTS(SELECT 1 FROM public.product_type_barcode_aliases WHERE upper(barcode)=upper(NEW.barcode) AND product_type_id<>NEW.id) THEN RAISE EXCEPTION 'Bu shtrix-kod boshqa mahsulot turiga biriktirilgan'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_type_barcode_change BEFORE INSERT OR UPDATE ON public.product_types FOR EACH ROW EXECUTE FUNCTION public.guard_type_barcode_change();
CREATE OR REPLACE FUNCTION public.guard_type_barcode_alias() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(814720063);
 IF TG_OP='UPDATE' AND (NEW.barcode IS DISTINCT FROM OLD.barcode OR NEW.product_type_id IS DISTINCT FROM OLD.product_type_id) THEN RAISE EXCEPTION 'Eski shtrix-kod bog‘lanishini o‘zgartirish mumkin emas'; END IF;
 IF EXISTS(SELECT 1 FROM public.product_types WHERE upper(barcode)=upper(NEW.barcode) AND id<>NEW.product_type_id) OR EXISTS(SELECT 1 FROM public.product_type_barcode_aliases WHERE upper(barcode)=upper(NEW.barcode) AND product_type_id<>NEW.product_type_id) THEN RAISE EXCEPTION 'Bu shtrix-kod boshqa mahsulot turiga biriktirilgan'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_type_barcode_alias BEFORE INSERT OR UPDATE ON public.product_type_barcode_aliases FOR EACH ROW EXECUTE FUNCTION public.guard_type_barcode_alias();
CREATE OR REPLACE FUNCTION public.set_product_barcode(_product_id uuid, _code text, _expected_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE typ uuid; old_code text; new_code text:=btrim(_code); actor text;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse')) THEN RAISE EXCEPTION 'Shtrix-kod tahririga ruxsat yo‘q'; END IF;
 IF coalesce(new_code,'')='' OR new_code !~ '^[ -~]+$' THEN RAISE EXCEPTION 'Code 128 uchun to‘g‘ri shtrix-kod kiriting'; END IF;
 PERFORM pg_advisory_xact_lock(814720063);
 SELECT product_type_id INTO typ FROM public.products WHERE id=_product_id AND instrument_id IS NULL;
 IF typ IS NULL THEN RAISE EXCEPTION 'Mahsulot topilmadi'; END IF;
 SELECT barcode INTO old_code FROM public.product_types WHERE id=typ FOR UPDATE;
 IF old_code IS DISTINCT FROM _expected_code THEN RAISE EXCEPTION 'Shtrix-kod boshqa foydalanuvchi tomonidan o‘zgartirilgan. Sahifani yangilang'; END IF;
 IF old_code=new_code THEN RETURN jsonb_build_object('product_type_id',typ,'barcode',old_code,'unchanged',true); END IF;
 IF EXISTS(SELECT 1 FROM public.product_types WHERE upper(barcode)=upper(new_code) AND id<>typ) OR EXISTS(SELECT 1 FROM public.product_type_barcode_aliases WHERE upper(barcode)=upper(new_code) AND product_type_id<>typ) THEN RAISE EXCEPTION 'Bu shtrix-kod boshqa mahsulot turiga biriktirilgan'; END IF;
 INSERT INTO public.product_type_barcode_aliases(barcode,product_type_id,reason) VALUES(old_code,typ,'Qo‘lda shtrix-kod tahriri') ON CONFLICT(barcode) DO NOTHING;
 PERFORM set_config('app.barcode_edit_type',typ::text,true);
 UPDATE public.product_types SET barcode=new_code WHERE id=typ;
 UPDATE public.products SET barcode=new_code WHERE product_type_id=typ;
 UPDATE public.instruments SET barcode=new_code WHERE product_type_id=typ;
 PERFORM set_config('app.barcode_edit_type','',true);
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name) VALUES('product_types',typ,'barcode_changed',jsonb_build_object('barcode',old_code),jsonb_build_object('barcode',new_code,'product_id',_product_id),auth.uid(),actor);
 RETURN jsonb_build_object('product_type_id',typ,'barcode',new_code,'old_barcode',old_code);
END $$;
REVOKE ALL ON FUNCTION public.set_product_barcode(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_barcode(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.warehouse_reconcile_with_barcode(uuid,uuid,text,text,numeric,text,numeric,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_reconcile_with_barcode(uuid,uuid,text,text,numeric,text,numeric,text,jsonb,text) TO authenticated,service_role;