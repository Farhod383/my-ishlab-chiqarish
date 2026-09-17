CREATE TABLE IF NOT EXISTS public.cash_expense_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.cash_expense_reasons TO authenticated;
GRANT ALL ON public.cash_expense_reasons TO service_role;

ALTER TABLE public.cash_expense_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_expense_reasons_read" ON public.cash_expense_reasons
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cash_expense_reasons_insert" ON public.cash_expense_reasons
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'chief_accountant')
  );

CREATE POLICY "cash_expense_reasons_update" ON public.cash_expense_reasons
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'chief_accountant')
  );
