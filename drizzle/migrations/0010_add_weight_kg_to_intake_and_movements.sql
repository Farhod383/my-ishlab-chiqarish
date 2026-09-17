ALTER TABLE public.intake_items ADD COLUMN IF NOT EXISTS weight_kg numeric;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS weight_kg numeric;

CREATE OR REPLACE FUNCTION public.finalize_intake_session(_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.intake_sessions%ROWTYPE;
  it public.intake_items%ROWTYPE;
  pid uuid;
  uid uuid := auth.uid();
BEGIN
  SELECT * INTO s FROM public.intake_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nakladnoy topilmadi';
  END IF;
  IF s.status = 'finalized' THEN
    RAISE EXCEPTION 'Bu nakladnoy allaqachon yakunlangan';
  END IF;
  IF s.image_url IS NULL OR length(trim(s.image_url)) = 0 THEN
    RAISE EXCEPTION 'Nakladnoy rasmi majburiy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intake_items WHERE session_id = _session_id) THEN
    RAISE EXCEPTION 'Nakladnoyda mahsulot yo''q';
  END IF;

  FOR it IN SELECT * FROM public.intake_items WHERE session_id = _session_id ORDER BY created_at LOOP
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE intake_item_id = it.id) THEN
      CONTINUE;
    END IF;

    pid := it.product_id;
    IF pid IS NULL THEN
      SELECT id INTO pid FROM public.products WHERE lower(name) = lower(trim(it.product_name)) LIMIT 1;
    END IF;
    IF pid IS NULL THEN
      INSERT INTO public.products (name, unit, last_price, currency, source, phone, image_url)
      VALUES (trim(it.product_name), COALESCE(it.unit, 'dona'), COALESCE(it.unit_price, 0),
              COALESCE(it.currency, 'UZS'), it.source, it.phone, it.image_url)
      RETURNING id INTO pid;
      UPDATE public.intake_items SET product_id = pid WHERE id = it.id;
    END IF;

    INSERT INTO public.stock_movements (
      product_id, order_id, direction, quantity, unit_price, currency,
      recipient_name, source, phone, image_url, location, comment,
      created_by, intake_session_id, intake_item_id, weight_kg
    ) VALUES (
      pid, it.order_id, 'in', it.quantity, it.unit_price, COALESCE(it.currency, 'UZS'),
      s.supplier, it.source, it.phone, it.image_url, COALESCE(it.location, 'Zavod'),
      COALESCE(it.comment, 'Nakladnoy: ' || to_char(s.started_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI')),
      COALESCE(s.created_by, uid), s.id, it.id, it.weight_kg
    );
  END LOOP;

  UPDATE public.intake_sessions
    SET status = 'finalized',
        finished_at = COALESCE(finished_at, now()),
        finalized_at = now()
    WHERE id = _session_id;
END;
$function$;