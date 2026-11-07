CREATE OR REPLACE FUNCTION public.scan_code_variants(_code text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = 'public'
AS $function$
  WITH cleaned AS (
    SELECT upper(regexp_replace(regexp_replace(coalesce(_code,''), '[\x00-\x1f\x7f]+', '', 'g'), '\s+', '', 'g')) AS orig
  ), mapped AS (
    SELECT upper(translate(lower(orig), 'йцукенгшщзфывапролджэячсмить', 'qwertyuiopasdfghjklzxcvbnm')) AS alt, orig FROM cleaned
  ), base AS (
    SELECT DISTINCT v FROM (SELECT orig AS v FROM mapped UNION ALL SELECT alt FROM mapped) s WHERE v <> ''
  ), erp AS (
    SELECT v FROM base
    UNION ALL SELECT substring(v from 4) FROM base WHERE v LIKE 'ERP%' AND length(v) > 3
    UNION ALL SELECT 'ERP' || v FROM base WHERE v NOT LIKE 'ERP%'
  )
  SELECT ARRAY(SELECT DISTINCT v FROM erp WHERE v <> '')
$function$;

CREATE OR REPLACE FUNCTION public.resolve_catalog_scan(_code text)
RETURNS SETOF products
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $function$
  WITH codes AS (
    SELECT v AS code FROM unnest(public.scan_code_variants(_code)) v WHERE v <> ''
  )
  SELECT DISTINCT ON(p.product_type_id) p.*
  FROM public.products p
  LEFT JOIN public.product_types t ON t.id = p.product_type_id
  WHERE p.instrument_id IS NULL
    AND (upper(t.barcode) IN (SELECT code FROM codes)
         OR upper(p.barcode) IN (SELECT code FROM codes)
         OR EXISTS (SELECT 1 FROM public.product_type_barcode_aliases a WHERE a.product_type_id = t.id AND upper(a.barcode) IN (SELECT code FROM codes))
         OR (t.barcode ~ '^\d+$' AND EXISTS (SELECT 1 FROM codes c WHERE c.code ~ '^\d+$' AND ltrim(t.barcode,'0') = ltrim(c.code,'0')))
         OR (p.barcode ~ '^\d+$' AND EXISTS (SELECT 1 FROM codes c WHERE c.code ~ '^\d+$' AND ltrim(p.barcode,'0') = ltrim(c.code,'0')))
         OR EXISTS (SELECT 1 FROM public.product_type_barcode_aliases a WHERE a.product_type_id = t.id AND a.barcode ~ '^\d+$' AND EXISTS (SELECT 1 FROM codes c WHERE c.code ~ '^\d+$' AND ltrim(a.barcode,'0') = ltrim(c.code,'0'))))
  ORDER BY p.product_type_id, p.created_at, p.id
$function$;

CREATE OR REPLACE FUNCTION public.scan_catalog(_code text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
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
    UNION ALL
    SELECT 'product'::text, p.id, p.product_type_id, p.name, p.unit, p.stock_qty, p.last_price, p.currency, p.mxik_code, p.barcode
    FROM public.products p
    WHERE p.instrument_id IS NULL AND p.barcode IS NOT NULL AND upper(p.barcode) IN (SELECT code FROM codes)
      AND NOT EXISTS (SELECT 1 FROM types t WHERE t.id = p.product_type_id)
  ) x
$function$;