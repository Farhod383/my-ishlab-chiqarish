DROP POLICY IF EXISTS ea_read_admin ON public.entity_audit;
CREATE POLICY ea_read_all ON public.entity_audit FOR SELECT TO authenticated USING (true);