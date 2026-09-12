ALTER TABLE public.cash_expenses ADD COLUMN IF NOT EXISTS purpose text;
CREATE INDEX IF NOT EXISTS idx_cash_expenses_purpose ON public.cash_expenses (purpose) WHERE purpose IS NOT NULL;