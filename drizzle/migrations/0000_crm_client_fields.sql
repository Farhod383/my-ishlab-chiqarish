ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone2 text,
  ADD COLUMN IF NOT EXISTS responsible_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_type text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS partnership_start date,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS clients_name_unique_ci ON public.clients (lower(btrim(name)));

DROP POLICY IF EXISTS clients_auth_insert ON public.clients;
CREATE POLICY clients_auth_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS clients_auth_update ON public.clients;
CREATE POLICY clients_auth_update ON public.clients
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;