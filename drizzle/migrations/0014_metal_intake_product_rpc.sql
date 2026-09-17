CREATE OR REPLACE FUNCTION public.metal_intake_product(
  _metal_type text,
  _thickness numeric,
  _width numeric,
  _length numeric,
  _kg_per_piece numeric,
  _pieces numeric,
  _unit_price numeric DEFAULT 0,
  _currency text DEFAULT 'UZS',
  _location text DEFAULT 'Sklad',
  _comment text DEFAULT NULL,
  _actor_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _pid uuid;
  _name text;
BEGIN
  IF NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'engineer') OR public.has_role(_uid, 'warehouse')) THEN
    RAISE EXCEPTION 'Ruxsat yo''q: metall kirimi faqat Admin, Konstruktor yoki Skladchi uchun';
  END IF;
  IF _metal_type IS NULL OR btrim(_metal_type) = '' THEN
    RAISE EXCEPTION 'Metall turini kiriting';
  END IF;
  IF _pieces IS NULL OR _pieces <= 0 THEN
    RAISE EXCEPTION 'Dona sonini kiriting';
  END IF;

  SELECT id INTO _pid FROM public.products
  WHERE lower(btrim(coalesce(metal_type,''))) = lower(btrim(_metal_type))
    AND coalesce(thickness_mm, -1) = coalesce(_thickness, -1)
    AND coalesce(width_mm, -1) = coalesce(_width, -1)
    AND coalesce(length_mm, -1) = coalesce(_length, -1)
  LIMIT 1;

  IF _pid IS NULL THEN
    _name := btrim(_metal_type)
      || CASE WHEN _thickness IS NOT NULL THEN ' S=' || trim(to_char(_thickness, 'FM999990.999')) || 'mm' ELSE '' END
      || CASE WHEN _width IS NOT NULL AND _length IS NOT NULL
              THEN ' ' || trim(to_char(_width, 'FM999999990.99')) || 'x' || trim(to_char(_length, 'FM999999990.99')) ELSE '' END;
    INSERT INTO public.products (name, unit, stock_qty, min_limit, last_price, currency,
                                 metal_type, thickness_mm, width_mm, length_mm, weight_kg)
    VALUES (_name, 'dona', 0, 0, coalesce(_unit_price, 0), coalesce(_currency, 'UZS'),
            btrim(_metal_type), _thickness, _width, _length, _kg_per_piece)
    RETURNING id INTO _pid;
  ELSE
    UPDATE public.products
    SET weight_kg = COALESCE(_kg_per_piece, weight_kg)
    WHERE id = _pid;
  END IF;

  IF _kg_per_piece IS NOT NULL AND _kg_per_piece > 0
     AND _thickness IS NOT NULL AND _width IS NOT NULL AND _length IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.metal_norms
      WHERE lower(btrim(metal_type)) = lower(btrim(_metal_type))
        AND thickness_mm = _thickness AND width_mm = _width AND length_mm = _length
    ) THEN
      INSERT INTO public.metal_norms (metal_type, length_mm, width_mm, thickness_mm, weight_kg, created_by)
      VALUES (btrim(_metal_type), _length, _width, _thickness, _kg_per_piece, _uid);
    END IF;
  END IF;

  INSERT INTO public.stock_movements
    (product_id, direction, quantity, weight_kg, unit_price, currency, location,
     comment, source, created_by, recipient_name)
  VALUES
    (_pid, 'in', _pieces, COALESCE(_kg_per_piece, 0) * _pieces, COALESCE(_unit_price, 0),
     COALESCE(_currency, 'UZS'), COALESCE(_location, 'Sklad'),
     _comment, 'Metall hisobi', _uid, _actor_name);

  RETURN _pid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.metal_intake_product(text, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, text) TO authenticated;