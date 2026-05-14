ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS salary numeric NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS employees_manage ON public.employees;
CREATE POLICY employees_manage ON public.employees
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'hr'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'cashier'::app_role))
  WITH CHECK (has_role(auth.uid(),'hr'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'cashier'::app_role));