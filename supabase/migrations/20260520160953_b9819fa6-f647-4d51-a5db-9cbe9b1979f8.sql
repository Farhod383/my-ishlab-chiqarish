DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cash_incomes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_incomes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cash_expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_expenses;
  END IF;
END $$;