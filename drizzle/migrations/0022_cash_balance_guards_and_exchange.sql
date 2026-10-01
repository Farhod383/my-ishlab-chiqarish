CREATE OR REPLACE FUNCTION public.cash_available(_cur text, _pt text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT SUM(amount) FROM public.cash_incomes WHERE currency=_cur AND COALESCE(payment_type,'cash')=_pt),0)
       - COALESCE((SELECT SUM(amount) FROM public.cash_expenses WHERE currency=_cur AND COALESCE(payment_type,'cash')=_pt),0)
$$;
GRANT EXECUTE ON FUNCTION public.cash_available(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_nonnegative_cash_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pt text := COALESCE(NEW.payment_type,'cash');
  cur text := COALESCE(NEW.currency,'UZS');
  avail numeric;
BEGIN
  IF NEW.currency NOT IN ('UZS','USD') THEN
    RAISE EXCEPTION 'Faqat UZS yoki USD ruxsat etiladi' USING ERRCODE='check_violation';
  END IF;
  IF COALESCE(NEW.amount,0) <= 0 THEN
    RAISE EXCEPTION 'Summa 0 dan katta bo''lishi kerak' USING ERRCODE='check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cash:'||cur||':'||pt));
  avail := public.cash_available(cur, pt);
  IF TG_OP='UPDATE' AND OLD.currency=cur AND COALESCE(OLD.payment_type,'cash')=pt THEN
    avail := avail + COALESCE(OLD.amount,0);
  END IF;
  IF avail - NEW.amount < 0 THEN
    RAISE EXCEPTION 'Mablag'' yetarli emas: % % (% balansida mavjud: %)', NEW.amount, cur, pt, avail
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_income_change_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

DROP TRIGGER IF EXISTS enforce_income_change_trg ON public.cash_incomes;
CREATE TRIGGER enforce_income_change_trg BEFORE UPDATE OR DELETE ON public.cash_incomes
FOR EACH ROW EXECUTE FUNCTION public.enforce_income_change_balance();

CREATE OR REPLACE FUNCTION public.cash_exchange(
  _from_cur text, _from_pt text, _from_amount numeric,
  _to_cur text, _to_pt text, _rate numeric, _comment text, _actor_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  to_amount numeric; usd_rate numeric; from_uzs numeric;
BEGIN
  IF NOT (has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Ruxsat yo''q' USING ERRCODE='insufficient_privilege';
  END IF;
  IF _from_cur NOT IN ('UZS','USD') OR _to_cur NOT IN ('UZS','USD') OR _from_cur=_to_cur THEN
    RAISE EXCEPTION 'Valyutalar UZS va USD bo''lishi va farqli bo''lishi kerak';
  END IF;
  IF COALESCE(_from_amount,0)<=0 OR COALESCE(_rate,0)<=0 THEN
    RAISE EXCEPTION 'Summa va kurs 0 dan katta bo''lishi kerak';
  END IF;
  usd_rate := _rate;
  IF _from_cur='USD' THEN to_amount := round(_from_amount*_rate, 2); from_uzs := to_amount;
  ELSE to_amount := round(_from_amount/_rate, 2); from_uzs := _from_amount; END IF;

  INSERT INTO public.cash_expenses(amount,currency,exchange_rate,total_uzs,reason,payment_type,comment,recipient_name,created_by)
  VALUES(_from_amount,_from_cur, CASE WHEN _from_cur='USD' THEN usd_rate ELSE 1 END, from_uzs,
         'Valyuta almashtirish', COALESCE(_from_pt,'cash'),
         concat_ws(' · ', _from_amount||' '||_from_cur||' → '||to_amount||' '||_to_cur||' (kurs '||_rate||')', NULLIF(_comment,'')),
         _actor_name, auth.uid());
  INSERT INTO public.cash_incomes(amount,currency,exchange_rate,total_uzs,source,payment_type,comment,created_by)
  VALUES(to_amount,_to_cur, CASE WHEN _to_cur='USD' THEN usd_rate ELSE 1 END, from_uzs,
         'Valyuta almashtirish', COALESCE(_to_pt,'cash'),
         concat_ws(' · ', _from_amount||' '||_from_cur||' → '||to_amount||' '||_to_cur||' (kurs '||_rate||')', NULLIF(_comment,'')),
         auth.uid());
END $$;
GRANT EXECUTE ON FUNCTION public.cash_exchange(text,text,numeric,text,text,numeric,text,text) TO authenticated;

INSERT INTO public.cash_expense_reasons(name, sort_order) VALUES ('Valyuta almashtirish', 160) ON CONFLICT (name) DO NOTHING;