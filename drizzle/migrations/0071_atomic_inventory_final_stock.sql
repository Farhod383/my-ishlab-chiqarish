CREATE TABLE public.stock_inventory_operations (
 id uuid PRIMARY KEY,
 product_id uuid NOT NULL REFERENCES public.products(id),
 product_name text NOT NULL,
 stock_before numeric NOT NULL,
 requested_stock numeric NOT NULL,
 delta numeric NOT NULL,
 stock_after numeric NOT NULL,
 movement_id uuid REFERENCES public.stock_movements(id),
 actor_id uuid NOT NULL,
 actor_name text,
 comment text,
 payload jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_inventory_operations TO authenticated;
GRANT ALL ON public.stock_inventory_operations TO service_role;
ALTER TABLE public.stock_inventory_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_read ON public.stock_inventory_operations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'));
CREATE OR REPLACE FUNCTION public.save_product_inventory(_key uuid, _product_id uuid, _quantity numeric, _expected_stock numeric, _changes jsonb DEFAULT '{}', _comment text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products%ROWTYPE; op public.stock_inventory_operations%ROWTYPE; m uuid; actor text; d numeric; actual numeric; payload jsonb; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Inventarizatsiyaga ruxsat yo‘q'; END IF;
 IF _key IS NULL OR _quantity IS NULL OR _expected_stock IS NULL OR _quantity<0 OR _quantity::text IN ('NaN','Infinity','-Infinity') OR _expected_stock::text IN ('NaN','Infinity','-Infinity') OR _changes IS NULL OR jsonb_typeof(_changes)<>'object' THEN RAISE EXCEPTION 'Yakuniy qoldiq noto‘g‘ri'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(_changes) k WHERE k NOT IN ('name','unit','last_price','min_limit','phone','source','priority','currency')) THEN RAISE EXCEPTION 'Tahrirlash maydoni noto‘g‘ri'; END IF;
 IF (_changes ? 'name' AND coalesce(btrim(_changes->>'name'),'')='') OR (_changes ? 'unit' AND coalesce(btrim(_changes->>'unit'),'')='') OR (_changes ? 'currency' AND coalesce(_changes->>'currency','') NOT IN ('USD','UZS')) OR (_changes ? 'last_price' AND (coalesce((_changes->>'last_price')::numeric,-1)<0 OR (_changes->>'last_price') IN ('NaN','Infinity','-Infinity'))) OR (_changes ? 'min_limit' AND (coalesce((_changes->>'min_limit')::numeric,-1)<0 OR (_changes->>'min_limit') IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'Mahsulot ma’lumotlari noto‘g‘ri'; END IF;
 payload:=jsonb_build_object('product_id',_product_id,'quantity',_quantity,'expected_stock',_expected_stock,'changes',_changes,'comment',_comment);
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply2',0));
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,0));
 SELECT * INTO op FROM public.stock_inventory_operations WHERE id=_key;
 IF FOUND THEN
  IF op.actor_id IS DISTINCT FROM auth.uid() OR op.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Operatsiya identifikatori boshqa so‘rovda ishlatilgan'; END IF;
  RETURN op.result || jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO p FROM public.products WHERE id=_product_id AND instrument_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mahsulot topilmadi'; END IF;
 IF p.stock_qty IS DISTINCT FROM _expected_stock THEN RAISE EXCEPTION 'Qoldiq boshqa operatsiya orqali o‘zgargan. Ma’lumotlarni yangilab, qayta tekshiring'; END IF;
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 UPDATE public.products SET
 name=CASE WHEN _changes ? 'name' THEN btrim(_changes->>'name') ELSE name END,
 unit=CASE WHEN _changes ? 'unit' THEN _changes->>'unit' ELSE unit END,
 last_price=CASE WHEN _changes ? 'last_price' THEN (_changes->>'last_price')::numeric ELSE last_price END,
 min_limit=CASE WHEN _changes ? 'min_limit' THEN (_changes->>'min_limit')::numeric ELSE min_limit END,
 phone=CASE WHEN _changes ? 'phone' THEN _changes->>'phone' ELSE phone END,
 source=CASE WHEN _changes ? 'source' THEN _changes->>'source' ELSE source END,
 priority=CASE WHEN _changes ? 'priority' THEN _changes->>'priority' ELSE priority END,
 currency=CASE WHEN _changes ? 'currency' THEN _changes->>'currency' ELSE currency END
 WHERE id=p.id;
 d:=_quantity-p.stock_qty;
 IF d<>0 THEN
  PERFORM set_config('app.reconciliation_key',_key::text,true);
  INSERT INTO public.stock_movements(product_id,direction,quantity,unit_price,currency,location,source,reason,recipient_name,comment,created_by,reconciliation_key,stock_before,stock_after,reconciliation_payload)
  VALUES(p.id,CASE WHEN d>0 THEN 'in'::public.movement_direction ELSE 'out'::public.movement_direction END,abs(d),0,p.currency,'Sklad','Inventarizatsiya','Inventarizatsiya','Qoldiq tuzatish',_comment,auth.uid(),_key,p.stock_qty,_quantity,payload) RETURNING id INTO m;
 END IF;
 SELECT stock_qty INTO actual FROM public.products WHERE id=p.id;
 IF actual IS DISTINCT FROM _quantity THEN RAISE EXCEPTION 'Inventarizatsiya qoldig‘i mos emas'; END IF;
 result:=jsonb_build_object('product_id',p.id,'movement_id',m,'before',p.stock_qty,'requested',_quantity,'delta',d,'after',actual,'replayed',false,'unchanged',d=0);
 INSERT INTO public.stock_inventory_operations(id,product_id,product_name,stock_before,requested_stock,delta,stock_after,movement_id,actor_id,actor_name,comment,payload,result)
 VALUES(_key,p.id,coalesce(_changes->>'name',p.name),p.stock_qty,_quantity,d,actual,m,auth.uid(),actor,_comment,payload,result);
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name)
 VALUES('products',p.id,'inventory_saved',to_jsonb(p),result || jsonb_build_object('operation_id',_key,'name',coalesce(_changes->>'name',p.name),'changes',_changes,'comment',_comment),auth.uid(),actor);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_product_inventory(uuid,uuid,numeric,numeric,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_product_inventory(uuid,uuid,numeric,numeric,jsonb,text) TO authenticated;