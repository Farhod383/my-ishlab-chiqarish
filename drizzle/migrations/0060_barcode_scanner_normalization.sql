-- 1) Skaner kodini normallashtirish: bo'sh joy/boshqaruv belgilarini olib tashlash, katta harf,
--    RU klaviatura joylashuvida yozilgan kodni EN ga o'girish (УКЗ... -> ERP...)
CREATE OR REPLACE FUNCTION public.scan_code_variants(_code text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH cleaned AS (
    SELECT upper(regexp_replace(regexp_replace(coalesce(_code,''), '[\x00-\x1f\x7f]+', '', 'g'), '\s+', '', 'g')) AS orig
  ), mapped AS (
    SELECT upper(translate(lower(orig), 'йцукенгшщзфывапролджэячсмить', 'qwertyuiopasdfghjklzxcvbnm')) AS alt, orig FROM cleaned
  )
  SELECT ARRAY(SELECT DISTINCT v FROM (SELECT orig AS v FROM mapped UNION ALL SELECT alt FROM mapped) s WHERE v <> '')
$function$;

-- 2) Yagona skaner RPC: mahsulotlar VA instrumentlar, kanonik kod + aliaslar, normallashtirilgan
CREATE OR REPLACE FUNCTION public.scan_catalog(_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH codes AS (
    SELECT v AS code FROM unnest(public.scan_code_variants(_code)) v WHERE v <> ''
  ), types AS (
    SELECT t.id, t.barcode, t.name, t.unit
    FROM public.product_types t
    WHERE upper(t.barcode) IN (SELECT code FROM codes)
       OR EXISTS (SELECT 1 FROM public.product_type_barcode_aliases a WHERE a.product_type_id = t.id AND upper(a.barcode) IN (SELECT code FROM codes))
  )
  SELECT coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) FROM (
    SELECT 'product'::text AS kind, p.id, p.product_type_id, p.name, p.unit, p.stock_qty, p.last_price, p.currency, p.mxik_code, t.barcode
    FROM types t JOIN public.products p ON p.product_type_id = t.id AND p.instrument_id IS NULL
    UNION ALL
    SELECT 'instrument'::text, i.id, i.product_type_id, i.name, 'dona'::text, i.quantity, i.price, i.currency, i.mxik_code, t.barcode
    FROM types t JOIN public.instruments i ON i.product_type_id = t.id
  ) x
$function$;
GRANT EXECUTE ON FUNCTION public.scan_catalog(text) TO authenticated;

-- 3) Eski RPC ham normallashtirilgan kod bilan ishlasin (imzo o'zgarmaydi)
CREATE OR REPLACE FUNCTION public.resolve_catalog_scan(_code text)
RETURNS SETOF products
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON(p.product_type_id) p.*
  FROM public.products p
  JOIN public.product_types t ON t.id = p.product_type_id
  WHERE p.instrument_id IS NULL
    AND (upper(t.barcode) IN (SELECT v FROM unnest(public.scan_code_variants(_code)) v)
         OR EXISTS (SELECT 1 FROM public.product_type_barcode_aliases a WHERE a.product_type_id = t.id AND upper(a.barcode) IN (SELECT v FROM unnest(public.scan_code_variants(_code)) v)))
  ORDER BY p.product_type_id, p.created_at, p.id
$function$;

-- 4) Zavod/ishlab chiqaruvchi shtrix-kodi berilgan bo'lsa, uni saqlash; bo'lmasa ERP kod generatsiya qilish
CREATE OR REPLACE FUNCTION public.catalog_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.name IS DISTINCT FROM OLD.name AND coalesce(btrim(OLD.name),'')<>'' AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(NEW.old_names,'{}')) n WHERE lower(btrim(n))=lower(btrim(OLD.name))) THEN NEW.old_names:=coalesce(NEW.old_names,'{}')||btrim(OLD.name); END IF;
  IF OLD.barcode IS NOT NULL AND NEW.barcode IS DISTINCT FROM OLD.barcode THEN RAISE EXCEPTION 'Mahsulot shtrix-kodini o‘zgartirish mumkin emas'; END IF;
  IF NEW.product_type_id IS DISTINCT FROM OLD.product_type_id THEN RAISE EXCEPTION 'Mahsulot turi identifikatorini o‘zgartirish mumkin emas'; END IF;
 ELSE
  IF NEW.product_type_id IS NOT NULL THEN RAISE EXCEPTION 'Yangi partiya uchun mavjud katalog mahsulotini tanlang'; END IF;
  NEW.product_type_id:=NEW.id;
  IF coalesce(btrim(NEW.barcode),'') <> '' THEN
   IF EXISTS(SELECT 1 FROM public.product_types t WHERE upper(t.barcode)=upper(btrim(NEW.barcode)))
      OR EXISTS(SELECT 1 FROM public.product_type_barcode_aliases a WHERE upper(a.barcode)=upper(btrim(NEW.barcode))) THEN
    RAISE EXCEPTION 'Bu shtrix-kod boshqa mahsulot turiga biriktirilgan';
   END IF;
   NEW.barcode:=btrim(NEW.barcode);
  ELSE
   NEW.barcode:='ERP'||lpad(nextval('public.catalog_barcode_seq')::text,9,'0');
  END IF;
  INSERT INTO public.product_types(id,barcode,name,unit,technical) VALUES(NEW.product_type_id,NEW.barcode,NEW.name,CASE WHEN TG_TABLE_NAME='products' THEN to_jsonb(NEW)->>'unit' ELSE 'dona' END,jsonb_build_object('metal_type',to_jsonb(NEW)->'metal_type','thickness_mm',to_jsonb(NEW)->'thickness_mm','width_mm',to_jsonb(NEW)->'width_mm','length_mm',to_jsonb(NEW)->'length_mm','weight_kg',to_jsonb(NEW)->'weight_kg','category',to_jsonb(NEW)->'category','inventory_number',to_jsonb(NEW)->'inventory_number'));
 END IF;
 RETURN NEW;
END $function$;

-- 5) Sverka RPC natijasiga shtrix-kodni qo'shish (forma ichida darhol ko'rsatish uchun)
CREATE OR REPLACE FUNCTION public.warehouse_reconcile(_key uuid, _product_id uuid, _name text, _unit text, _quantity numeric, _price numeric DEFAULT NULL::numeric, _currency text DEFAULT 'UZS'::text, _technical jsonb DEFAULT '{}'::jsonb, _comment text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE p public.products%ROWTYPE; m public.stock_movements%ROWTYPE; payload jsonb; after_qty numeric; actor text; delta numeric; dir public.movement_direction;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sverka kirimiga ruxsat yo‘q'; END IF;
 IF _key IS NULL OR _quantity IS NULL OR _quantity < 0 OR _quantity::text IN ('NaN','Infinity','-Infinity') OR (_price IS NOT NULL AND (_price<0 OR _price::text IN ('NaN','Infinity','-Infinity'))) OR _currency IS NULL OR _currency NOT IN ('UZS','USD') THEN RAISE EXCEPTION 'Qoldiq, narx yoki valyuta noto‘g‘ri'; END IF;
 payload:=jsonb_build_object('product_id',_product_id,'name',_name,'unit',_unit,'quantity',_quantity,'price',_price,'currency',_currency,'technical',_technical,'comment',_comment);
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,0));
 SELECT * INTO m FROM public.stock_movements WHERE reconciliation_key=_key;
 IF FOUND THEN
  IF m.created_by IS DISTINCT FROM auth.uid() OR m.reconciliation_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Bu so‘rov boshqa operatsiya uchun ishlatilgan'; END IF;
  RETURN jsonb_build_object('movement_id',m.id,'product_id',m.product_id,'before',m.stock_before,'after',m.stock_after,'replayed',true,'barcode',(SELECT barcode FROM public.products WHERE id=m.product_id));
 END IF;
 IF _product_id IS NULL THEN
  IF coalesce(btrim(_name),'')='' OR coalesce(btrim(_unit),'')='' THEN RAISE EXCEPTION 'Mahsulot nomi va birligini kiriting'; END IF;
  IF _quantity <= 0 THEN RAISE EXCEPTION 'Yangi mahsulot uchun boshlang‘ich qoldiq musbat bo‘lishi kerak'; END IF;
  INSERT INTO public.products(name,unit,last_price,currency,metal_type,thickness_mm,width_mm,length_mm,weight_kg)
  VALUES(btrim(_name),btrim(_unit),coalesce(_price,0),_currency,nullif(btrim(_technical->>'metal_type'),''),nullif(_technical->>'thickness_mm','')::numeric,nullif(_technical->>'width_mm','')::numeric,nullif(_technical->>'length_mm','')::numeric,nullif(_technical->>'weight_kg','')::numeric) RETURNING * INTO p;
 ELSE
  SELECT * INTO p FROM public.products WHERE id=_product_id AND instrument_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mahsulot topilmadi'; END IF;
 END IF;
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 delta := _quantity - p.stock_qty;
 IF delta = 0 THEN
  INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name)
  VALUES('products',p.id,'sverka_no_change',jsonb_build_object('stock_qty',p.stock_qty),jsonb_build_object('stock_qty',p.stock_qty,'product_id',p.id,'name',p.name),auth.uid(),actor);
  RETURN jsonb_build_object('movement_id',null,'product_id',p.id,'before',p.stock_qty,'after',p.stock_qty,'replayed',false,'unchanged',true,'barcode',p.barcode);
 END IF;
 dir := CASE WHEN delta > 0 THEN 'in'::public.movement_direction ELSE 'out'::public.movement_direction END;
 PERFORM set_config('app.reconciliation_key',_key::text,true);
 INSERT INTO public.stock_movements(product_id,direction,quantity,unit_price,currency,location,source,reason,comment,created_by,reconciliation_key,stock_before,stock_after,reconciliation_payload)
 VALUES(p.id,dir,abs(delta),coalesce(_price,0),CASE WHEN _price IS NULL THEN p.currency ELSE _currency END,'Sklad','Sverka — nakladnoysiz kirim','Sverka — nakladnoysiz kirim',_comment,auth.uid(),_key,p.stock_qty,_quantity,payload) RETURNING * INTO m;
 SELECT stock_qty INTO after_qty FROM public.products WHERE id=p.id;
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name)
 VALUES('stock_movements',m.id,'sverka_intake',jsonb_build_object('stock_qty',p.stock_qty),jsonb_build_object('stock_qty',after_qty,'product_id',p.id,'name',p.name,'delta',delta,'movement_id',m.id),auth.uid(),actor);
 RETURN jsonb_build_object('movement_id',m.id,'product_id',p.id,'before',p.stock_qty,'after',after_qty,'replayed',false,'barcode',p.barcode);
END $function$;