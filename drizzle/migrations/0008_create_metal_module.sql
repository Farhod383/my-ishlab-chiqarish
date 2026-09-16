-- Metall normalari: har bir metall turi + o'lcham + qalinlik uchun 1 list og'irligi (kg)
CREATE TABLE public.metal_norms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metal_type TEXT NOT NULL,
  length_mm NUMERIC NOT NULL,
  width_mm NUMERIC NOT NULL,
  thickness_mm NUMERIC NOT NULL,
  weight_kg NUMERIC NOT NULL CHECK (weight_kg > 0),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX metal_norms_uniq ON public.metal_norms (lower(metal_type), length_mm, width_mm, thickness_mm);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metal_norms TO authenticated;
GRANT ALL ON public.metal_norms TO service_role;
ALTER TABLE public.metal_norms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metal_norms_select" ON public.metal_norms FOR SELECT TO authenticated USING (true);
CREATE POLICY "metal_norms_write" ON public.metal_norms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'engineer'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'engineer'));

-- Metall qoldig'i: har bir tur+o'lcham+qalinlik alohida pozitsiya
CREATE TABLE public.metal_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metal_type TEXT NOT NULL,
  length_mm NUMERIC NOT NULL,
  width_mm NUMERIC NOT NULL,
  thickness_mm NUMERIC NOT NULL,
  weight_kg NUMERIC NOT NULL CHECK (weight_kg > 0),
  quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX metal_stock_uniq ON public.metal_stock (lower(metal_type), length_mm, width_mm, thickness_mm);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metal_stock TO authenticated;
GRANT ALL ON public.metal_stock TO service_role;
ALTER TABLE public.metal_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metal_stock_select" ON public.metal_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "metal_stock_write" ON public.metal_stock FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'));

-- Metall harakatlari (kirim / sarf)
CREATE TABLE public.metal_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES public.metal_stock(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  weight_kg NUMERIC NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  comment TEXT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX metal_movements_stock_idx ON public.metal_movements (stock_id, created_at DESC);
CREATE INDEX metal_movements_order_idx ON public.metal_movements (order_id);
GRANT SELECT, INSERT ON public.metal_movements TO authenticated;
GRANT ALL ON public.metal_movements TO service_role;
ALTER TABLE public.metal_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metal_movements_select" ON public.metal_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "metal_movements_insert" ON public.metal_movements FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Kirim: pozitsiyani topadi yoki yaratadi, qoldiqni oshiradi
CREATE OR REPLACE FUNCTION public.metal_intake(
  _metal_type TEXT, _length NUMERIC, _width NUMERIC, _thickness NUMERIC,
  _weight_kg NUMERIC, _quantity NUMERIC, _comment TEXT DEFAULT NULL, _actor_name TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse')) THEN
    RAISE EXCEPTION 'Ruxsat yo''q';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Miqdor noto''g''ri'; END IF;
  IF _weight_kg IS NULL OR _weight_kg <= 0 THEN RAISE EXCEPTION 'Og''irlik normasi topilmadi'; END IF;

  SELECT id INTO _sid FROM public.metal_stock
   WHERE lower(metal_type) = lower(_metal_type) AND length_mm = _length
     AND width_mm = _width AND thickness_mm = _thickness;

  IF _sid IS NULL THEN
    INSERT INTO public.metal_stock (metal_type, length_mm, width_mm, thickness_mm, weight_kg, quantity)
    VALUES (_metal_type, _length, _width, _thickness, _weight_kg, _quantity)
    RETURNING id INTO _sid;
  ELSE
    UPDATE public.metal_stock
       SET quantity = quantity + _quantity, weight_kg = _weight_kg, updated_at = now()
     WHERE id = _sid;
  END IF;

  INSERT INTO public.metal_movements (stock_id, direction, quantity, weight_kg, comment, created_by, created_by_name)
  VALUES (_sid, 'in', _quantity, _weight_kg * _quantity, _comment, auth.uid(), _actor_name);

  INSERT INTO public.entity_audit (entity, entity_id, action, new_value, actor_id, actor_name)
  VALUES ('metal_stock', _sid, 'metal_intake',
    jsonb_build_object('metal_type',_metal_type,'length',_length,'width',_width,'thickness',_thickness,'quantity',_quantity,'weight_kg',_weight_kg*_quantity),
    auth.uid(), _actor_name);

  RETURN _sid;
END; $$;

-- Sarf: qoldiqdan ayiradi, yetarli bo'lmasa xato
CREATE OR REPLACE FUNCTION public.metal_consume(
  _stock_id UUID, _quantity NUMERIC, _order_id UUID,
  _comment TEXT DEFAULT NULL, _actor_name TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.metal_stock%ROWTYPE; _kg NUMERIC;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'engineer')) THEN
    RAISE EXCEPTION 'Ruxsat yo''q';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Miqdor noto''g''ri'; END IF;

  SELECT * INTO _row FROM public.metal_stock WHERE id = _stock_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Metall pozitsiyasi topilmadi'; END IF;
  IF _row.quantity < _quantity THEN
    RAISE EXCEPTION 'Qoldiq yetarli emas: mavjud % dona', _row.quantity;
  END IF;

  _kg := _row.weight_kg * _quantity;

  UPDATE public.metal_stock SET quantity = quantity - _quantity, updated_at = now() WHERE id = _stock_id;

  INSERT INTO public.metal_movements (stock_id, direction, quantity, weight_kg, order_id, comment, created_by, created_by_name)
  VALUES (_stock_id, 'out', _quantity, _kg, _order_id, _comment, auth.uid(), _actor_name);

  INSERT INTO public.entity_audit (entity, entity_id, action, new_value, actor_id, actor_name)
  VALUES ('metal_stock', _stock_id, 'metal_consume',
    jsonb_build_object('metal_type',_row.metal_type,'length',_row.length_mm,'width',_row.width_mm,'thickness',_row.thickness_mm,'quantity',_quantity,'weight_kg',_kg,'order_id',_order_id),
    auth.uid(), _actor_name);

  RETURN _kg;
END; $$;