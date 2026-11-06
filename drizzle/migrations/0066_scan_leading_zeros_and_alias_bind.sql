-- 1) Skaner qidiruviga bosh nollarsiz solishtirish qo'shish (000123 = 123, faqat sof raqamli kodlar)
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
       OR (t.barcode ~ '^\d+$' AND EXISTS (SELECT 1 FROM codes c WHERE c.code ~ '^\d+$' AND ltrim(t.barcode,'0') = ltrim(c.code,'0')))
       OR EXISTS (SELECT 1 FROM public.product_type_barcode_aliases a WHERE a.product_type_id = t.id AND a.barcode ~ '^\d+$' AND EXISTS (SELECT 1 FROM codes c WHERE c.code ~ '^\d+$' AND ltrim(a.barcode,'0') = ltrim(c.code,'0')))
  )
  SELECT coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) FROM (
    SELECT 'product'::text AS kind, p.id, p.product_type_id, p.name, p.unit, p.stock_qty, p.last_price, p.currency, p.mxik_code, t.barcode
    FROM types t JOIN public.products p ON p.product_type_id = t.id AND p.instrument_id IS NULL
    UNION ALL
    SELECT 'instrument'::text, i.id, i.product_type_id, i.name, 'dona'::text, i.quantity, i.price, i.currency, i.mxik_code, t.barcode
    FROM types t JOIN public.instruments i ON i.product_type_id = t.id
  ) x
$function$;

CREATE OR REPLACE FUNCTION public.resolve_catalog_scan(_code text)
RETURNS SETOF products
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH codes AS (
    SELECT v AS code FROM unnest(public.scan_code_variants(_code)) v WHERE v <> ''
  )
  SELECT DISTINCT ON(p.product_type_id) p.*
  FROM public.products p
  JOIN public.product_types t ON t.id = p.product_type_id
  WHERE p.instrument_id IS NULL
    AND (upper(t.barcode) IN (SELECT code FROM codes)
         OR EXISTS (SELECT 1 FROM public.product_type_barcode_aliases a WHERE a.product_type_id = t.id AND upper(a.barcode) IN (SELECT code FROM codes))
         OR (t.barcode ~ '^\d+$' AND EXISTS (SELECT 1 FROM codes c WHERE c.code ~ '^\d+$' AND ltrim(t.barcode,'0') = ltrim(c.code,'0')))
         OR EXISTS (SELECT 1 FROM public.product_type_barcode_aliases a WHERE a.product_type_id = t.id AND a.barcode ~ '^\d+$' AND EXISTS (SELECT 1 FROM codes c WHERE c.code ~ '^\d+$' AND ltrim(a.barcode,'0') = ltrim(c.code,'0'))))
  ORDER BY p.product_type_id, p.created_at, p.id
$function$;

-- 2) Topilmagan kodni mavjud tovar turiga alias sifatida biriktirish (faqat admin/sklad)
CREATE OR REPLACE FUNCTION public.bind_barcode_alias(_code text, _product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE p public.products%ROWTYPE; code text; actor text; canonical text;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse')) THEN RAISE EXCEPTION 'Kod biriktirishga ruxsat yo‘q'; END IF;
 code := (SELECT v FROM unnest(public.scan_code_variants(_code)) v LIMIT 1);
 IF code IS NULL OR code = '' THEN RAISE EXCEPTION 'Kod bo‘sh'; END IF;
 IF code LIKE 'MCT%' THEN RAISE EXCEPTION 'MCT kodi xodim bejigi uchun ajratilgan'; END IF;
 SELECT * INTO p FROM public.products WHERE id=_product_id AND instrument_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mahsulot topilmadi'; END IF;
 IF p.product_type_id IS NULL THEN RAISE EXCEPTION 'Mahsulot turi topilmadi'; END IF;
 SELECT barcode INTO canonical FROM public.product_types WHERE id=p.product_type_id;
 IF upper(code) = upper(canonical) THEN
   RETURN jsonb_build_object('product_id',p.id,'product_type_id',p.product_type_id,'name',p.name,'unit',p.unit,'barcode',canonical,'alias',code,'already',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.product_types t WHERE upper(t.barcode)=upper(code) AND t.id<>p.product_type_id)
    OR EXISTS(SELECT 1 FROM public.product_type_barcode_aliases a WHERE upper(a.barcode)=upper(code) AND a.product_type_id<>p.product_type_id) THEN
   RAISE EXCEPTION 'Bu shtrix-kod boshqa mahsulot turiga biriktirilgan';
 END IF;
 INSERT INTO public.product_type_barcode_aliases(barcode,product_type_id,reason) VALUES(code,p.product_type_id,'Qo‘lda kod biriktirish')
 ON CONFLICT(barcode) DO NOTHING;
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name)
 VALUES('product_types',p.product_type_id,'barcode_alias_bind',NULL,jsonb_build_object('barcode',code,'product_id',p.id,'name',p.name),auth.uid(),actor);
 RETURN jsonb_build_object('product_id',p.id,'product_type_id',p.product_type_id,'name',p.name,'unit',p.unit,'barcode',canonical,'alias',code,'already',false);
END $function$;
GRANT EXECUTE ON FUNCTION public.bind_barcode_alias(text,uuid) TO authenticated;