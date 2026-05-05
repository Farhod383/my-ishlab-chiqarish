
-- Employees table
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  position text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  phone text,
  hire_date date NOT NULL DEFAULT CURRENT_DATE,
  leave_date date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_read_all" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "employees_manage" ON public.employees FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'hr'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'hr'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Cash expenses table
CREATE TABLE public.cash_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  recipient_id uuid REFERENCES public.employees(id),
  recipient_name text,
  comment text,
  expense_date timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cash_read_all" ON public.cash_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "cash_manage" ON public.cash_expenses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'cashier'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'cashier'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Returns table
CREATE TYPE public.return_type AS ENUM ('worker_to_warehouse', 'warehouse_to_shop');
CREATE TABLE public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 0,
  returned_by_id uuid REFERENCES public.employees(id),
  returned_by_name text,
  return_type public.return_type NOT NULL,
  reason text,
  comment text,
  image_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "returns_read_all" ON public.returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "returns_manage" ON public.returns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Defects table
CREATE TYPE public.defect_resolution AS ENUM ('rework', 'write_off', 'pending');
CREATE TABLE public.defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  stage_id uuid,
  product_id uuid REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 0,
  detected_by_id uuid REFERENCES public.employees(id),
  detected_by_name text,
  reason text,
  comment text,
  image_url text,
  resolution public.defect_resolution NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.defects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "defects_read_all" ON public.defects FOR SELECT TO authenticated USING (true);
CREATE POLICY "defects_insert_auth" ON public.defects FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "defects_update" ON public.defects FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role));
CREATE POLICY "defects_delete" ON public.defects FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
