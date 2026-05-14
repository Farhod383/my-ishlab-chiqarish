
-- 1. Add source column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS source text;

-- 2. Cleanup warehouse test data (keep users, roles, orders, employees)
DELETE FROM public.defects;
DELETE FROM public.returns;
DELETE FROM public.stock_movements;
DELETE FROM public.order_parts WHERE product_id IS NOT NULL;
DELETE FROM public.products;
