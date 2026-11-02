-- 1) Sverka: _quantity endi YAKUNIY qoldiq (target). Farq (delta) bitta atomik harakat bilan qo'llanadi;
--    trigger qoldiqni bir marta o'zgartiradi, RPC to'g'ridan-to'g'ri products.ga yozmaydi.
CREATE OR REPLACE FUNCTION public.warehouse_reconcile(_key uuid, _product_id uuid, _name text, _unit text, _quantity numeric, _price numeric DEFAULT NULL::numeric, _currency text DEFAULT 'UZS'::text, _technical jsonb DEFAULT '{}'::jsonb, _comment text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE p public.products%ROWTYPE; m public.stock_movements%ROWTYPE; payload jsonb; after_qty numeric; actor text; delta numeric; dir text;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sverka kirimiga ruxsat yo‘q'; END IF;
 IF _key IS NULL OR _quantity IS NULL OR _quantity < 0 OR _quantity::text IN ('NaN','Infinity','-Infinity') OR (_price IS NOT NULL AND (_price<0 OR _price::text IN ('NaN','Infinity','-Infinity'))) OR _currency IS NULL OR _currency NOT IN ('UZS','USD') THEN RAISE EXCEPTION 'Qoldiq, narx yoki valyuta noto‘g‘ri'; END IF;
 payload:=jsonb_build_object('product_id',_product_id,'name',_name,'unit',_unit,'quantity',_quantity,'price',_price,'currency',_currency,'technical',_technical,'comment',_comment);
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,0));
 SELECT * INTO m FROM public.stock_movements WHERE reconciliation_key=_key;
 IF FOUND THEN
  IF m.created_by IS DISTINCT FROM auth.uid() OR m.reconciliation_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Bu so‘rov boshqa operatsiya uchun ishlatilgan'; END IF;
  RETURN jsonb_build_object('movement_id',m.id,'product_id',m.product_id,'before',m.stock_before,'after',m.stock_after,'replayed',true);
 END IF;
 IF _product_id IS NULL THEN
  IF coalesce(btrim(_name),'')='' OR coalesce(btrim(_unit),'')='' THEN RAISE EXCEPTION 'Mahsulot nomi va birligini kiriting'; END IF;
  IF _quantity <= 0 THEN RAISE EXCEPTION 'Yangi mahsulot uchun boshlang‘ich qoldiq musbat bo‘lishi kerak'; END IF;
  INSERT INTO public.products(name,unit,last_price,currency,metal_type,thickness_mm,width_mm,length_mm,weight_kg)
  VALUES(btrim(_name),btrim(_unit),coalesce(_price,0),_currency,nullif(btrim(_technical->>'metal_type'),''),nullif(_technical->>'thickness_mm','')::numeric,nullif(_technical->>'width_mm','')::numeric,nullif(_technical->>'length_mm','')::numeric,nullif(_technical->>'weight_kg','')::numeric) RETURNING * INTO p;
 ELSE
  SELECT * INTO p FROM public.products WHERE id=_product_id AND instrument_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mahsulot topilmadi'; END IF;
 END IF;
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 delta := _quantity - p.stock_qty;
 IF delta = 0 THEN
  INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name)
  VALUES('products',p.id,'sverka_no_change',jsonb_build_object('stock_qty',p.stock_qty),jsonb_build_object('stock_qty',p.stock_qty,'product_id',p.id,'name',p.name),auth.uid(),actor);
  RETURN jsonb_build_object('movement_id',null,'product_id',p.id,'before',p.stock_qty,'after',p.stock_qty,'replayed',false,'unchanged',true);
 END IF;
 dir := CASE WHEN delta > 0 THEN 'in' ELSE 'out' END;
 PERFORM set_config('app.reconciliation_key',_key::text,true);
 INSERT INTO public.stock_movements(product_id,direction,quantity,unit_price,currency,location,source,reason,comment,created_by,reconciliation_key,stock_before,stock_after,reconciliation_payload)
 VALUES(p.id,dir,abs(delta),coalesce(_price,0),CASE WHEN _price IS NULL THEN p.currency ELSE _currency END,'Sklad','Sverka — nakladnoysiz kirim','Sverka — nakladnoysiz kirim',_comment,auth.uid(),_key,p.stock_qty,_quantity,payload) RETURNING * INTO m;
 SELECT stock_qty INTO after_qty FROM public.products WHERE id=p.id;
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name)
 VALUES('stock_movements',m.id,'sverka_intake',jsonb_build_object('stock_qty',p.stock_qty),jsonb_build_object('stock_qty',after_qty,'product_id',p.id,'name',p.name,'delta',delta,'movement_id',m.id),auth.uid(),actor);
 RETURN jsonb_build_object('movement_id',m.id,'product_id',p.id,'before',p.stock_qty,'after',after_qty,'replayed',false);
END $function$;

-- 2) Kunlik topshiriqlar: kelajak sana taqiqi + 100% da avtomatik yopish (haqiqiy foiz saqlanadi)
CREATE OR REPLACE FUNCTION public.daily_tasks_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.employee_id := COALESCE((SELECT canonical_id FROM daily_task_employee_aliases WHERE alias_id = NEW.employee_id), NEW.employee_id);
    NEW.assigned_by := COALESCE(auth.uid(), NEW.assigned_by);
    NEW.status := 'in_progress';
    IF NEW.task_date > (now() AT TIME ZONE 'Asia/Tashkent')::date THEN
      RAISE EXCEPTION 'Kelajak sanaga topshiriq berib bo''lmaydi.' USING ERRCODE = '23514';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('daily_task:'||NEW.employee_id::text));
    IF EXISTS (SELECT 1 FROM daily_tasks WHERE employee_id = NEW.employee_id AND status = 'in_progress') THEN
      RAISE EXCEPTION 'Bu xodimning joriy topshirig''i hali yopilmagan. Avval mavjud topshiriqni yakunlang.' USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM employees WHERE id = NEW.employee_id AND COALESCE(status,'active') = 'active') THEN
      RAISE EXCEPTION 'Xodim faol emas.';
    END IF;
  ELSE
    IF NEW.employee_id <> OLD.employee_id OR NEW.task_date <> OLD.task_date THEN
      RAISE EXCEPTION 'Topshiriq xodimi va sanasini o''zgartirib bo''lmaydi.';
    END IF;
    -- 100% ga yetganda avtomatik yopish (foiz o'zgartirilmaydi)
    IF NEW.status = 'in_progress' AND OLD.status = 'in_progress' AND NEW.progress >= 100 AND OLD.progress < 100 THEN
      NEW.status := 'closed';
    END IF;
    IF NEW.status = 'in_progress' AND OLD.status <> 'in_progress' THEN
      PERFORM pg_advisory_xact_lock(hashtext('daily_task:'||NEW.employee_id::text));
      IF EXISTS (SELECT 1 FROM daily_tasks WHERE employee_id = NEW.employee_id AND status = 'in_progress' AND id <> NEW.id) THEN
        RAISE EXCEPTION 'Bu xodimning joriy topshirig''i hali yopilmagan. Avval mavjud topshiriqni yakunlang.' USING ERRCODE = '23505';
      END IF;
      NEW.closed_at := NULL;
    ELSIF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      NEW.closed_at := now();
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $function$;