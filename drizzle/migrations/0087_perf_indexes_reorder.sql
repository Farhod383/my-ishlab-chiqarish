-- Tezlik: tez-tez filtrlanadigan/saralanadigan ustunlarga indekslar (ma'lumotga tegmaydi).
CREATE INDEX IF NOT EXISTS stock_movements_product_created_idx ON public.stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON public.stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS cash_incomes_income_date_idx ON public.cash_incomes (income_date DESC);
CREATE INDEX IF NOT EXISTS cash_incomes_created_idx ON public.cash_incomes (created_at DESC);
CREATE INDEX IF NOT EXISTS cash_expenses_expense_date_idx ON public.cash_expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS entity_audit_entity_idx ON public.entity_audit (entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_queue_idx ON public.orders (status, queue_position);
CREATE INDEX IF NOT EXISTS orders_created_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS order_stages_order_status_idx ON public.order_stages (order_id, status);

-- Ishlab chiqarish navbatini bitta so'rovda saqlash. SECURITY INVOKER: orders RLS qoidalari
-- avvalgidek ishlaydi — kim avval queue_position'ni o'zgartira olgan bo'lsa, faqat o'sha.
CREATE OR REPLACE FUNCTION public.reorder_orders(_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.orders o
     SET queue_position = x.pos::int
    FROM unnest(_ids) WITH ORDINALITY AS x(id, pos)
   WHERE o.id = x.id
     AND o.queue_position IS DISTINCT FROM x.pos::int;
$$;
REVOKE ALL ON FUNCTION public.reorder_orders(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_orders(uuid[]) TO authenticated;
