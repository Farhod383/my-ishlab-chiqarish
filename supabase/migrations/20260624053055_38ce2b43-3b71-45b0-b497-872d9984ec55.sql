-- Keep legacy values safe before enforcing the two-status workflow.
UPDATE public.order_supply_requests
SET status = 'pending', updated_at = now()
WHERE status = 'in_progress';

-- Enforce only the allowed supply statuses at the database layer.
ALTER TABLE public.order_supply_requests
  DROP CONSTRAINT IF EXISTS order_supply_requests_status_allowed;

ALTER TABLE public.order_supply_requests
  ADD CONSTRAINT order_supply_requests_status_allowed
  CHECK (status IN ('pending', 'fulfilled'));

-- Idempotency anchor: one warehouse movement per supply request.
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS supply_request_id uuid REFERENCES public.order_supply_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_movements_supply_request
  ON public.stock_movements(supply_request_id)
  WHERE supply_request_id IS NOT NULL;

-- Ensure inserting a warehouse movement actually changes product stock.
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
      SET stock_qty = COALESCE(stock_qty, 0) + CASE WHEN NEW.direction = 'in' THEN NEW.quantity ELSE -NEW.quantity END
      WHERE id = NEW.product_id;
  END IF;

  IF NEW.direction = 'out' AND NEW.order_id IS NOT NULL AND NEW.product_id IS NOT NULL THEN
    UPDATE public.order_parts
      SET actual_qty = COALESCE(actual_qty, 0) + NEW.quantity
      WHERE order_id = NEW.order_id AND product_id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- Create warehouse income history exactly once when supply is fulfilled.
CREATE OR REPLACE FUNCTION public.auto_receipt_on_supply_fulfilled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF NEW.status = 'in_progress' THEN
    NEW.status := 'pending';
  END IF;

  IF NEW.status NOT IN ('pending', 'fulfilled') THEN
    RAISE EXCEPTION 'Ta''minot statusi faqat Kutilmoqda yoki Ta''minlandi bo''lishi mumkin'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'fulfilled'
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.status, '') <> 'fulfilled')
     AND NEW.product_id IS NOT NULL
     AND COALESCE(NEW.quantity, 0) > 0
  THEN
    NEW.fulfilled_at := COALESCE(NEW.fulfilled_at, now());

    INSERT INTO public.stock_movements (
      product_id,
      order_id,
      direction,
      quantity,
      recipient_name,
      source,
      comment,
      created_by,
      supply_request_id
    )
    SELECT
      NEW.product_id,
      NEW.order_id,
      'in'::public.movement_direction,
      NEW.quantity,
      'Ta''minot bo''limi',
      'Ta''minot bo''limi',
      'Avto Kirim — Ta''minot tasdiqladi (so''rov #' || substring(NEW.id::text, 1, 8) || ')',
      COALESCE(uid, NEW.created_by),
      NEW.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.stock_movements WHERE supply_request_id = NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_receipt_supply_fulfilled ON public.order_supply_requests;
CREATE TRIGGER trg_auto_receipt_supply_fulfilled
BEFORE INSERT OR UPDATE ON public.order_supply_requests
FOR EACH ROW EXECUTE FUNCTION public.auto_receipt_on_supply_fulfilled();