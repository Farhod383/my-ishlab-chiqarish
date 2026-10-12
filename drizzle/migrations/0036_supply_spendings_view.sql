CREATE OR REPLACE VIEW public.supply_spendings WITH (security_invoker = true) AS
SELECT m.id AS stock_movement_id,
       m.created_at,
       COALESCE(p.name, ii.product_name) AS product_name,
       m.quantity,
       COALESCE(p.unit, ii.unit) AS unit,
       m.unit_price,
       round(m.quantity * m.unit_price, 2) AS total,
       upper(COALESCE(m.currency, 'UZS')) AS currency,
       m.recipient_name AS brought_by,
       m.source,
       m.order_id,
       o.order_number,
       m.created_by
FROM public.stock_movements m
LEFT JOIN public.products p ON p.id = m.product_id
LEFT JOIN public.intake_items ii ON ii.id = m.intake_item_id
LEFT JOIN public.orders o ON o.id = m.order_id
WHERE m.direction = 'in'
  AND lower(btrim(COALESCE(m.recipient_name, ''))) IN ('sanjar', 'санжар')
  AND m.created_at >= (SELECT min(COALESCE(e.expense_date, e.created_at)) FROM public.cash_expenses e WHERE e.purpose = 'supply');
GRANT SELECT ON public.supply_spendings TO authenticated;
GRANT SELECT ON public.supply_spendings TO service_role;
COMMENT ON VIEW public.supply_spendings IS 'Ta''minot chiqimlari: Ta''minotga birinchi pul berilgandan keyin Sanjar olib kelgan har bir Sklad kirimi (bitta kirim = bitta qator).';