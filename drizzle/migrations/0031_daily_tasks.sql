CREATE TABLE public.daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tashkent')::date),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  assigned_by uuid DEFAULT auth.uid(),
  assigned_by_name text,
  task_title text NOT NULL,
  description text,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','closed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX daily_tasks_date_idx ON public.daily_tasks(task_date);
CREATE UNIQUE INDEX daily_tasks_one_open_per_employee ON public.daily_tasks(employee_id) WHERE status = 'in_progress';

CREATE TABLE public.daily_task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.daily_tasks(id) ON DELETE CASCADE,
  action text NOT NULL,
  old_progress integer, new_progress integer,
  old_status text, new_status text,
  actor_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.daily_tasks TO authenticated;
GRANT ALL ON public.daily_tasks TO service_role;
GRANT SELECT ON public.daily_task_history TO authenticated;
GRANT ALL ON public.daily_task_history TO service_role;
ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_task_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_daily_tasks(_u uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_u,'admin') OR public.has_role(_u,'otk') OR public.has_role(_u,'manager')
$$;

CREATE POLICY "dt select" ON public.daily_tasks FOR SELECT TO authenticated USING (public.can_manage_daily_tasks(auth.uid()));
CREATE POLICY "dt insert" ON public.daily_tasks FOR INSERT TO authenticated WITH CHECK (public.can_manage_daily_tasks(auth.uid()));
CREATE POLICY "dt update" ON public.daily_tasks FOR UPDATE TO authenticated USING (public.can_manage_daily_tasks(auth.uid())) WITH CHECK (public.can_manage_daily_tasks(auth.uid()));
CREATE POLICY "dth select" ON public.daily_task_history FOR SELECT TO authenticated USING (public.can_manage_daily_tasks(auth.uid()));

CREATE OR REPLACE FUNCTION public.daily_tasks_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.assigned_by := COALESCE(auth.uid(), NEW.assigned_by);
    NEW.status := 'in_progress';
    PERFORM pg_advisory_xact_lock(hashtext('daily_task:'||NEW.employee_id::text));
    IF EXISTS (SELECT 1 FROM daily_tasks WHERE employee_id = NEW.employee_id AND status = 'in_progress') THEN
      RAISE EXCEPTION 'Bu xodimning joriy topshirig''i hali yopilmagan. Avval mavjud topshiriqni yakunlang.' USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM employees WHERE id = NEW.employee_id AND COALESCE(status,'active') = 'active') THEN
      RAISE EXCEPTION 'Xodim faol emas.';
    END IF;
  ELSE
    IF NEW.employee_id <> OLD.employee_id OR NEW.task_date <> OLD.task_date THEN
      RAISE EXCEPTION 'Topshiriq xodimi va sanasini o''zgartirib bo''lmaydi.';
    END IF;
    IF NEW.status = 'in_progress' AND OLD.status <> 'in_progress' THEN
      PERFORM pg_advisory_xact_lock(hashtext('daily_task:'||NEW.employee_id::text));
      IF EXISTS (SELECT 1 FROM daily_tasks WHERE employee_id = NEW.employee_id AND status = 'in_progress' AND id <> NEW.id) THEN
        RAISE EXCEPTION 'Bu xodimning joriy topshirig''i hali yopilmagan. Avval mavjud topshiriqni yakunlang.' USING ERRCODE = '23505';
      END IF;
      NEW.closed_at := NULL;
    ELSIF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      NEW.closed_at := now();
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_daily_tasks_guard BEFORE INSERT OR UPDATE ON public.daily_tasks FOR EACH ROW EXECUTE FUNCTION public.daily_tasks_guard();

CREATE OR REPLACE FUNCTION public.daily_tasks_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO daily_task_history(task_id, action, new_progress, new_status) VALUES (NEW.id, 'create', NEW.progress, NEW.status);
  ELSIF NEW.progress IS DISTINCT FROM OLD.progress OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO daily_task_history(task_id, action, old_progress, new_progress, old_status, new_status)
    VALUES (NEW.id, CASE WHEN NEW.status <> OLD.status THEN 'status' ELSE 'progress' END, OLD.progress, NEW.progress, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_daily_tasks_log AFTER INSERT OR UPDATE ON public.daily_tasks FOR EACH ROW EXECUTE FUNCTION public.daily_tasks_log();