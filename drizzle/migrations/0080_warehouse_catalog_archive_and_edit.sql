ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS archived_by uuid, ADD COLUMN IF NOT EXISTS category text;
CREATE OR REPLACE FUNCTION public.warehouse_product_has_history(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.stock_movements WHERE product_id=_id) OR EXISTS(SELECT 1 FROM public.order_parts WHERE product_id=_id) OR EXISTS(SELECT 1 FROM public.order_template_parts WHERE product_id=_id) OR EXISTS(SELECT 1 FROM public.intake_items WHERE product_id=_id) OR EXISTS(SELECT 1 FROM public.returns WHERE product_id=_id) OR EXISTS(SELECT 1 FROM public.defects WHERE product_id=_id) OR EXISTS(SELECT 1 FROM public.order_supply_requests WHERE product_id=_id) OR EXISTS(SELECT 1 FROM public.service_request_items WHERE product_id=_id) OR EXISTS(SELECT 1 FROM public.stock_inventory_operations WHERE product_id=_id) $$;
REVOKE ALL ON FUNCTION public.warehouse_product_has_history(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.warehouse_product_has_history(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.archive_or_delete_warehouse_products(_ids uuid[],_expected_qty numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products%ROWTYPE; actor text; archive boolean; qty numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
 IF coalesce(cardinality(_ids),0)=0 OR cardinality(_ids)>100 THEN RAISE EXCEPTION 'Выберите товары'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply',0)); PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply2',0));
 PERFORM 1 FROM public.products WHERE id=ANY(_ids) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.products WHERE id=ANY(_ids))<>cardinality(_ids) THEN RAISE EXCEPTION 'Обновите список товаров'; END IF;
 SELECT sum(coalesce(stock_qty,0)),bool_or(coalesce(stock_qty,0)<>0 OR instrument_id IS NOT NULL OR public.warehouse_product_has_history(id)) INTO qty,archive FROM public.products WHERE id=ANY(_ids);
 IF qty IS DISTINCT FROM _expected_qty THEN RAISE EXCEPTION 'Остаток изменён. Обновите список'; END IF;
 IF NOT archive THEN RETURN public.delete_warehouse_record('product',_ids,_expected_qty); END IF;
 SELECT coalesce(full_name,email) INTO actor FROM public.profiles WHERE id=auth.uid();
 FOR p IN SELECT * FROM public.products WHERE id=ANY(_ids) ORDER BY id LOOP
  IF p.archived_at IS NOT NULL THEN CONTINUE; END IF;
  PERFORM set_config('app.warehouse_archive',p.id::text,true);
  UPDATE public.products SET archived_at=now(),archived_by=auth.uid() WHERE id=p.id;
 END LOOP;
 RETURN jsonb_build_object('archived',true,'count',cardinality(_ids),'stock',qty);
END $$;
REVOKE ALL ON FUNCTION public.archive_or_delete_warehouse_products(uuid[],numeric) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.archive_or_delete_warehouse_products(uuid[],numeric) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_warehouse_catalog_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.archived_by IS DISTINCT FROM OLD.archived_by THEN
  IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) OR current_setting('app.warehouse_archive',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Архивирование доступно только через подтверждённое действие склада'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER warehouse_catalog_update_guard BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_warehouse_catalog_update();
CREATE OR REPLACE FUNCTION public.audit_warehouse_catalog_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text; action text;
BEGIN
 IF auth.uid() IS NOT NULL AND (to_jsonb(NEW)-'stock_qty') IS DISTINCT FROM (to_jsonb(OLD)-'stock_qty') THEN
  SELECT coalesce(full_name,email) INTO actor FROM public.profiles WHERE id=auth.uid();
  action:=CASE WHEN NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN 'warehouse_archive' ELSE 'warehouse_catalog_edit' END;
  INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name) VALUES('products',NEW.id,action,to_jsonb(OLD),to_jsonb(NEW),auth.uid(),actor);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER warehouse_catalog_audit AFTER UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.audit_warehouse_catalog_update();
CREATE OR REPLACE FUNCTION public.guard_archived_product_use() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products%ROWTYPE;
BEGIN
 IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id THEN RETURN NEW; END IF;
 SELECT * INTO p FROM public.products WHERE id=NEW.product_id FOR UPDATE;
 IF p.archived_at IS NOT NULL THEN
  IF TG_TABLE_NAME='stock_movements' AND to_jsonb(NEW)->>'reason'='warehouse_reversal' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Товар в архиве: новые поступления и расходы запрещены';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER archived_product_stock_guard BEFORE INSERT OR UPDATE OF product_id ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.guard_archived_product_use();
CREATE TRIGGER archived_product_intake_guard BEFORE INSERT OR UPDATE OF product_id ON public.intake_items FOR EACH ROW EXECUTE FUNCTION public.guard_archived_product_use();
CREATE TRIGGER archived_product_order_guard BEFORE INSERT OR UPDATE OF product_id ON public.order_parts FOR EACH ROW EXECUTE FUNCTION public.guard_archived_product_use();
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.scan_catalog(text)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHERE p.instrument_id IS NULL','WHERE p.instrument_id IS NULL AND p.archived_at IS NULL'); EXECUTE definition;
 SELECT pg_get_functiondef('public.save_product_inventory(uuid,uuid,numeric,numeric,jsonb,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'''priority'',''currency''','''priority'',''currency'',''category'',''metal_type'',''thickness_mm'',''width_mm'',''length_mm'',''weight_kg'',''image_url''');
 definition:=replace(definition,'AND instrument_id IS NULL FOR UPDATE','AND instrument_id IS NULL AND archived_at IS NULL FOR UPDATE');
 definition:=replace(definition,'currency=CASE WHEN _changes','category=CASE WHEN _changes ? ''category'' THEN _changes->>''category'' ELSE category END, metal_type=CASE WHEN _changes ? ''metal_type'' THEN _changes->>''metal_type'' ELSE metal_type END, thickness_mm=CASE WHEN _changes ? ''thickness_mm'' THEN (_changes->>''thickness_mm'')::numeric ELSE thickness_mm END, width_mm=CASE WHEN _changes ? ''width_mm'' THEN (_changes->>''width_mm'')::numeric ELSE width_mm END, length_mm=CASE WHEN _changes ? ''length_mm'' THEN (_changes->>''length_mm'')::numeric ELSE length_mm END, weight_kg=CASE WHEN _changes ? ''weight_kg'' THEN (_changes->>''weight_kg'')::numeric ELSE weight_kg END, image_url=CASE WHEN _changes ? ''image_url'' THEN _changes->>''image_url'' ELSE image_url END, currency=CASE WHEN _changes'); EXECUTE definition;
END $$;