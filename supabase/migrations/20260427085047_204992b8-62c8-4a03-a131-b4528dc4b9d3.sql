
-- Wipe business data (keep users, profiles, user_roles)
TRUNCATE TABLE
  public.audit_log,
  public.stock_movements,
  public.order_parts,
  public.order_stages,
  public.orders,
  public.products,
  public.clients,
  public.chat_messages,
  public.chat_participants,
  public.chat_conversations
RESTART IDENTITY CASCADE;

-- Drop unused stage_templates tables
DROP TABLE IF EXISTS public.template_stages CASCADE;
DROP TABLE IF EXISTS public.stage_templates CASCADE;

-- ORDERS
DROP POLICY IF EXISTS orders_marketing_create ON public.orders;
DROP POLICY IF EXISTS orders_managers_update ON public.orders;
CREATE POLICY orders_marketing_create ON public.orders FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'marketing'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY orders_managers_update ON public.orders FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role));

-- ORDER_STAGES
DROP POLICY IF EXISTS stages_manage ON public.order_stages;
DROP POLICY IF EXISTS stages_otk_update ON public.order_stages;
CREATE POLICY stages_manage ON public.order_stages FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role));
CREATE POLICY stages_otk_update ON public.order_stages FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'otk'::app_role))
  WITH CHECK (has_role(auth.uid(), 'otk'::app_role));

-- ORDER_PARTS
DROP POLICY IF EXISTS parts_manage ON public.order_parts;
CREATE POLICY parts_manage ON public.order_parts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role));

-- PRODUCTS
DROP POLICY IF EXISTS products_supply_manage ON public.products;
CREATE POLICY products_supply_manage ON public.products FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- STOCK_MOVEMENTS
DROP POLICY IF EXISTS mv_warehouse_out ON public.stock_movements;
DROP POLICY IF EXISTS mv_supply_in ON public.stock_movements;
CREATE POLICY mv_warehouse_out ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    direction = 'out'::movement_direction
    AND (has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );
CREATE POLICY mv_supply_in ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    direction = 'in'::movement_direction
    AND (has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );
