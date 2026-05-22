-- Instruments table
CREATE TABLE public.instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  inventory_number TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY instruments_read_all ON public.instruments FOR SELECT TO authenticated USING (true);
CREATE POLICY instruments_manage ON public.instruments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'warehouse'::app_role) OR has_role(auth.uid(),'cashier'::app_role) OR has_role(auth.uid(),'hr'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'warehouse'::app_role) OR has_role(auth.uid(),'cashier'::app_role) OR has_role(auth.uid(),'hr'::app_role));

-- Assignments table
CREATE TABLE public.instrument_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 1,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at TIMESTAMPTZ,
  issue_comment TEXT,
  return_comment TEXT,
  issued_by UUID,
  returned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instrument_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ia_read_all ON public.instrument_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY ia_manage ON public.instrument_assignments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'warehouse'::app_role) OR has_role(auth.uid(),'cashier'::app_role) OR has_role(auth.uid(),'hr'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'warehouse'::app_role) OR has_role(auth.uid(),'cashier'::app_role) OR has_role(auth.uid(),'hr'::app_role));

-- Trigger: adjust instrument quantity on issue/return
CREATE OR REPLACE FUNCTION public.apply_instrument_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.returned_at IS NULL THEN
      UPDATE public.instruments SET quantity = quantity - NEW.quantity WHERE id = NEW.instrument_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.returned_at IS NULL AND NEW.returned_at IS NOT NULL THEN
      UPDATE public.instruments SET quantity = quantity + NEW.quantity WHERE id = NEW.instrument_id;
    ELSIF OLD.returned_at IS NOT NULL AND NEW.returned_at IS NULL THEN
      UPDATE public.instruments SET quantity = quantity - NEW.quantity WHERE id = NEW.instrument_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.returned_at IS NULL THEN
      UPDATE public.instruments SET quantity = quantity + OLD.quantity WHERE id = OLD.instrument_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_instrument_assignment
AFTER INSERT OR UPDATE OR DELETE ON public.instrument_assignments
FOR EACH ROW EXECUTE FUNCTION public.apply_instrument_assignment();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_instruments_updated_at BEFORE UPDATE ON public.instruments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.instruments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instrument_assignments;