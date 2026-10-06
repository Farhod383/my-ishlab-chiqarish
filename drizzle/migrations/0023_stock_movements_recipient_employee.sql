ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS recipient_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_recipient_emp ON public.stock_movements(recipient_employee_id);
-- Backfill only where the stored name maps to exactly one employee (no guessing between namesakes)
UPDATE public.stock_movements sm SET recipient_employee_id = e.id
FROM public.employees e
WHERE sm.recipient_employee_id IS NULL AND sm.direction = 'out'
  AND lower(trim(e.full_name)) = lower(trim(sm.recipient_name))
  AND (SELECT count(*) FROM public.employees e2 WHERE lower(trim(e2.full_name)) = lower(trim(sm.recipient_name))) = 1;
CREATE OR REPLACE VIEW public.employee_integrity_issues WITH (security_invoker = true) AS
SELECT 'duplicate_name'::text AS issue, lower(trim(full_name)) AS detail, count(*)::int AS cnt
FROM public.employees GROUP BY lower(trim(full_name)) HAVING count(*) > 1
UNION ALL
SELECT 'movement_without_employee_link', recipient_name, count(*)::int
FROM public.stock_movements WHERE direction='out' AND recipient_employee_id IS NULL AND recipient_name IS NOT NULL AND recipient_name <> 'Qoldiq tuzatish'
GROUP BY recipient_name;
GRANT SELECT ON public.employee_integrity_issues TO authenticated;