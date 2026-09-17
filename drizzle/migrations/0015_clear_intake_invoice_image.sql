CREATE OR REPLACE FUNCTION public.clear_intake_invoice_image(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'warehouse')) THEN
    RAISE EXCEPTION 'Ruxsat yo''q';
  END IF;
  UPDATE public.intake_sessions SET image_url = NULL WHERE id = _session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_intake_invoice_image(uuid) TO authenticated;