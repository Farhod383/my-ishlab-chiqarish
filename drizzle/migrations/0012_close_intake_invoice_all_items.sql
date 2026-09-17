CREATE OR REPLACE FUNCTION public.close_intake_invoice(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.intake_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.intake_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nakladnoy topilmadi';
  END IF;
  IF s.status = 'finalized' THEN
    RAISE EXCEPTION 'Bu nakladnoy allaqachon yakunlangan';
  END IF;

  -- Boshqa yopilmagan sessiyalardagi barcha mahsulotlarni shu nakladnoyga biriktirish
  UPDATE public.intake_items i
     SET session_id = _session_id
    FROM public.intake_sessions o
   WHERE i.session_id = o.id
     AND o.id <> _session_id
     AND o.status <> 'finalized';

  -- Bo'shab qolgan yopilmagan sessiyalarni olib tashlash
  DELETE FROM public.intake_sessions o
   WHERE o.id <> _session_id
     AND o.status <> 'finalized'
     AND NOT EXISTS (SELECT 1 FROM public.intake_items i WHERE i.session_id = o.id);

  UPDATE public.intake_sessions
     SET status = 'pending_photo',
         finished_at = COALESCE(finished_at, now())
   WHERE id = _session_id
     AND status = 'open';

  PERFORM public.finalize_intake_session(_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_intake_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_intake_invoice(uuid) TO service_role;