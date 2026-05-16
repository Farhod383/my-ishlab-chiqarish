CREATE POLICY "mv_warehouse_update" ON public.stock_movements
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role))
WITH CHECK (has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role));

CREATE POLICY "mv_warehouse_delete" ON public.stock_movements
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'admin'::app_role));