CREATE OR REPLACE FUNCTION public.warehouse_reconcile(_key uuid, _product_id uuid, _name text, _unit text, _quantity numeric, _price numeric DEFAULT NULL::numeric, _currency text DEFAULT 'UZS'::text, _technical jsonb DEFAULT '{}'::jsonb, _comment text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE p public.products%ROWTYPE; m public.stock_movements%ROWTYPE; payload jsonb; after_qty numeric; actor text; delta numeric; dir public.movement_direction;
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
 dir := CASE WHEN delta > 0 THEN 'in'::public.movement_direction ELSE 'out'::public.movement_direction END;
 PERFORM set_config('app.reconciliation_key',_key::text,true);
 INSERT INTO public.stock_movements(product_id,direction,quantity,unit_price,currency,location,source,reason,comment,created_by,reconciliation_key,stock_before,stock_after,reconciliation_payload)
 VALUES(p.id,dir,abs(delta),coalesce(_price,0),CASE WHEN _price IS NULL THEN p.currency ELSE _currency END,'Sklad','Sverka — nakladnoysiz kirim','Sverka — nakladnoysiz kirim',_comment,auth.uid(),_key,p.stock_qty,_quantity,payload) RETURNING * INTO m;
 SELECT stock_qty INTO after_qty FROM public.products WHERE id=p.id;
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name)
 VALUES('stock_movements',m.id,'sverka_intake',jsonb_build_object('stock_qty',p.stock_qty),jsonb_build_object('stock_qty',after_qty,'product_id',p.id,'name',p.name,'delta',delta,'movement_id',m.id),auth.uid(),actor);
 RETURN jsonb_build_object('movement_id',m.id,'product_id',p.id,'before',p.stock_qty,'after',after_qty,'replayed',false);
END $function$;