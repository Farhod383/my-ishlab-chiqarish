-- Kirim sessiyalari (Nakladnoy)
CREATE TABLE public.intake_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'open',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  finalized_at timestamptz,
  image_url text,
  supplier text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_sessions TO authenticated;
GRANT ALL ON public.intake_sessions TO service_role;

ALTER TABLE public.intake_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_sessions_select" ON public.intake_sessions
FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

CREATE POLICY "intake_sessions_insert" ON public.intake_sessions
FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'warehouse') OR
    public.has_role(auth.uid(), 'supply')
  )
);

CREATE POLICY "intake_sessions_update" ON public.intake_sessions
FOR UPDATE TO authenticated USING (
  status <> 'finalized' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'warehouse') OR
    public.has_role(auth.uid(), 'supply')
  )
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'warehouse') OR
  public.has_role(auth.uid(), 'supply')
);

CREATE POLICY "intake_sessions_delete" ON public.intake_sessions
FOR DELETE TO authenticated USING (
  status = 'open' AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

-- Bir foydalanuvchida bir vaqtda faqat bitta ochiq sessiya
CREATE UNIQUE INDEX intake_sessions_one_open_per_user
  ON public.intake_sessions (created_by) WHERE status = 'open';

CREATE TABLE public.intake_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.intake_sessions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  unit text NOT NULL DEFAULT 'dona',
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UZS',
  location text,
  order_id uuid REFERENCES public.orders(id),
  source text,
  phone text,
  image_url text,
  comment text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_items TO authenticated;
GRANT ALL ON public.intake_items TO service_role;

ALTER TABLE public.intake_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_items_select" ON public.intake_items
FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

CREATE POLICY "intake_items_insert" ON public.intake_items
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.intake_sessions s WHERE s.id = session_id AND s.status = 'open')
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'warehouse') OR
    public.has_role(auth.uid(), 'supply')
  )
);

CREATE POLICY "intake_items_update" ON public.intake_items
FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.intake_sessions s WHERE s.id = session_id AND s.status = 'open')
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'warehouse') OR
    public.has_role(auth.uid(), 'supply')
  )
) WITH CHECK (true);

CREATE POLICY "intake_items_delete" ON public.intake_items
FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.intake_sessions s WHERE s.id = session_id AND s.status <> 'finalized')
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'warehouse') OR
    public.has_role(auth.uid(), 'supply')
  )
);

CREATE INDEX intake_items_session_idx ON public.intake_items (session_id);

-- Sklad harakatlari bilan bog'lanish
ALTER TABLE public.stock_movements ADD COLUMN intake_session_id uuid REFERENCES public.intake_sessions(id);
ALTER TABLE public.stock_movements ADD COLUMN intake_item_id uuid REFERENCES public.intake_items(id);
CREATE UNIQUE INDEX stock_movements_intake_item_uniq ON public.stock_movements (intake_item_id) WHERE intake_item_id IS NOT NULL;

CREATE TRIGGER trg_intake_sessions_updated
BEFORE UPDATE ON public.intake_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Yakunlash: mahsulotlarni skladga kirim qilish
CREATE OR REPLACE FUNCTION public.finalize_intake_session(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      created_by, intake_session_id, intake_item_id
    ) VALUES (
      pid, it.order_id, 'in', it.quantity, it.unit_price, COALESCE(it.currency, 'UZS'),
      s.supplier, it.source, it.phone, it.image_url, COALESCE(it.location, 'Zavod'),
      COALESCE(it.comment, 'Nakladnoy: ' || to_char(s.started_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI')),
      COALESCE(s.created_by, uid), s.id, it.id
    );
  END LOOP;

  UPDATE public.intake_sessions
    SET status = 'finalized',
        finished_at = COALESCE(finished_at, now()),
        finalized_at = now()
    WHERE id = _session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_intake_session(uuid) TO authenticated;