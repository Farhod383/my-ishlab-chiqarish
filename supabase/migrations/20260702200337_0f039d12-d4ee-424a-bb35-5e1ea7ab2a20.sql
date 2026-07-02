
-- 1) Add role targeting to notifications (broadcast when both recipient_id and recipient_role are NULL)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_role text;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role ON public.notifications(recipient_role);

-- 2) Remont / Servis module
CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  client_phone text,
  device_name text NOT NULL,
  problem_description text NOT NULL,
  received_at date NOT NULL DEFAULT CURRENT_DATE,
  deadline date,
  status text NOT NULL DEFAULT 'pending', -- pending | in_progress | completed | cancelled
  finished_at timestamptz,
  materials_cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_requests TO authenticated;
GRANT ALL ON public.service_requests TO service_role;

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_requests_read_all" ON public.service_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_requests_write_priv" ON public.service_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_service_requests_updated
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Line items — materials used per service request
CREATE TABLE IF NOT EXISTS public.service_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_request_items TO authenticated;
GRANT ALL ON public.service_request_items TO service_role;

ALTER TABLE public.service_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_request_items_read_all" ON public.service_request_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_request_items_write_priv" ON public.service_request_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE INDEX IF NOT EXISTS idx_service_items_req ON public.service_request_items(service_request_id);
