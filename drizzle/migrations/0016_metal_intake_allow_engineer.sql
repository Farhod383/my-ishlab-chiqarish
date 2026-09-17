CREATE OR REPLACE FUNCTION public.metal_intake(_metal_type text, _length numeric, _width numeric, _thickness numeric, _weight_kg numeric, _quantity numeric, _comment text DEFAULT NULL::text, _actor_name text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'warehouse') OR public.has_role(auth.uid(), 'engineer')) THEN
    RAISE EXCEPTION 'Metall kirimiga ruxsat yo''q';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Miqdor noto''g''ri'; END IF;
  IF _weight_kg IS NULL OR _weight_kg <= 0 THEN RAISE EXCEPTION 'Og''irlik normasi topilmadi'; END IF;

  SELECT id INTO sid FROM public.metal_stock
   WHERE lower(metal_type) = lower(_metal_type)
     AND length_mm = _length AND width_mm = _width AND thickness_mm = _thickness
   LIMIT 1;

  IF sid IS NULL THEN
    INSERT INTO public.metal_stock (metal_type, length_mm, width_mm, thickness_mm, weight_kg, quantity)
    VALUES (_metal_type, _length, _width, _thickness, _weight_kg, _quantity)
    RETURNING id INTO sid;
  ELSE
    UPDATE public.metal_stock
       SET quantity = quantity + _quantity, weight_kg = _weight_kg, updated_at = now()
     WHERE id = sid;
  END IF;

  INSERT INTO public.metal_movements (stock_id, direction, quantity, weight_kg, comment, created_by, created_by_name)
  VALUES (sid, 'in', _quantity, _quantity * _weight_kg, _comment, auth.uid(), _actor_name);

  RETURN sid;
END;
$$;