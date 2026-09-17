CREATE OR REPLACE FUNCTION public.metal_consume_product(
  _product_id uuid,
  _pieces numeric,
  _kg_per_piece numeric,
  _order_id uuid,
  _comment text,
  _actor_name text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.products%ROWTYPE;
  used_kg numeric;
  avail_kg numeric;
  qty_in_unit numeric;
  u text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer')) THEN
    RAISE EXCEPTION 'Metall sarfiga ruxsat yo''q';
  END IF;

  SELECT * INTO p FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mahsulot topilmadi';
  END IF;
  IF _pieces IS NULL OR _pieces <= 0 THEN
    RAISE EXCEPTION 'Dona soni noto''g''ri';
  END IF;
  IF _kg_per_piece IS NULL OR _kg_per_piece <= 0 THEN
    RAISE EXCEPTION '1 dona uchun kg normativi tanlanmagan';
  END IF;

  u := lower(coalesce(p.unit, 'dona'));
  used_kg := _pieces * _kg_per_piece;

  avail_kg := CASE u
    WHEN 'tonna' THEN COALESCE(p.stock_qty, 0) * 1000
    WHEN 'kg' THEN COALESCE(p.stock_qty, 0)
    ELSE COALESCE(p.stock_qty, 0) * COALESCE(NULLIF(p.weight_kg, 0), _kg_per_piece)
  END;

  IF used_kg > avail_kg + 0.001 THEN
    RAISE EXCEPTION 'Qoldiq yetarli emas: % kg', round(avail_kg, 2);
  END IF;

  qty_in_unit := CASE u
    WHEN 'tonna' THEN used_kg / 1000
    WHEN 'kg' THEN used_kg
    ELSE _pieces
  END;

  INSERT INTO public.stock_movements (
    product_id, order_id, direction, quantity, weight_kg, recipient_name,
    comment, reason, created_by, location, currency, unit_price, source
  ) VALUES (
    _product_id, _order_id, 'out', qty_in_unit, used_kg, _actor_name,
    _comment, 'Konstruktor metall sarfi', auth.uid(), 'Asosiy zavod',
    COALESCE(p.currency, 'UZS'), COALESCE(p.last_price, 0), 'Metall hisobi'
  );

  RETURN used_kg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.metal_consume_product(uuid, numeric, numeric, uuid, text, text) TO authenticated;