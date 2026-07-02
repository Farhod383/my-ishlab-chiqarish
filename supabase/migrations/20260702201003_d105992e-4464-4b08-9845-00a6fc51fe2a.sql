
CREATE TABLE public.vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  neighborhood TEXT,
  birth_date DATE,
  position TEXT,
  department TEXT,
  address TEXT,
  passport TEXT,
  note TEXT,
  resume_url TEXT,
  experience TEXT,
  expected_salary NUMERIC,
  status TEXT NOT NULL DEFAULT 'new',
  hired_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacancies TO authenticated;
GRANT ALL ON public.vacancies TO service_role;

ALTER TABLE public.vacancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read vacancies"
  ON public.vacancies FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR/Admin/Cashier can insert vacancies"
  ON public.vacancies FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'cashier'));

CREATE POLICY "HR/Admin/Cashier can update vacancies"
  ON public.vacancies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'cashier'));

CREATE POLICY "Admin can delete vacancies"
  ON public.vacancies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER vacancies_updated_at
  BEFORE UPDATE ON public.vacancies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
