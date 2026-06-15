
-- 1. Non-negative stock and instrument quantity guards
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_stock_qty_nonneg;
ALTER TABLE public.products
  ADD CONSTRAINT products_stock_qty_nonneg CHECK (stock_qty >= 0) NOT VALID;

ALTER TABLE public.instruments
  DROP CONSTRAINT IF EXISTS instruments_quantity_nonneg;
ALTER TABLE public.instruments
  ADD CONSTRAINT instruments_quantity_nonneg CHECK (quantity >= 0) NOT VALID;

-- 2. Cash balance guard per currency & payment_type
CREATE OR REPLACE FUNCTION public.enforce_nonnegative_cash_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_in numeric := 0;
  total_out numeric := 0;
  pt text := COALESCE(NEW.payment_type, 'cash');
  cur text := COALESCE(NEW.currency, 'UZS');
  delta numeric := COALESCE(NEW.amount, 0);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- account for the row's own previous contribution
    IF OLD.currency = NEW.currency AND COALESCE(OLD.payment_type,'cash') = pt THEN
      delta := delta - COALESCE(OLD.amount, 0);
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO total_in
  FROM public.cash_incomes
  WHERE currency = cur AND COALESCE(payment_type,'cash') = pt;

  SELECT COALESCE(SUM(amount),0) INTO total_out
  FROM public.cash_expenses
  WHERE currency = cur AND COALESCE(payment_type,'cash') = pt
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF (total_in - total_out - COALESCE(NEW.amount,0)) < 0 THEN
    RAISE EXCEPTION 'Mablag'' yetarli emas: % % (mavjud: %)',
      NEW.amount, cur, (total_in - total_out)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_cash_balance_trg ON public.cash_expenses;
CREATE TRIGGER enforce_cash_balance_trg
  BEFORE INSERT OR UPDATE ON public.cash_expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_nonnegative_cash_balance();
