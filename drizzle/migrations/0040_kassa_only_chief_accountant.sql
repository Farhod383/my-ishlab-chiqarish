-- Kassa write access: only Admin and Glavniy buxgalter (chief_accountant). Plain cashier keeps only trip (Kamandirovka) cash rows.
DROP POLICY IF EXISTS cash_manage ON public.cash_expenses;
CREATE POLICY cash_manage ON public.cash_expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));
CREATE POLICY cash_trip_manage ON public.cash_expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'cashier') AND reason ILIKE 'Kamandirovka%')
  WITH CHECK (public.has_role(auth.uid(),'cashier') AND reason ILIKE 'Kamandirovka%');

DROP POLICY IF EXISTS income_manage ON public.cash_incomes;
CREATE POLICY income_manage ON public.cash_incomes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));

DROP POLICY IF EXISTS cash_expense_reasons_update ON public.cash_expense_reasons;
CREATE POLICY cash_expense_reasons_update ON public.cash_expense_reasons FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));
DROP POLICY IF EXISTS cash_expense_reasons_insert ON public.cash_expense_reasons;
CREATE POLICY cash_expense_reasons_insert ON public.cash_expense_reasons FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));

DROP POLICY IF EXISTS debts_insert ON public.debts;
CREATE POLICY debts_insert ON public.debts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));
DROP POLICY IF EXISTS debts_update ON public.debts;
CREATE POLICY debts_update ON public.debts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));
DROP POLICY IF EXISTS debts_delete ON public.debts;
CREATE POLICY debts_delete ON public.debts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));

CREATE OR REPLACE FUNCTION public.cash_exchange(_from_cur text, _from_pt text, _from_amount numeric, _to_cur text, _to_pt text, _rate numeric, _comment text, _actor_name text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  to_amount numeric; usd_rate numeric; from_uzs numeric;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role='chief_accountant')) THEN
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
END $function$;