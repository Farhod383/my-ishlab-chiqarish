INSERT INTO public.cash_expense_reasons (name, sort_order)
VALUES ('Ta''minot', 5)
ON CONFLICT (name) DO NOTHING;