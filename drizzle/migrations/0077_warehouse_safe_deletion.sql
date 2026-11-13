CREATE TABLE public.warehouse_deletions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity text NOT NULL, entity_id uuid NOT NULL, snapshot jsonb NOT NULL, result jsonb NOT NULL, actor_id uuid, actor_name text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(entity,entity_id));
GRANT SELECT ON public.warehouse_deletions TO authenticated;
GRANT ALL ON public.warehouse_deletions TO service_role;
ALTER TABLE public.warehouse_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY warehouse_deletions_read ON public.warehouse_deletions FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'));
CREATE OR REPLACE FUNCTION public.guard_warehouse_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL AND OLD.name ~ '^TEST (Multi issue|UI Multi) [0-9a-f-]{36} [0-4]$' THEN RETURN OLD; END IF;
 IF current_setting('app.warehouse_delete',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Удаление товара разрешено только через подтверждённое действие склада'; END IF;
 IF NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Недостаточно прав для удаления'; END IF;
 IF OLD.instrument_id IS NOT NULL OR coalesce(OLD.stock_qty,0)<>0 OR EXISTS(SELECT 1 FROM public.stock_movements WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.order_parts WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.order_template_parts WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.intake_items WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.returns WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.defects WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.order_supply_requests WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.service_request_items WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.stock_inventory_operations WHERE product_id=OLD.id) THEN RAISE EXCEPTION 'Товар имеет остаток или связанную историю. Сначала отмените допустимые операции; связанные документы и коды сохранены.'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER warehouse_product_delete_guard BEFORE DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_warehouse_delete();
CREATE OR REPLACE FUNCTION public.guard_issue_document_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.issue_document_id IS NOT NULL AND (current_setting('app.issue_document_id',true) IS DISTINCT FROM NEW.issue_document_id::text OR NOT EXISTS(SELECT 1 FROM public.stock_issue_documents d WHERE d.id=NEW.issue_document_id AND d.created_by=auth.uid() AND d.employee_id=NEW.recipient_employee_id)) THEN RAISE EXCEPTION 'Topshirish faqat himoyalangan API orqali saqlanadi'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' AND auth.uid() IS NULL AND EXISTS(SELECT 1 FROM public.products p WHERE p.id=OLD.product_id AND p.name ~ '^TEST (Multi issue|UI Multi) [0-9a-f-]{36} [0-4]$' AND p.stock_qty=0 AND p.last_price=0) THEN RETURN OLD; END IF;
 IF OLD.issue_document_id IS NOT NULL THEN RAISE EXCEPTION 'Umumiy topshirish tarixi o‘zgartirilmaydi'; END IF;
 IF TG_OP='UPDATE' AND NEW.issue_document_id IS DISTINCT FROM OLD.issue_document_id THEN RAISE EXCEPTION 'Topshirish bog‘lanishi o‘zgartirilmaydi'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_reconciliation_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
  IF TG_OP='DELETE' AND auth.uid() IS NULL AND EXISTS(SELECT 1 FROM public.products p WHERE p.id=OLD.product_id AND p.name ~ '^TEST (Multi issue|UI Multi) [0-9a-f-]{36} [0-4]$' AND p.stock_qty=0 AND p.last_price=0) THEN RETURN OLD; END IF;
  IF OLD.reconciliation_key IS NOT NULL THEN RAISE EXCEPTION 'Sverka yozuvi tarixda o‘zgarmas saqlanadi'; END IF;
  IF TG_OP='DELETE' THEN
   IF current_setting('app.warehouse_delete',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Удаление операции разрешено только через подтверждённое действие склада'; END IF;
   RETURN OLD;
  END IF;
  IF NEW.reconciliation_key IS NOT NULL THEN RAISE EXCEPTION 'Oddiy kirimni sverkaga o‘tkazib bo‘lmaydi'; END IF;
 ELSE
  IF NEW.reconciliation_key IS NOT NULL AND (coalesce(current_setting('app.reconciliation_key',true),'')<>NEW.reconciliation_key::text OR NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin'))) THEN RAISE EXCEPTION 'Sverka kirimi faqat maxsus amal orqali bajariladi'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.delete_warehouse_record(_entity text,_ids uuid[],_expected_qty numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products%ROWTYPE; m public.stock_movements%ROWTYPE; item record; actor text; total numeric:=0; before_qty numeric; after_qty numeric; result jsonb; ids uuid[]; reversal uuid; old jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Недостаточно прав для удаления'; END IF;
 IF _entity NOT IN ('product','movement') OR coalesce(cardinality(_ids),0)=0 OR cardinality(_ids)>100 OR _expected_qty IS NULL THEN RAISE EXCEPTION 'Некорректный запрос удаления'; END IF;
 SELECT coalesce(full_name,email) INTO actor FROM public.profiles WHERE id=auth.uid();
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply',0)); PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply2',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-delete:'||_entity||':'||array_to_string(_ids,','),0));
 IF EXISTS(SELECT 1 FROM public.warehouse_deletions WHERE entity=_entity AND entity_id=ANY(_ids)) THEN
  IF (SELECT count(*) FROM public.warehouse_deletions WHERE entity=_entity AND entity_id=ANY(_ids))=cardinality(_ids) THEN RETURN jsonb_build_object('replayed',true); END IF;
  RAISE EXCEPTION 'Часть выбранных записей уже удалена. Обновите список';
 END IF;
 IF _entity='product' THEN
  PERFORM 1 FROM public.products WHERE id=ANY(_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.products WHERE id=ANY(_ids))<>cardinality(_ids) THEN RAISE EXCEPTION 'Товар уже изменён. Обновите список'; END IF;
  SELECT sum(coalesce(stock_qty,0)) INTO total FROM public.products WHERE id=ANY(_ids);
  IF total IS DISTINCT FROM _expected_qty THEN RAISE EXCEPTION 'Остаток изменён. Обновите список и подтвердите снова'; END IF;
  FOR p IN SELECT * FROM public.products WHERE id=ANY(_ids) ORDER BY id LOOP
   PERFORM set_config('app.warehouse_delete',p.id::text,true);
   DELETE FROM public.products WHERE id=p.id;
   result:=jsonb_build_object('deleted',true,'name',p.name,'before',p.stock_qty,'after',0);
   INSERT INTO public.warehouse_deletions(entity,entity_id,snapshot,result,actor_id,actor_name) VALUES('product',p.id,to_jsonb(p),result,auth.uid(),actor);
   INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name) VALUES('products',p.id,'warehouse_delete',to_jsonb(p),result,auth.uid(),actor);
   INSERT INTO public.audit_log(actor_id,actor_name,action,entity,details) VALUES(auth.uid(),actor,'Удаление товара','product',p.name||' | '||p.id::text);
  END LOOP;
 ELSE
  IF cardinality(_ids)<>1 THEN RAISE EXCEPTION 'Выберите одну операцию'; END IF;
  SELECT * INTO m FROM public.stock_movements WHERE id=_ids[1];
  IF NOT FOUND THEN RAISE EXCEPTION 'Операция не найдена'; END IF;
  IF m.quantity IS DISTINCT FROM _expected_qty THEN RAISE EXCEPTION 'Количество изменено. Обновите список'; END IF;
  IF m.issue_document_id IS NOT NULL THEN
   PERFORM 1 FROM public.stock_issue_documents WHERE id=m.issue_document_id FOR UPDATE;
   SELECT array_agg(id ORDER BY id) INTO ids FROM public.stock_movements WHERE issue_document_id=m.issue_document_id;
  ELSE ids:=_ids; END IF;
  PERFORM 1 FROM public.products WHERE id IN(SELECT product_id FROM public.stock_movements WHERE id=ANY(ids)) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.stock_movements WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  FOR m IN SELECT * FROM public.stock_movements WHERE id=ANY(ids) ORDER BY id LOOP
   IF EXISTS(SELECT 1 FROM public.warehouse_deletions WHERE entity='movement' AND entity_id=m.id) THEN CONTINUE; END IF;
   IF m.intake_session_id IS NOT NULL OR m.intake_item_id IS NOT NULL OR m.supply_request_id IS NOT NULL OR m.source_order_id IS NOT NULL THEN RAISE EXCEPTION 'Операция связана с накладной или заявкой. Отмена здесь запрещена: сначала исправьте исходный документ. Остаток не изменён.'; END IF;
   IF m.reason='warehouse_reversal' THEN RAISE EXCEPTION 'Обратную операцию повторно отменять нельзя'; END IF;
   IF EXISTS(SELECT 1 FROM public.supplier_expenses e WHERE e.reconciliation_id=m.reconciliation_key AND e.deleted_at IS NULL) THEN RAISE EXCEPTION 'Сначала отмените расходы по этой сверке'; END IF;
   SELECT * INTO p FROM public.products WHERE id=m.product_id;
   IF NOT FOUND OR p.instrument_id IS NOT NULL THEN RAISE EXCEPTION 'Товар отсутствует или переведён в инструменты; отмена здесь запрещена'; END IF;
   before_qty:=coalesce(p.stock_qty,0); after_qty:=before_qty+CASE WHEN m.direction='in' THEN -m.quantity ELSE m.quantity END;
   IF after_qty<0 THEN RAISE EXCEPTION 'Отмена поступления создаст отрицательный остаток. Сначала исправьте связанные расходы'; END IF;
   old:=to_jsonb(m); reversal:=NULL;
   IF m.reconciliation_key IS NOT NULL OR m.issue_document_id IS NOT NULL THEN
    INSERT INTO public.stock_movements(product_id,direction,quantity,created_by,taken_by,recipient_employee_id,recipient_name,comment,reason,unit_price,currency,stock_before,stock_after) VALUES(m.product_id,CASE WHEN m.direction='in' THEN 'out'::public.movement_direction ELSE 'in'::public.movement_direction END,m.quantity,auth.uid(),auth.uid(),m.recipient_employee_id,m.recipient_name,'Отмена операции '||m.id::text,'warehouse_reversal',m.unit_price,m.currency,before_qty,after_qty) RETURNING id INTO reversal;
   ELSE
    PERFORM set_config('app.warehouse_delete',m.id::text,true);
    DELETE FROM public.stock_movements WHERE id=m.id;
    UPDATE public.products SET stock_qty=after_qty WHERE id=p.id;
   END IF;
   IF m.direction='out' AND m.order_id IS NOT NULL THEN UPDATE public.order_parts SET actual_qty=greatest(0,coalesce(actual_qty,0)-m.quantity) WHERE order_id=m.order_id AND product_id=m.product_id; END IF;
   result:=jsonb_build_object('deleted',reversal IS NULL,'cancelled',reversal IS NOT NULL,'before',before_qty,'after',after_qty,'reversal_id',reversal,'document_id',m.issue_document_id);
   INSERT INTO public.warehouse_deletions(entity,entity_id,snapshot,result,actor_id,actor_name) VALUES('movement',m.id,old,result,auth.uid(),actor);
   INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name) VALUES('stock_movements',m.id,'warehouse_delete',old,result,auth.uid(),actor);
   INSERT INTO public.audit_log(actor_id,actor_name,action,entity,order_id,details) VALUES(auth.uid(),actor,CASE WHEN reversal IS NULL THEN 'Удаление операции' ELSE 'Отмена операции' END,'stock_movement',m.order_id,p.name||' | '||m.id::text||' | '||before_qty||' → '||after_qty);
  END LOOP;
 END IF;
 RETURN jsonb_build_object('replayed',false,'success',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_warehouse_record(text,uuid[],numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_warehouse_record(text,uuid[],numeric) TO authenticated,service_role;