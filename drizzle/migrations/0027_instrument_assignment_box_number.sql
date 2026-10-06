ALTER TABLE public.instrument_assignments ADD COLUMN IF NOT EXISTS box_number text;
CREATE INDEX IF NOT EXISTS idx_instrument_assignments_box ON public.instrument_assignments (lower(box_number));