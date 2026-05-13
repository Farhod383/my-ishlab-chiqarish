CREATE TABLE IF NOT EXISTS public.cash_incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT '',
  payment_type text,
  comment text,
  receipt_url text,
  income_date timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_incomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "income_read_all" ON public.cash_incomes FOR SELECT TO authenticated USING (true);
CREATE POLICY "income_manage" ON public.cash_incomes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'cashier'::app_role) OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'cashier'::app_role) OR has_role(auth.uid(),'admin'::app_role));