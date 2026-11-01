ALTER TABLE public.stock_movements ADD COLUMN reconciliation_key uuid, ADD COLUMN stock_before numeric, ADD COLUMN stock_after numeric, ADD COLUMN reconciliation_payload jsonb;
CREATE UNIQUE INDEX stock_movements_reconciliation_key_unique ON public.stock_movements(reconciliation_key) WHERE reconciliation_key IS NOT NULL;

CREATE FUNCTION public.guard_reconciliation_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN
  IF OLD.reconciliation_key IS NOT NULL THEN RAISE EXCEPTION 'Sverka yozuvi tarixda o‘zgarmas saqlanadi'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.reconciliation_key IS NOT NULL THEN RAISE EXCEPTION 'Oddiy kirimni sverkaga o‘tkazib bo‘lmaydi'; END IF;
 ELSE
  IF NEW.reconciliation_key IS NOT NULL AND (coalesce(current_setting('app.reconciliation_key',true),'')<>NEW.reconciliation_key::text OR NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin'))) THEN RAISE EXCEPTION 'Sverka kirimi faqat maxsus amal orqali bajariladi'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_reconciliation_movement BEFORE INSERT OR UPDATE OR DELETE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.guard_reconciliation_movement();

CREATE FUNCTION public.warehouse_reconcile(_key uuid, _product_id uuid, _name text, _unit text, _quantity numeric, _price numeric DEFAULT NULL, _currency text DEFAULT 'UZS', _technical jsonb DEFAULT '{}'::jsonb, _comment text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products%ROWTYPE; m public.stock_movements%ROWTYPE; payload jsonb; after_qty numeric; actor text;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sverka kirimiga ruxsat yo‘q'; END IF;
 IF _key IS NULL OR _quantity IS NULL OR _quantity<=0 OR _quantity::text IN ('NaN','Infinity','-Infinity') OR (_price IS NOT NULL AND (_price<0 OR _price::text IN ('NaN','Infinity','-Infinity'))) OR _currency IS NULL OR _currency NOT IN ('UZS','USD') THEN RAISE EXCEPTION 'Miqdor, narx yoki valyuta noto‘g‘ri'; END IF;
 payload:=jsonb_build_object('product_id',_product_id,'name',_name,'unit',_unit,'quantity',_quantity,'price',_price,'currency',_currency,'technical',_technical,'comment',_comment);
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,0));
 SELECT * INTO m FROM public.stock_movements WHERE reconciliation_key=_key;
 IF FOUND THEN
  IF m.created_by IS DISTINCT FROM auth.uid() OR m.reconciliation_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Bu so‘rov boshqa operatsiya uchun ishlatilgan'; END IF;
  RETURN jsonb_build_object('movement_id',m.id,'product_id',m.product_id,'before',m.stock_before,'after',m.stock_after,'replayed',true);
 END IF;
 IF _product_id IS NULL THEN
  IF coalesce(btrim(_name),'')='' OR coalesce(btrim(_unit),'')='' THEN RAISE EXCEPTION 'Mahsulot nomi va birligini kiriting'; END IF;
  INSERT INTO public.products(name,unit,last_price,currency,metal_type,thickness_mm,width_mm,length_mm,weight_kg)
  VALUES(btrim(_name),btrim(_unit),coalesce(_price,0),_currency,nullif(btrim(_technical->>'metal_type'),''),nullif(_technical->>'thickness_mm','')::numeric,nullif(_technical->>'width_mm','')::numeric,nullif(_technical->>'length_mm','')::numeric,nullif(_technical->>'weight_kg','')::numeric) RETURNING * INTO p;
 ELSE
  SELECT * INTO p FROM public.products WHERE id=_product_id AND instrument_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mahsulot topilmadi'; END IF;
 END IF;
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 PERFORM set_config('app.reconciliation_key',_key::text,true);
 INSERT INTO public.stock_movements(product_id,direction,quantity,unit_price,currency,location,source,reason,comment,created_by,reconciliation_key,stock_before,stock_after,reconciliation_payload)
 VALUES(p.id,'in',_quantity,coalesce(_price,0),CASE WHEN _price IS NULL THEN p.currency ELSE _currency END,'Sklad','Sverka — nakladnoysiz kirim','Sverka — nakladnoysiz kirim',_comment,auth.uid(),_key,p.stock_qty,p.stock_qty+_quantity,payload) RETURNING * INTO m;
 SELECT stock_qty INTO after_qty FROM public.products WHERE id=p.id;
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name)
 VALUES('stock_movements',m.id,'sverka_intake',jsonb_build_object('stock_qty',p.stock_qty),jsonb_build_object('stock_qty',after_qty,'product_id',p.id,'name',p.name,'quantity',_quantity,'movement_id',m.id),auth.uid(),actor);
 RETURN jsonb_build_object('movement_id',m.id,'product_id',p.id,'before',p.stock_qty,'after',after_qty,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.warehouse_reconcile(uuid,uuid,text,text,numeric,numeric,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_reconcile(uuid,uuid,text,text,numeric,numeric,text,jsonb,text) TO authenticated;

CREATE FUNCTION public.audit_manual_mxik() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text;
BEGIN
 IF NEW.mxik_code IS DISTINCT FROM OLD.mxik_code THEN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'chief_accountant') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'MXIK tahrirlashga ruxsat yo‘q'; END IF;
  SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
  INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name) VALUES('products',OLD.id,'manual_mxik',jsonb_build_object('mxik_code',OLD.mxik_code),jsonb_build_object('mxik_code',NEW.mxik_code,'name',NEW.name),auth.uid(),actor);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_manual_mxik BEFORE UPDATE OF mxik_code ON public.products FOR EACH ROW EXECUTE FUNCTION public.audit_manual_mxik();
CREATE FUNCTION public.set_product_mxik(_product_id uuid,_code text,_expected_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'chief_accountant') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'MXIK tahrirlashga ruxsat yo‘q'; END IF;
 IF _code IS NULL OR btrim(_code)='' THEN RAISE EXCEPTION 'MXIK kodini kiriting'; END IF;
 SELECT * INTO p FROM public.products WHERE id=_product_id AND instrument_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mahsulot topilmadi'; END IF;
 IF p.mxik_code IS DISTINCT FROM _expected_code THEN RAISE EXCEPTION 'MXIK o‘zgargan, mahsulotni qayta tanlang'; END IF;
 UPDATE public.products SET mxik_code=_code WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.set_product_mxik(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_product_mxik(uuid,text,text) TO authenticated;

CREATE OR REPLACE VIEW public.supply_spendings WITH (security_invoker=true) AS
SELECT m.id AS stock_movement_id,m.created_at,coalesce(p.name,ii.product_name) AS product_name,m.quantity,coalesce(p.unit,ii.unit) AS unit,m.unit_price,round(m.quantity*m.unit_price,2) AS total,upper(coalesce(m.currency,'UZS')) AS currency,m.recipient_name AS brought_by,m.source,m.order_id,o.order_number,m.created_by
FROM public.stock_movements m LEFT JOIN public.products p ON p.id=m.product_id LEFT JOIN public.intake_items ii ON ii.id=m.intake_item_id LEFT JOIN public.orders o ON o.id=m.order_id LEFT JOIN public.intake_sessions s ON s.id=m.intake_session_id
WHERE m.direction='in' AND lower(btrim(coalesce(m.recipient_name,'')))=ANY(ARRAY['sanjar','санжар']) AND m.created_at>=(SELECT min(coalesce(e.expense_date,e.created_at)) FROM public.cash_expenses e WHERE e.purpose='supply') AND coalesce(s.payment_type,'cash')<>'debt' AND m.reconciliation_key IS NULL;
CREATE OR REPLACE VIEW public.supply2_spendings WITH (security_invoker=true) AS
SELECT m.id AS stock_movement_id,m.created_at,coalesce(p.name,ii.product_name) AS product_name,m.quantity,coalesce(p.unit,ii.unit) AS unit,m.unit_price,round(m.quantity*m.unit_price,2) AS total,upper(coalesce(m.currency,'UZS')) AS currency,m.recipient_name AS brought_by,m.source,m.order_id,o.order_number,m.created_by
FROM public.stock_movements m LEFT JOIN public.products p ON p.id=m.product_id LEFT JOIN public.intake_items ii ON ii.id=m.intake_item_id LEFT JOIN public.orders o ON o.id=m.order_id LEFT JOIN public.intake_sessions s ON s.id=m.intake_session_id
WHERE m.direction='in' AND lower(btrim(coalesce(m.recipient_name,'')))=ANY(ARRAY['shovkat','шовкат','shavkat','шавкат']) AND coalesce(s.payment_type,'cash')<>'debt' AND m.reconciliation_key IS NULL;