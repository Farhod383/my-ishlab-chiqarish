-- Mijozga STIR (INN) — 1C:УК kontragenti bilan bog'lash uchun; Shassi ↔ 1C almashinuvi jurnali.
-- Mavjud ma'lumot o'zgarmaydi: faqat yangi ustun, jadval va indekslar.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS inn text;
DO $$ BEGIN
  ALTER TABLE public.clients ADD CONSTRAINT clients_inn_format CHECK (inn IS NULL OR inn ~ '^([0-9]{9}|[0-9]{14})$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS clients_inn_uq ON public.clients(inn) WHERE inn IS NOT NULL;

-- 1C dagi qabul hujjati (Приходная накладная, «Прием в переработку») havolasi
ALTER TABLE public.chassis ADD COLUMN IF NOT EXISTS onec_intake_ref text;

-- Almashinuv jurnali: har bir yuborish urinishi
CREATE TABLE IF NOT EXISTS public.integration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('erp_to_1c', '1c_to_erp')),
  entity text NOT NULL,                 -- chassis_intake, chassis_act, ...
  erp_id uuid,
  onec_ref text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'error', 'skipped')),
  attempts int NOT NULL DEFAULT 0,
  request jsonb,
  response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_log_erp_idx ON public.integration_log(entity, erp_id, created_at DESC);
CREATE INDEX IF NOT EXISTS integration_log_status_idx ON public.integration_log(status) WHERE status IN ('pending', 'error');
ALTER TABLE public.integration_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_log_select ON public.integration_log;
CREATE POLICY integration_log_select ON public.integration_log FOR SELECT TO authenticated USING ((SELECT public.chassis_can_view()));
GRANT SELECT ON public.integration_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.integration_log FROM authenticated, anon;
