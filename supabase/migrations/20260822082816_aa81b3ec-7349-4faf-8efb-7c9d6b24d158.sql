
-- Shifts
CREATE TABLE public.face_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  grace_minutes integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.face_shifts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.face_shifts TO authenticated;
GRANT ALL ON public.face_shifts TO service_role;
ALTER TABLE public.face_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fs_read ON public.face_shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY fs_write ON public.face_shifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

-- Devices
CREATE TABLE public.face_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  site text NOT NULL CHECK (site IN ('zavod','office')),
  ip_address text,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('online','offline','unknown')),
  last_sync_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.face_devices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.face_devices TO authenticated;
GRANT ALL ON public.face_devices TO service_role;
ALTER TABLE public.face_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY fd_read ON public.face_devices FOR SELECT TO authenticated USING (true);
CREATE POLICY fd_write ON public.face_devices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE TRIGGER trg_face_devices_updated BEFORE UPDATE ON public.face_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Employee linkage (no separate employee base)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hikvision_person_id text,
  ADD COLUMN IF NOT EXISTS work_site text,
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.face_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_url text;
CREATE UNIQUE INDEX IF NOT EXISTS employees_hikvision_person_uidx
  ON public.employees (hikvision_person_id) WHERE hikvision_person_id IS NOT NULL;

-- Raw events from devices
CREATE TABLE public.face_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.face_devices(id) ON DELETE SET NULL,
  site text NOT NULL CHECK (site IN ('zavod','office')),
  person_code text NOT NULL,
  person_name text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  event_time timestamptz NOT NULL,
  work_date date NOT NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX face_events_dedupe_uidx
  ON public.face_events (site, person_code, direction, event_time);
CREATE INDEX face_events_emp_date_idx ON public.face_events (employee_id, work_date);
GRANT SELECT ON public.face_events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.face_events TO authenticated;
GRANT ALL ON public.face_events TO service_role;
ALTER TABLE public.face_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fe_read ON public.face_events FOR SELECT TO authenticated USING (true);
CREATE POLICY fe_write ON public.face_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

INSERT INTO public.face_shifts (name, start_time, end_time, crosses_midnight)
VALUES ('1-smena (Kunduzgi)', '08:00', '17:00', false),
       ('2-smena (Tungi)', '20:00', '05:00', true);

INSERT INTO public.face_devices (name, site, ip_address)
VALUES ('ZAVOD terminali', 'zavod', '192.168.1.6'),
       ('OFFICE terminali', 'office', '192.168.1.232');
