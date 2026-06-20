
-- Make order_id optional so warehouse-side purchase requests can exist without an order
ALTER TABLE public.order_supply_requests ALTER COLUMN order_id DROP NOT NULL;

-- Add department/source labels to identify who/where the request came from
ALTER TABLE public.order_supply_requests ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.order_supply_requests ADD COLUMN IF NOT EXISTS source text DEFAULT 'warehouse';

-- Open inserts to any authenticated user (anyone can create a purchase request)
DROP POLICY IF EXISTS supply_requests_insert_manager ON public.order_supply_requests;
CREATE POLICY supply_requests_insert_any_auth
ON public.order_supply_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
