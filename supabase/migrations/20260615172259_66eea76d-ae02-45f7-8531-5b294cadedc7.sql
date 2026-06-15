ALTER TABLE public.cash_expenses
  ADD COLUMN IF NOT EXISTS salary_kind text;

COMMENT ON COLUMN public.cash_expenses.salary_kind IS 'Optional classification for employee payments: salary, advance, bonus, penalty, other';

CREATE INDEX IF NOT EXISTS idx_cash_expenses_recipient ON public.cash_expenses(recipient_id);
CREATE INDEX IF NOT EXISTS idx_cash_expenses_salary_kind ON public.cash_expenses(salary_kind);