CREATE OR REPLACE FUNCTION public.prevent_employee_delete_with_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM stock_movements WHERE recipient_employee_id = OLD.id)
     OR EXISTS (SELECT 1 FROM instrument_assignments WHERE employee_id = OLD.id)
     OR EXISTS (SELECT 1 FROM attendance WHERE employee_id = OLD.id)
     OR EXISTS (SELECT 1 FROM cash_expenses WHERE recipient_id = OLD.id)
     OR EXISTS (SELECT 1 FROM defects WHERE detected_by_id = OLD.id)
     OR EXISTS (SELECT 1 FROM returns WHERE returned_by_id = OLD.id)
     OR EXISTS (SELECT 1 FROM business_trips WHERE employee_id = OLD.id)
     OR EXISTS (SELECT 1 FROM face_events WHERE employee_id = OLD.id) THEN
    RAISE EXCEPTION 'Xodimning tarixi bor — o''chirib bo''lmaydi, "Bo''shagan" holatiga o''tkazing';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_employee_delete ON public.employees;
CREATE TRIGGER trg_prevent_employee_delete BEFORE DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.prevent_employee_delete_with_history();