
CREATE TABLE public.order_supply_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text,
  required_date date,
  comment text,
  status text NOT NULL DEFAULT 'pending',
  supply_comment text,
  created_by uuid,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_supply_requests TO authenticated;
GRANT ALL ON public.order_supply_requests TO service_role;

ALTER TABLE public.order_supply_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supply_requests_select_auth"
  ON public.order_supply_requests FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "supply_requests_insert_manager"
  ON public.order_supply_requests FOR INSERT
  TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'marketing')
  );

CREATE POLICY "supply_requests_update_supply"
  ON public.order_supply_requests FOR UPDATE
  TO authenticated USING (
    public.has_role(auth.uid(), 'supply')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'marketing')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'supply')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'marketing')
  );

CREATE POLICY "supply_requests_delete_admin"
  ON public.order_supply_requests FOR DELETE
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE TRIGGER trg_supply_requests_updated
  BEFORE UPDATE ON public.order_supply_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_supply_requests_order ON public.order_supply_requests(order_id);
CREATE INDEX idx_supply_requests_status ON public.order_supply_requests(status);
