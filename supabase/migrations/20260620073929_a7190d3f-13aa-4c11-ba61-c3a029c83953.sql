
DROP POLICY IF EXISTS supply_requests_update_supply ON public.order_supply_requests;
DROP POLICY IF EXISTS supply_requests_delete_admin ON public.order_supply_requests;

CREATE POLICY supply_requests_update_supply ON public.order_supply_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role));

CREATE POLICY supply_requests_delete_admin ON public.order_supply_requests
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role));
