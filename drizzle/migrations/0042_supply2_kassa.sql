CREATE OR REPLACE FUNCTION public.set_cash_expense_supply_purpose()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r text := lower(btrim(replace(replace(coalesce(NEW.reason,''),'’',''''),'`','''')));
BEGIN
  IF r IN ('ta''minot 2','taminot 2','ta minot 2','ta''minot2','taminot2') THEN
    NEW.purpose := 'supply2';
  ELSIF r IN ('ta''minot', 'taminot', 'ta minot') THEN
    NEW.purpose := 'supply';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.cash_resets DROP CONSTRAINT cash_resets_kassa_check;
ALTER TABLE public.cash_resets ADD CONSTRAINT cash_resets_kassa_check CHECK (kassa IN ('main','supply','supply2'));

CREATE OR REPLACE VIEW public.supply2_spendings WITH (security_invoker = true) AS
SELECT m.id AS stock_movement_id, m.created_at,
  COALESCE(p.name, ii.product_name) AS product_name, m.quantity,
  COALESCE(p.unit, ii.unit) AS unit, m.unit_price,
  round(m.quantity * m.unit_price, 2) AS total,
  upper(COALESCE(m.currency, 'UZS')) AS currency,
  m.recipient_name AS brought_by, m.source, m.order_id, o.order_number, m.created_by
FROM public.stock_movements m
LEFT JOIN public.products p ON p.id = m.product_id
LEFT JOIN public.intake_items ii ON ii.id = m.intake_item_id
LEFT JOIN public.orders o ON o.id = m.order_id
WHERE m.direction = 'in'::movement_direction
  AND lower(btrim(COALESCE(m.recipient_name, ''))) = ANY (ARRAY['shovkat','шовкат','shavkat','шавкат']);

GRANT SELECT ON public.supply2_spendings TO authenticated;
GRANT SELECT ON public.supply2_spendings TO service_role;