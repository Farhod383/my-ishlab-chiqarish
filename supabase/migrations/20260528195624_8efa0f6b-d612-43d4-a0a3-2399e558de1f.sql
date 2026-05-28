
-- Extend products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UZS';

-- Extend stock_movements
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT 'Asosiy zavod',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UZS';

-- Extend returns
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT 'Asosiy zavod';

-- Locations
CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.locations TO anon, authenticated;
GRANT ALL ON public.locations TO service_role, authenticated;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY loc_read ON public.locations FOR SELECT TO authenticated USING (true);
CREATE POLICY loc_manage ON public.locations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'supply'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'supply'));
INSERT INTO public.locations(name) VALUES ('Asosiy zavod'),('Zavod51')
  ON CONFLICT (name) DO NOTHING;

-- Form history (autocomplete)
CREATE TABLE IF NOT EXISTS public.form_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL,
  value text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(field_key, value)
);
GRANT SELECT, INSERT ON public.form_history TO authenticated;
GRANT ALL ON public.form_history TO service_role;
ALTER TABLE public.form_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY fh_read ON public.form_history FOR SELECT TO authenticated USING (true);
CREATE POLICY fh_insert ON public.form_history FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Entity audit (structured before/after)
CREATE TABLE IF NOT EXISTS public.entity_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid,
  actor_name text,
  role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.entity_audit TO authenticated;
GRANT ALL ON public.entity_audit TO service_role;
ALTER TABLE public.entity_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY ea_read_admin ON public.entity_audit FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE POLICY ea_insert ON public.entity_audit FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
