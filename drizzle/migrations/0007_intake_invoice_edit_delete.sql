-- Nakladnoyni tahrirlash/o'chirish uchun xavfsiz funksiyalar
CREATE OR REPLACE FUNCTION public.can_edit_intake(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'warehouse');
$$;

-- Sessiya (Nakladnoy) sarlavha ma'lumotlarini tahrirlash: rasm va yetkazib beruvchi
CREATE OR REPLACE FUNCTION public.update_intake_invoice(
  _session_id uuid,
  _supplier text DEFAULT NULL,
  _image_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.intake_sessions%ROWTYPE;
  uid uuid := auth.uid();
BEGIN
  IF NOT public.can_edit_intake(uid) THEN
    RAISE EXCEPTION 'Ruxsat yo''q';
  END IF;
  SELECT * INTO s FROM public.intake_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nakladnoy topilmadi'; END IF;

  UPDATE public.intake_sessions
    SET supplier = COALESCE(NULLIF(trim(COALESCE(_supplier, '')), ''), supplier),
        image_url = COALESCE(NULLIF(trim(COALESCE(_image_url, '')), ''), image_url),
        updated_at = now()
  WHERE id = _session_id;

  INSERT INTO public.entity_audit (entity, entity_id, action, old_value, new_value, actor_id)
  VALUES ('intake_session', _session_id, 'Nakladnoy tahrirlandi',
          jsonb_build_object('supplier', s.supplier, 'image_url', s.image_url),
          jsonb_build_object('supplier', COALESCE(NULLIF(trim(COALESCE(_supplier,'')),''), s.supplier),
                             'image_url', COALESCE(NULLIF(trim(COALESCE(_image_url,'')),''), s.image_url)),
          uid);
END;
$$;

-- Nakladnoy qatorini tahrirlash; yakunlangan bo'lsa sklad qoldig'i ham to'g'rilanadi
CREATE OR REPLACE FUNCTION public.update_intake_invoice_item(
  _item_id uuid,
  _quantity numeric,
  _unit_price numeric,
  _currency text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it public.intake_items%ROWTYPE;
  mv public.stock_movements%ROWTYPE;
  uid uuid := auth.uid();
  delta numeric;
BEGIN
  IF NOT public.can_edit_intake(uid) THEN
    RAISE EXCEPTION 'Ruxsat yo''q';
  END IF;
  IF _quantity IS NULL OR _quantity < 0 THEN
    RAISE EXCEPTION 'Miqdor noto''g''ri';
  END IF;

  SELECT * INTO it FROM public.intake_items WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Qator topilmadi'; END IF;

  SELECT * INTO mv FROM public.stock_movements WHERE intake_item_id = _item_id FOR UPDATE;
  IF FOUND THEN
    delta := _quantity - COALESCE(mv.quantity, 0);
    IF mv.product_id IS NOT NULL AND delta <> 0 THEN
      UPDATE public.products
        SET stock_qty = GREATEST(0, COALESCE(stock_qty, 0) + delta)
      WHERE id = mv.product_id;
    END IF;
    UPDATE public.stock_movements
      SET quantity = _quantity,
          unit_price = COALESCE(_unit_price, unit_price),
          currency = COALESCE(NULLIF(trim(COALESCE(_currency, '')), ''), currency)
    WHERE id = mv.id;
  END IF;

  UPDATE public.intake_items
    SET quantity = _quantity,
        unit_price = COALESCE(_unit_price, unit_price),
        currency = COALESCE(NULLIF(trim(COALESCE(_currency, '')), ''), currency)
  WHERE id = _item_id;

  INSERT INTO public.entity_audit (entity, entity_id, action, old_value, new_value, actor_id)
  VALUES ('intake_item', _item_id, 'Nakladnoy qatori tahrirlandi',
          jsonb_build_object('product', it.product_name, 'quantity', it.quantity, 'unit_price', it.unit_price, 'currency', it.currency),
          jsonb_build_object('product', it.product_name, 'quantity', _quantity, 'unit_price', COALESCE(_unit_price, it.unit_price), 'currency', COALESCE(NULLIF(trim(COALESCE(_currency,'')),''), it.currency)),
          uid);
END;
$$;

-- Nakladnoy qatorini o'chirish; skladga tushgan bo'lsa qoldiq qaytariladi
CREATE OR REPLACE FUNCTION public.delete_intake_invoice_item(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it public.intake_items%ROWTYPE;
  mv public.stock_movements%ROWTYPE;
  uid uuid := auth.uid();
BEGIN
  IF NOT public.can_edit_intake(uid) THEN
    RAISE EXCEPTION 'Ruxsat yo''q';
  END IF;
  SELECT * INTO it FROM public.intake_items WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO mv FROM public.stock_movements WHERE intake_item_id = _item_id FOR UPDATE;
  IF FOUND THEN
    IF mv.product_id IS NOT NULL THEN
      UPDATE public.products
        SET stock_qty = GREATEST(0, COALESCE(stock_qty, 0) - COALESCE(mv.quantity, 0))
      WHERE id = mv.product_id;
    END IF;
    DELETE FROM public.stock_movements WHERE id = mv.id;
  END IF;

  DELETE FROM public.intake_items WHERE id = _item_id;

  INSERT INTO public.entity_audit (entity, entity_id, action, old_value, new_value, actor_id)
  VALUES ('intake_item', _item_id, 'Nakladnoy qatori o''chirildi',
          jsonb_build_object('product', it.product_name, 'quantity', it.quantity, 'unit_price', it.unit_price, 'session_id', it.session_id),
          NULL, uid);
END;
$$;

-- Butun Nakladnoyni o'chirish; qoldiq qaytariladi, duplicate hosil bo'lmaydi
CREATE OR REPLACE FUNCTION public.delete_intake_invoice(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.intake_sessions%ROWTYPE;
  mv RECORD;
  uid uuid := auth.uid();
  cnt integer := 0;
BEGIN
  IF NOT public.can_edit_intake(uid) THEN
    RAISE EXCEPTION 'Ruxsat yo''q';
  END IF;
  SELECT * INTO s FROM public.intake_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  FOR mv IN SELECT * FROM public.stock_movements WHERE intake_session_id = _session_id FOR UPDATE LOOP
    IF mv.product_id IS NOT NULL AND mv.direction = 'in' THEN
      UPDATE public.products
        SET stock_qty = GREATEST(0, COALESCE(stock_qty, 0) - COALESCE(mv.quantity, 0))
      WHERE id = mv.product_id;
    END IF;
    DELETE FROM public.stock_movements WHERE id = mv.id;
    cnt := cnt + 1;
  END LOOP;

  DELETE FROM public.intake_items WHERE session_id = _session_id;
  DELETE FROM public.intake_sessions WHERE id = _session_id;

  INSERT INTO public.entity_audit (entity, entity_id, action, old_value, new_value, actor_id)
  VALUES ('intake_session', _session_id, 'Nakladnoy o''chirildi',
          jsonb_build_object('started_at', s.started_at, 'supplier', s.supplier, 'status', s.status, 'movements', cnt),
          NULL, uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_intake(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_intake_invoice(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_intake_invoice_item(uuid, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_intake_invoice_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_intake_invoice(uuid) TO authenticated;