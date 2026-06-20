
-- Restrict employee deactivation/delete to admin and cashier only.
-- HR can still create and edit non-status fields. Other roles remain read-only.

DROP POLICY IF EXISTS employees_manage ON public.employees;

CREATE POLICY employees_insert ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'cashier')
  );

CREATE POLICY employees_update ON public.employees
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'cashier')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'cashier')
  );

CREATE POLICY employees_delete ON public.employees
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'cashier')
  );

-- Trigger: only admin/cashier may deactivate (set status='inactive' or set leave_date)
CREATE OR REPLACE FUNCTION public.enforce_employee_deactivation_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_priv boolean;
  status_changed_to_inactive boolean;
  leave_date_set boolean;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  is_priv := public.has_role(uid, 'admin') OR public.has_role(uid, 'cashier');

  status_changed_to_inactive := (TG_OP = 'UPDATE'
                                 AND COALESCE(OLD.status,'active') = 'active'
                                 AND COALESCE(NEW.status,'active') <> 'active')
                             OR (TG_OP = 'INSERT'
                                 AND COALESCE(NEW.status,'active') <> 'active');

  leave_date_set := (TG_OP = 'UPDATE'
                     AND OLD.leave_date IS NULL
                     AND NEW.leave_date IS NOT NULL)
                  OR (TG_OP = 'INSERT' AND NEW.leave_date IS NOT NULL);

  IF (status_changed_to_inactive OR leave_date_set) AND NOT is_priv THEN
    RAISE EXCEPTION 'Faqat Admin yoki Kassir xodimni bo''shata oladi'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employee_deactivation_role ON public.employees;
CREATE TRIGGER trg_enforce_employee_deactivation_role
BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_deactivation_role();
