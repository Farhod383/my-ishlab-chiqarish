CREATE OR REPLACE FUNCTION public.scan_code_variants(_code text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
WITH cleaned AS (
 SELECT upper(regexp_replace(coalesce(_code,''), '[[:space:][:cntrl:]]+', '', 'g')) orig
), mapped AS (
 SELECT orig, upper(translate(lower(orig), 'йцукенгшщзфывапролдячсмить', 'qwertyuiopasdfghjklzxcvbnm')) alt FROM cleaned
), base AS (SELECT orig v FROM mapped UNION SELECT alt FROM mapped), variants AS (
 SELECT v FROM base WHERE v<>'' UNION SELECT substring(v from 4) FROM base WHERE v LIKE 'ERP%' AND length(v)>3 UNION SELECT 'ERP'||v FROM base WHERE v<>'' AND v NOT LIKE 'ERP%'
) SELECT ARRAY(SELECT v FROM variants WHERE v<>'') $$;
CREATE OR REPLACE FUNCTION public.scan_barcode_matches(_barcode text,_code text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM unnest(public.scan_code_variants(_barcode)) b JOIN unnest(public.scan_code_variants(_code)) c ON b=c OR (b ~ '^\d+$' AND c ~ '^\d+$' AND ltrim(b,'0')=ltrim(c,'0'))) $$;
REVOKE ALL ON FUNCTION public.scan_barcode_matches(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.scan_barcode_matches(text,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.scan_catalog(_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH matched_types AS (
 SELECT t.id FROM public.product_types t
 WHERE public.scan_barcode_matches(t.barcode,_code)
 OR EXISTS(SELECT 1 FROM public.product_type_barcode_aliases a WHERE a.product_type_id=t.id AND public.scan_barcode_matches(a.barcode,_code))
 ), matched_products AS (
 SELECT p.* FROM public.products p WHERE p.product_type_id IN(SELECT id FROM matched_types) OR public.scan_barcode_matches(p.barcode,_code)
 ), matched_instruments AS (
 SELECT i.* FROM public.instruments i
 WHERE i.product_type_id IN(SELECT id FROM matched_types) OR public.scan_barcode_matches(i.barcode,_code)
 OR EXISTS(SELECT 1 FROM matched_products p WHERE p.instrument_id=i.id)
 )
 SELECT coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) FROM (
 SELECT 'product'::text kind,p.id,p.product_type_id,p.name,p.unit,p.stock_qty,p.last_price,p.currency,p.mxik_code,coalesce(t.barcode,p.barcode) barcode
 FROM matched_products p LEFT JOIN public.product_types t ON t.id=p.product_type_id WHERE p.instrument_id IS NULL
 UNION ALL
 SELECT 'instrument'::text,i.id,i.product_type_id,i.name,'dona'::text,i.quantity,i.price,i.currency,i.mxik_code,coalesce(t.barcode,i.barcode)
 FROM matched_instruments i LEFT JOIN public.product_types t ON t.id=i.product_type_id
 ) x $$;
CREATE OR REPLACE FUNCTION public.resolve_catalog_scan(_code text)
RETURNS SETOF public.products LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT DISTINCT ON (coalesce(p.product_type_id,p.id)) p.*
 FROM public.products p WHERE p.instrument_id IS NULL
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(public.scan_catalog(_code)) r WHERE r->>'kind'='product' AND r->>'id'=p.id::text)
 ORDER BY coalesce(p.product_type_id,p.id),p.created_at,p.id $$;