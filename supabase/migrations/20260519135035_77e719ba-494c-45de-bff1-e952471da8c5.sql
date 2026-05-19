ALTER TABLE public.cash_incomes 
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UZS',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_uzs numeric NOT NULL DEFAULT 0;

ALTER TABLE public.cash_expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UZS',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_uzs numeric NOT NULL DEFAULT 0;

UPDATE public.cash_incomes SET total_uzs = amount WHERE total_uzs = 0;
UPDATE public.cash_expenses SET total_uzs = amount WHERE total_uzs = 0;