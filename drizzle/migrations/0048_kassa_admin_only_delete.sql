DROP POLICY IF EXISTS cash_manage ON public.cash_expenses;
CREATE POLICY cash_manage_ins ON public.cash_expenses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));
CREATE POLICY cash_manage_upd ON public.cash_expenses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));
CREATE POLICY cash_admin_delete ON public.cash_expenses FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS income_manage ON public.cash_incomes;
CREATE POLICY income_manage_sel ON public.cash_incomes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));
CREATE POLICY income_manage_ins ON public.cash_incomes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));
CREATE POLICY income_manage_upd ON public.cash_incomes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='chief_accountant'));
CREATE POLICY income_admin_delete ON public.cash_incomes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.audit_cash_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_TABLE_NAME = 'cash_expenses' THEN
    UPDATE public.business_trips SET cash_expense_id = NULL WHERE cash_expense_id = OLD.id;
  END IF;
  INSERT INTO public.entity_audit(entity, entity_id, action, old_value, actor_id, actor_name)
  VALUES (CASE WHEN TG_TABLE_NAME='cash_incomes' THEN 'cash_income' ELSE 'cash_expense' END, OLD.id,
          CASE WHEN TG_TABLE_NAME='cash_incomes' THEN 'Kassa kirimi o''chirildi' ELSE 'Kassa chiqimi o''chirildi' END,
          to_jsonb(OLD), auth.uid(), (SELECT full_name FROM public.profiles WHERE id=auth.uid()));
  RETURN OLD;
END $$;
CREATE TRIGGER trg_cash_income_delete_audit AFTER DELETE ON public.cash_incomes FOR EACH ROW EXECUTE FUNCTION public.audit_cash_delete();
CREATE TRIGGER trg_cash_expense_delete_audit AFTER DELETE ON public.cash_expenses FOR EACH ROW EXECUTE FUNCTION public.audit_cash_delete();