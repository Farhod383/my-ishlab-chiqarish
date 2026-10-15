CREATE TABLE public.cash_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kassa text NOT NULL CHECK (kassa IN ('main','supply')),
  reset_at timestamptz NOT NULL DEFAULT now(),
  comment text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cash_resets TO authenticated;
GRANT ALL ON public.cash_resets TO service_role;
ALTER TABLE public.cash_resets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cash_resets read" ON public.cash_resets FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.cash_reset_at(_kassa text)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT max(reset_at) FROM public.cash_resets WHERE kassa = _kassa), '-infinity'::timestamptz)
$$;

CREATE OR REPLACE FUNCTION public.cash_available(_cur text, _pt text)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT SUM(amount) FROM public.cash_incomes WHERE currency=_cur AND COALESCE(payment_type,'cash')=_pt AND created_at >= public.cash_reset_at('main')),0)
       - COALESCE((SELECT SUM(amount) FROM public.cash_expenses WHERE currency=_cur AND COALESCE(payment_type,'cash')=_pt AND created_at >= public.cash_reset_at('main')),0)
$function$;

-- Old-period income edits/deletes must not be blocked by the new-period balance
CREATE OR REPLACE FUNCTION public.enforce_income_change_balance()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  pt text := COALESCE(OLD.payment_type,'cash');
  cur text := OLD.currency;
  avail numeric;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.currency NOT IN ('UZS','USD') THEN
      RAISE EXCEPTION 'Faqat UZS yoki USD ruxsat etiladi' USING ERRCODE='check_violation';
    END IF;
    IF NEW.currency=cur AND COALESCE(NEW.payment_type,'cash')=pt AND NEW.amount>=OLD.amount THEN
      RETURN NEW;
    END IF;
  END IF;
  IF OLD.created_at < public.cash_reset_at('main') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cash:'||cur||':'||pt));
  avail := public.cash_available(cur, pt) - OLD.amount;
  IF TG_OP='UPDATE' AND NEW.currency=cur AND COALESCE(NEW.payment_type,'cash')=pt THEN
    avail := avail + NEW.amount;
  END IF;
  IF avail < 0 THEN
    RAISE EXCEPTION 'Bu kirimni o''zgartirib/o''chirib bo''lmaydi: % % balansi minusga tushadi (%)', cur, pt, avail
      USING ERRCODE='check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;