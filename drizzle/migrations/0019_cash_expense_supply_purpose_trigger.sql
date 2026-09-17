CREATE OR REPLACE FUNCTION public.set_cash_expense_supply_purpose()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.reason IS NOT NULL
     AND lower(btrim(NEW.reason)) IN ('ta''minot', 'taminot', 'ta minot', 'ta’minot', 'ta`minot')
  THEN
    NEW.purpose := 'supply';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_expense_supply_purpose ON public.cash_expenses;
CREATE TRIGGER trg_cash_expense_supply_purpose
BEFORE INSERT OR UPDATE ON public.cash_expenses
FOR EACH ROW EXECUTE FUNCTION public.set_cash_expense_supply_purpose();