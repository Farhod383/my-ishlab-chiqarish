ALTER POLICY supply_requests_select_auth ON public.order_supply_requests TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','marketing','manager','warehouse','supply','otk','hr','cashier','chief_accountant','engineer'))
);
ALTER POLICY supply_requests_insert_any_auth ON public.order_supply_requests TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','marketing','manager','warehouse','supply','otk','hr','cashier','chief_accountant','engineer'))
);
-- Existing write policies and creator/late-reason triggers remain unchanged.
