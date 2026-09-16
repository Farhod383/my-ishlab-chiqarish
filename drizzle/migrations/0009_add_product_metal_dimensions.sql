ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS metal_type text,
  ADD COLUMN IF NOT EXISTS thickness_mm numeric,
  ADD COLUMN IF NOT EXISTS width_mm numeric,
  ADD COLUMN IF NOT EXISTS length_mm numeric,
  ADD COLUMN IF NOT EXISTS weight_kg numeric;

CREATE INDEX IF NOT EXISTS idx_products_metal_type ON public.products (metal_type) WHERE metal_type IS NOT NULL;