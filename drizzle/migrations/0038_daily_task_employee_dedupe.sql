CREATE TABLE public.daily_task_employee_aliases (
  alias_id uuid PRIMARY KEY REFERENCES public.employees(id),
  canonical_id uuid NOT NULL REFERENCES public.employees(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (alias_id <> canonical_id)
);
GRANT SELECT ON public.daily_task_employee_aliases TO authenticated;
GRANT ALL ON public.daily_task_employee_aliases TO service_role;
ALTER TABLE public.daily_task_employee_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read aliases" ON public.daily_task_employee_aliases FOR SELECT TO authenticated USING (true);

-- Same person = same normalized name + same phone digits + same position (HR record id kept intact)
WITH e AS (
  SELECT id, created_at,
    public.employee_name_key(full_name) || '|' || right(regexp_replace(coalesce(phone,''),'\D','','g'),9) || '|' ||
    lower(regexp_replace(coalesce(position,''),'[^[:alnum:]]','','g')) AS k,
    (SELECT count(*) FROM public.daily_tasks t WHERE t.employee_id = employees.id) AS n
  FROM public.employees
  WHERE length(regexp_replace(coalesce(phone,''),'\D','','g')) >= 7
), r AS (
  SELECT id, k, first_value(id) OVER (PARTITION BY k ORDER BY n DESC, created_at, id) AS canon,
         count(*) OVER (PARTITION BY k) AS c
  FROM e
)
INSERT INTO public.daily_task_employee_aliases(alias_id, canonical_id, reason)
SELECT id, canon, 'same name+phone+position' FROM r WHERE c > 1 AND id <> canon;

INSERT INTO public.daily_task_history(task_id, action, old_status, new_status, old_progress, new_progress)
SELECT t.id, 'employee_merged', t.status, t.status, t.progress, t.progress
FROM public.daily_tasks t JOIN public.daily_task_employee_aliases a ON a.alias_id = t.employee_id;

ALTER TABLE public.daily_tasks DISABLE TRIGGER USER;
UPDATE public.daily_tasks t SET employee_id = a.canonical_id
FROM public.daily_task_employee_aliases a WHERE a.alias_id = t.employee_id;
ALTER TABLE public.daily_tasks ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.daily_tasks_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.employee_id := COALESCE((SELECT canonical_id FROM daily_task_employee_aliases WHERE alias_id = NEW.employee_id), NEW.employee_id);
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
END $function$;