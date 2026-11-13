CREATE OR REPLACE FUNCTION public.issue_employee_products(_key uuid,_employee_id uuid,_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); actor_name text; employee_name text; payload jsonb; previous public.stock_issue_documents%ROWTYPE; r record; p public.products%ROWTYPE; src uuid; q numeric; before_qty numeric; movement uuid; item jsonb; result jsonb:='[]'::jsonb;
BEGIN
 IF actor IS NULL OR NOT (public.has_role(actor,'admin') OR public.has_role(actor,'warehouse')) THEN RAISE EXCEPTION 'Mahsulot berishga ruxsat yo‘q'; END IF;
 IF _key IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Mahsulotlar ro‘yxati bo‘sh'; END IF;
 payload:=jsonb_build_object('employee_id',_employee_id,'items',_items);
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,0));
 SELECT * INTO previous FROM public.stock_issue_documents WHERE id=_key;
 IF FOUND THEN
  IF previous.payload IS DISTINCT FROM payload OR previous.created_by<>actor THEN RAISE EXCEPTION 'Qayta saqlash ma’lumotlari mos emas'; END IF;
  RETURN jsonb_build_object('document_id',_key,'replayed',true);
 END IF;
 SELECT full_name INTO employee_name FROM public.employees WHERE id=_employee_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Faol xodimni tanlang'; END IF;
 SELECT coalesce(nullif(full_name,''),email,'') INTO actor_name FROM public.profiles WHERE id=actor;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  q:=(item->>'quantity')::numeric;
  IF item->>'product_id' IS NULL OR q IS NULL OR q<=0 OR q::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Mahsulot va musbat miqdor talab qilinadi'; END IF;
 END LOOP;
 FOR r IN SELECT (value->>'product_id')::uuid AS id,sum((value->>'quantity')::numeric) AS qty FROM jsonb_array_elements(_items) GROUP BY 1 ORDER BY 1 LOOP
  SELECT * INTO p FROM public.products WHERE id=r.id FOR UPDATE;
  IF NOT FOUND OR p.instrument_id IS NOT NULL THEN RAISE EXCEPTION 'Sklad mahsuloti topilmadi'; END IF;
  IF coalesce(p.stock_qty,0)<r.qty THEN RAISE EXCEPTION 'Yetarli qoldiq mavjud emas: %, mavjud %, kerak %',p.name,p.stock_qty,r.qty; END IF;
 END LOOP;
 INSERT INTO public.stock_issue_documents(id,employee_id,employee_name,created_by,created_by_name,payload) VALUES(_key,_employee_id,employee_name,actor,coalesce(actor_name,''),payload);
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  SELECT * INTO p FROM public.products WHERE id=(item->>'product_id')::uuid;
  src:=NULL;
  IF nullif(item->>'order_id','') IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=(item->>'order_id')::uuid) THEN RAISE EXCEPTION 'Zakaz topilmadi'; END IF;
   SELECT source_order_id INTO src FROM public.stock_movements WHERE product_id=p.id AND direction='in' AND source_order_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
  END IF;
  q:=(item->>'quantity')::numeric; before_qty:=p.stock_qty;
  INSERT INTO public.stock_movements(product_id,order_id,direction,quantity,recipient_name,recipient_employee_id,comment,reason,created_by,taken_by,issue_document_id,source_order_id,cross_order_reason,stock_before,stock_after)
  VALUES(p.id,nullif(item->>'order_id','')::uuid,'out',q,employee_name,_employee_id,nullif(btrim(item->>'comment'),''),nullif(btrim(item->>'reason'),''),actor,actor,_key,src,nullif(btrim(item->>'cross_order_reason'),''),before_qty,before_qty-q) RETURNING id INTO movement;
  IF nullif(item->>'scan_id','') IS NOT NULL THEN PERFORM public.finalize_scan((item->>'scan_id')::uuid,'out',q,before_qty-q); END IF;
  result:=result||jsonb_build_array(jsonb_build_object('movement_id',movement,'product_id',p.id,'before',before_qty,'after',before_qty-q,'quantity',q));
 END LOOP;
 INSERT INTO public.audit_log(actor_id,actor_name,action,entity,details) VALUES(actor,actor_name,'Sklad umumiy topshirish','stock_issue_document',jsonb_build_object('document_id',_key,'employee_id',_employee_id,'items',_items)::text);
 RETURN jsonb_build_object('document_id',_key,'replayed',false,'items',result);
END $$;
REVOKE ALL ON FUNCTION public.issue_employee_products(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_employee_products(uuid,uuid,jsonb) TO authenticated;