CREATE OR REPLACE FUNCTION public.auto_receipt_on_supply_fulfilled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
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