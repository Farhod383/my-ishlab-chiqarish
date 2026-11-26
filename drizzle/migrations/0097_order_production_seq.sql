-- 0097: Zakazlarni ishlab chiqarishga qo'yish tartibi — qo'lda belgilanadi (orders.production_seq).
-- • Raqam takrorlanmaydi: band raqam berilsa, o'sha va keyingilari bittaga suriladi.
-- • Faqat marketing va admin qo'yadi/olib tashlaydi (set_production_seq).
-- • Zakaz tugasa yoki bekor qilinsa — tartibdan chiqadi, keyingilari bittaga yuqoriga suriladi.
-- • Avtomatik navbat (queue_position, «Ishlab chiqarish» taxtasi) bunga tegmaydi.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS production_seq int;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_production_seq_positive') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_production_seq_positive CHECK (production_seq IS NULL OR production_seq > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_production_seq_uq') THEN
    -- surish bitta UPDATE'da bo'lgani uchun tekshiruv tranzaksiya oxirida
    ALTER TABLE public.orders ADD CONSTRAINT orders_production_seq_uq UNIQUE (production_seq) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Qo'yish / ko'chirish / olib tashlash (_seq NULL). Qaytaradi: zakazning yangi raqami
CREATE OR REPLACE FUNCTION public.set_production_seq(_order_id uuid, _seq int) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; mx int; target int;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'marketing') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Ishlab chiqarish tartibini faqat marketing yoki admin belgilaydi';
  END IF;
  IF _seq IS NOT NULL AND _seq < 1 THEN RAISE EXCEPTION 'Tartib raqami 1 dan boshlanadi'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('orders.production_seq'));
  SELECT id, status, production_seq INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Zakaz topilmadi'; END IF;
  IF _seq IS NOT NULL AND o.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Tugagan yoki bekor qilingan zakazga tartib qo''yilmaydi';
  END IF;
  -- eski o'rindan chiqarish
  IF o.production_seq IS NOT NULL THEN
    UPDATE public.orders SET production_seq = NULL WHERE id = o.id;
    UPDATE public.orders SET production_seq = production_seq - 1 WHERE production_seq > o.production_seq;
  END IF;
  IF _seq IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(max(production_seq), 0) INTO mx FROM public.orders;
  target := least(_seq, mx + 1);  -- bo'shliq qoldirmaydi
  UPDATE public.orders SET production_seq = production_seq + 1 WHERE production_seq >= target;
  UPDATE public.orders SET production_seq = target WHERE id = o.id;
  RETURN target;
END $$;

-- Tugagan/bekor qilingan zakaz tartibdan chiqadi
CREATE OR REPLACE FUNCTION public.orders_production_seq_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled') AND OLD.production_seq IS NOT NULL THEN
    NEW.production_seq := NULL;
    PERFORM pg_advisory_xact_lock(hashtext('orders.production_seq'));
    UPDATE public.orders SET production_seq = production_seq - 1 WHERE production_seq > OLD.production_seq AND id <> NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_orders_production_seq_release ON public.orders;
CREATE TRIGGER trg_orders_production_seq_release BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.orders_production_seq_release();

-- Oddiy UPDATE bilan production_seq o'zgartirib bo'lmaydi (faqat yuqoridagi funksiyalar orqali)
CREATE OR REPLACE FUNCTION public.orders_production_seq_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- SECURITY DEFINER funksiyalar ichida current_user = egasi; to'g'ridan-to'g'ri so'rovda = authenticated
  IF NEW.production_seq IS DISTINCT FROM OLD.production_seq AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Ishlab chiqarish tartibi faqat «Tartib» tugmasi orqali o''zgaradi';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_orders_production_seq_guard ON public.orders;
CREATE TRIGGER trg_orders_production_seq_guard BEFORE UPDATE OF production_seq ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_production_seq_guard();

REVOKE ALL ON FUNCTION public.set_production_seq(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_production_seq(uuid, int) TO authenticated;
