-- Kamandirovka (xizmat safari) moduli
CREATE TABLE public.business_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  assignee_user_id uuid,
  destination text NOT NULL,
  purpose text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  distance_km numeric NOT NULL DEFAULT 0,
  given_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UZS',
  returned_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  comment text,
  cash_expense_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.business_trip_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.business_trips(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UZS',
  comment text,
  receipt_url text,
  spent_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_trips_assignee ON public.business_trips(assignee_user_id);
CREATE INDEX idx_business_trip_expenses_trip ON public.business_trip_expenses(trip_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_trips TO authenticated;
GRANT ALL ON public.business_trips TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_trip_expenses TO authenticated;
GRANT ALL ON public.business_trip_expenses TO service_role;

-- helper: kamandirovka menikimi?
CREATE OR REPLACE FUNCTION public.can_manage_trips(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'cashier'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.is_my_trip(_trip uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_trips t
    WHERE t.id = _trip AND (t.assignee_user_id = _user OR t.created_by = _user)
  )
$$;

ALTER TABLE public.business_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_trip_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY trips_select ON public.business_trips FOR SELECT TO authenticated
  USING (public.can_manage_trips(auth.uid()) OR assignee_user_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY trips_insert ON public.business_trips FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_trips(auth.uid()));
CREATE POLICY trips_update ON public.business_trips FOR UPDATE TO authenticated
  USING (public.can_manage_trips(auth.uid()) OR assignee_user_id = auth.uid())
  WITH CHECK (public.can_manage_trips(auth.uid()) OR assignee_user_id = auth.uid());
CREATE POLICY trips_delete ON public.business_trips FOR DELETE TO authenticated
  USING (public.can_manage_trips(auth.uid()));

CREATE POLICY trip_exp_select ON public.business_trip_expenses FOR SELECT TO authenticated
  USING (public.can_manage_trips(auth.uid()) OR public.is_my_trip(trip_id, auth.uid()));
CREATE POLICY trip_exp_insert ON public.business_trip_expenses FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_trips(auth.uid()) OR public.is_my_trip(trip_id, auth.uid()));
CREATE POLICY trip_exp_update ON public.business_trip_expenses FOR UPDATE TO authenticated
  USING (public.can_manage_trips(auth.uid()) OR public.is_my_trip(trip_id, auth.uid()))
  WITH CHECK (public.can_manage_trips(auth.uid()) OR public.is_my_trip(trip_id, auth.uid()));
CREATE POLICY trip_exp_delete ON public.business_trip_expenses FOR DELETE TO authenticated
  USING (public.can_manage_trips(auth.uid()) OR public.is_my_trip(trip_id, auth.uid()));

CREATE TRIGGER trg_business_trips_updated BEFORE UPDATE ON public.business_trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
