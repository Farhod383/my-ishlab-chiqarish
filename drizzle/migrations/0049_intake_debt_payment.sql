ALTER TABLE public.intake_sessions ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'cash';
ALTER TABLE public.intake_sessions ADD COLUMN IF NOT EXISTS debt_id uuid;
ALTER TABLE public.intake_sessions ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE public.intake_sessions ADD COLUMN IF NOT EXISTS comment text;
ALTER TABLE public.intake_sessions ADD CONSTRAINT intake_sessions_payment_type_chk CHECK (payment_type IN ('cash','transfer','card','debt'));

ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS intake_session_id uuid;
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS intake_date timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS debts_intake_session_uidx ON public.debts(intake_session_id) WHERE intake_session_id IS NOT NULL;

ALTER TABLE public.debt_items ADD COLUMN IF NOT EXISTS intake_item_id uuid;
ALTER TABLE public.debt_items ADD COLUMN IF NOT EXISTS unit text;
CREATE UNIQUE INDEX IF NOT EXISTS debt_items_intake_item_uidx ON public.debt_items(intake_item_id) WHERE intake_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.debt_has_payments(_debt uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cash_expenses WHERE debt_id = _debt)
      OR COALESCE((SELECT paid_amount FROM public.debts WHERE id = _debt), 0) > 0
$$;

-- Sklad kirimi (Qarz) <-> Kassa qarzi sinxronizatsiyasi. Idempotent: bitta kirim = bitta qarz.
CREATE OR REPLACE FUNCTION public.sync_intake_debt(_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.intake_sessions%ROWTYPE;
  d_id uuid;
  cp text;
  inv text;
BEGIN
  SELECT * INTO s FROM public.intake_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT id INTO d_id FROM public.debts WHERE intake_session_id = _session_id;

  IF s.status = 'finalized' AND s.payment_type = 'debt' THEN
    inv := COALESCE(NULLIF(trim(s.invoice_number), ''), to_char(s.started_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI'));
    SELECT NULLIF(trim(source), '') INTO cp FROM public.intake_items
      WHERE session_id = _session_id AND NULLIF(trim(source), '') IS NOT NULL ORDER BY created_at LIMIT 1;
    cp := COALESCE(cp, NULLIF(trim(s.supplier), ''), 'Yetkazib beruvchi');
    IF d_id IS NULL THEN
      INSERT INTO public.debts (counterparty, purpose, amount, amount_usd, currency, status, comment, created_by,
                                source, intake_session_id, invoice_number, supplier, intake_date)
      VALUES (cp, 'Sklad tovar kirimi · Nakladnoy ' || inv, 0, 0, 'UZS', 'open', s.comment, s.created_by,
              'Sklad tovar kirimi', _session_id, inv, s.supplier, COALESCE(s.finalized_at, now()))
      ON CONFLICT (intake_session_id) WHERE intake_session_id IS NOT NULL DO NOTHING
      RETURNING id INTO d_id;
      IF d_id IS NULL THEN SELECT id INTO d_id FROM public.debts WHERE intake_session_id = _session_id; END IF;
    ELSE
      UPDATE public.debts SET counterparty = cp, invoice_number = inv, supplier = s.supplier,
        comment = COALESCE(s.comment, comment), purpose = 'Sklad tovar kirimi · Nakladnoy ' || inv, updated_at = now()
      WHERE id = d_id;
    END IF;

    DELETE FROM public.debt_items di WHERE di.debt_id = d_id AND di.intake_item_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.intake_items i WHERE i.id = di.intake_item_id AND i.session_id = _session_id);
    INSERT INTO public.debt_items (debt_id, item_name, quantity, unit_price, currency, sort_order, intake_item_id, unit)
    SELECT d_id, i.product_name, i.quantity, i.unit_price, upper(COALESCE(i.currency,'UZS')),
           (row_number() OVER (ORDER BY i.created_at))::int, i.id, i.unit
      FROM public.intake_items i WHERE i.session_id = _session_id
    ON CONFLICT (intake_item_id) WHERE intake_item_id IS NOT NULL DO UPDATE
      SET item_name = EXCLUDED.item_name, quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price,
          currency = EXCLUDED.currency, unit = EXCLUDED.unit, debt_id = EXCLUDED.debt_id;

    IF s.debt_id IS DISTINCT FROM d_id THEN
      UPDATE public.intake_sessions SET debt_id = d_id WHERE id = _session_id;
    END IF;
  ELSIF d_id IS NOT NULL THEN
    -- Kirim endi qarz emas: to'lov bo'lsa o'chirish taqiqlanadi
    IF public.debt_has_payments(d_id) THEN
      RAISE EXCEPTION 'Bu kirimning qarzi bo''yicha to''lov qilingan — to''lov turini o''zgartirib bo''lmaydi';
    END IF;
    DELETE FROM public.debt_items WHERE debt_id = d_id;
    DELETE FROM public.debts WHERE id = d_id;
    UPDATE public.intake_sessions SET debt_id = NULL WHERE id = _session_id AND debt_id IS NOT NULL;
    INSERT INTO public.entity_audit (entity, entity_id, action, old_value, new_value, actor_id)
    VALUES ('debts', d_id, 'Sklad kirimi qarzi bekor qilindi', jsonb_build_object('intake_session_id', _session_id), NULL, auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_intake_session_debt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.debt_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.debts WHERE intake_session_id = OLD.id) THEN
      IF EXISTS (SELECT 1 FROM public.debts d WHERE d.intake_session_id = OLD.id AND public.debt_has_payments(d.id)) THEN
        RAISE EXCEPTION 'Bu nakladnoy qarzi bo''yicha to''lov qilingan — o''chirib bo''lmaydi';
      END IF;
      DELETE FROM public.debt_items WHERE debt_id IN (SELECT id FROM public.debts WHERE intake_session_id = OLD.id);
      DELETE FROM public.debts WHERE intake_session_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.status = 'finalized' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.payment_type IS DISTINCT FROM NEW.payment_type OR OLD.supplier IS DISTINCT FROM NEW.supplier
      OR OLD.invoice_number IS DISTINCT FROM NEW.invoice_number OR OLD.comment IS DISTINCT FROM NEW.comment) THEN
    PERFORM public.sync_intake_debt(NEW.id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_intake_session_debt_upd AFTER INSERT OR UPDATE ON public.intake_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trg_intake_session_debt();
CREATE TRIGGER trg_intake_session_debt_del BEFORE DELETE ON public.intake_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trg_intake_session_debt();

CREATE OR REPLACE FUNCTION public.trg_intake_item_debt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid := COALESCE(NEW.session_id, OLD.session_id);
BEGIN
  IF EXISTS (SELECT 1 FROM public.intake_sessions WHERE id = sid AND status = 'finalized' AND payment_type = 'debt') THEN
    PERFORM public.sync_intake_debt(sid);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_intake_item_debt AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_intake_item_debt();

-- Qarzga olingan kirimlar Ta'minot kassasidan pul ayirmaydi
CREATE OR REPLACE VIEW public.supply_spendings WITH (security_invoker = true) AS
 SELECT m.id AS stock_movement_id, m.created_at, COALESCE(p.name, ii.product_name) AS product_name, m.quantity,
    COALESCE(p.unit, ii.unit) AS unit, m.unit_price, round((m.quantity * m.unit_price), 2) AS total,
    upper(COALESCE(m.currency, 'UZS'::text)) AS currency, m.recipient_name AS brought_by, m.source, m.order_id,
    o.order_number, m.created_by
   FROM stock_movements m
     LEFT JOIN products p ON p.id = m.product_id
     LEFT JOIN intake_items ii ON ii.id = m.intake_item_id
     LEFT JOIN orders o ON o.id = m.order_id
     LEFT JOIN intake_sessions s ON s.id = m.intake_session_id
  WHERE m.direction = 'in'::movement_direction
    AND lower(btrim(COALESCE(m.recipient_name, ''::text))) = ANY (ARRAY['sanjar'::text, 'санжар'::text])
    AND m.created_at >= (SELECT min(COALESCE(e.expense_date, e.created_at)) FROM cash_expenses e WHERE e.purpose = 'supply'::text)
    AND COALESCE(s.payment_type, 'cash') <> 'debt';

CREATE OR REPLACE VIEW public.supply2_spendings WITH (security_invoker = true) AS
 SELECT m.id AS stock_movement_id, m.created_at, COALESCE(p.name, ii.product_name) AS product_name, m.quantity,
    COALESCE(p.unit, ii.unit) AS unit, m.unit_price, round((m.quantity * m.unit_price), 2) AS total,
    upper(COALESCE(m.currency, 'UZS'::text)) AS currency, m.recipient_name AS brought_by, m.source, m.order_id,
    o.order_number, m.created_by
   FROM stock_movements m
     LEFT JOIN products p ON p.id = m.product_id
     LEFT JOIN intake_items ii ON ii.id = m.intake_item_id
     LEFT JOIN orders o ON o.id = m.order_id
     LEFT JOIN intake_sessions s ON s.id = m.intake_session_id
  WHERE m.direction = 'in'::movement_direction
    AND lower(btrim(COALESCE(m.recipient_name, ''::text))) = ANY (ARRAY['shovkat'::text, 'шовкат'::text, 'shavkat'::text, 'шавкат'::text])
    AND COALESCE(s.payment_type, 'cash') <> 'debt';