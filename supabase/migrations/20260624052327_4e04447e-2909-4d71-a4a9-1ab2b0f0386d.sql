
-- 1) Normalize legacy in_progress -> pending
UPDATE public.order_supply_requests SET status = 'pending' WHERE status = 'in_progress';

-- 2) Link stock movements to supply requests (idempotency anchor)
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS supply_request_id uuid REFERENCES public.order_supply_requests(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_movements_supply_request
  ON public.stock_movements(supply_request_id) WHERE supply_request_id IS NOT NULL;

-- 3) Trigger: when a supply request is marked fulfilled, auto-create a warehouse receipt (in)
CREATE OR REPLACE FUNCTION public.auto_receipt_on_supply_fulfilled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  already_exists boolean;
BEGIN
  IF NEW.status = 'fulfilled'
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.status,'') <> 'fulfilled')
     AND NEW.product_id IS NOT NULL
     AND COALESCE(NEW.quantity, 0) > 0
  THEN
    SELECT EXISTS (SELECT 1 FROM public.stock_movements WHERE supply_request_id = NEW.id)
      INTO already_exists;
    IF NOT already_exists THEN
      INSERT INTO public.stock_movements (
        product_id, order_id, direction, quantity,
        recipient_name, source, comment, created_by, supply_request_id
      ) VALUES (
        NEW.product_id, NEW.order_id, 'in', NEW.quantity,
        'Ta''minot bo''limi', 'Ta''minot bo''limi',
        'Avto Kirim — Ta''minot tasdiqladi (so''rov #' || substring(NEW.id::text, 1, 8) || ')',
        COALESCE(uid, NEW.created_by), NEW.id
      );
    END IF;
    IF NEW.fulfilled_at IS NULL THEN
      NEW.fulfilled_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_receipt_supply_fulfilled ON public.order_supply_requests;
CREATE TRIGGER trg_auto_receipt_supply_fulfilled
  BEFORE INSERT OR UPDATE ON public.order_supply_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_receipt_on_supply_fulfilled();
