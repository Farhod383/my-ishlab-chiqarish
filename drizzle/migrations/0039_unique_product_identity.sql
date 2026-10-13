CREATE UNIQUE INDEX IF NOT EXISTS products_identity_uniq ON public.products (
  lower(regexp_replace(btrim(name),'\s+',' ','g')), lower(btrim(unit)), coalesce(metal_type,''),
  coalesce(thickness_mm,-1), coalesce(width_mm,-1), coalesce(length_mm,-1), coalesce(weight_kg,-1), currency
) WHERE instrument_id IS NULL;