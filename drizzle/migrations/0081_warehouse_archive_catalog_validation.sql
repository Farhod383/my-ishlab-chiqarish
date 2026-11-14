CREATE OR REPLACE FUNCTION public.guard_warehouse_catalog_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.archived_by IS DISTINCT FROM OLD.archived_by THEN
  IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) OR current_setting('app.warehouse_archive',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Архивирование доступно только через подтверждённое действие склада'; END IF;
 END IF;
 IF (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN
  IF NEW.unit IS DISTINCT FROM OLD.unit AND (coalesce(OLD.stock_qty,0)<>0 OR public.warehouse_product_has_history(OLD.id)) THEN RAISE EXCEPTION 'Единицу измерения товара с остатком или историей нельзя изменить без пересчёта. Создайте отдельный тип товара'; END IF;
  IF NEW.thickness_mm<0 OR NEW.width_mm<0 OR NEW.length_mm<0 OR NEW.weight_kg<0 OR NEW.thickness_mm::text IN ('NaN','Infinity','-Infinity') OR NEW.width_mm::text IN ('NaN','Infinity','-Infinity') OR NEW.length_mm::text IN ('NaN','Infinity','-Infinity') OR NEW.weight_kg::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Размеры и вес должны быть конечными неотрицательными числами'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER archived_product_service_guard BEFORE INSERT OR UPDATE OF product_id ON public.service_request_items FOR EACH ROW EXECUTE FUNCTION public.guard_archived_product_use();
CREATE TRIGGER archived_product_supply_guard BEFORE INSERT OR UPDATE OF product_id ON public.order_supply_requests FOR EACH ROW EXECUTE FUNCTION public.guard_archived_product_use();
CREATE TRIGGER archived_product_template_guard BEFORE INSERT OR UPDATE OF product_id ON public.order_template_parts FOR EACH ROW EXECUTE FUNCTION public.guard_archived_product_use();
CREATE TRIGGER archived_product_returns_guard BEFORE INSERT OR UPDATE OF product_id ON public.returns FOR EACH ROW EXECUTE FUNCTION public.guard_archived_product_use();
CREATE TRIGGER archived_product_defects_guard BEFORE INSERT OR UPDATE OF product_id ON public.defects FOR EACH ROW EXECUTE FUNCTION public.guard_archived_product_use();