BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e28cdde9-7d09-4a92-a17d-0feb26cc370c',true);
DO $$
DECLARE p public.products%ROWTYPE; employee uuid; k uuid:=gen_random_uuid(); result jsonb; replay jsonb; costs jsonb; e public.supplier_expenses%ROWTYPE; before_balance numeric; after_balance numeric; snapshot jsonb;
BEGIN
 SELECT * INTO p FROM public.products WHERE instrument_id IS NULL LIMIT 1;
 SELECT id INTO employee FROM public.employees WHERE status='active' LIMIT 1;
 before_balance:=public.supplier_available('supply','UZS');
 IF before_balance<1 THEN RAISE EXCEPTION 'Test needs available supply funds'; END IF;
 SELECT jsonb_build_object('cash',(SELECT count(*) FROM public.cash_expenses),'invoice',(SELECT count(*) FROM public.intake_sessions),'price',p.last_price,'stock',p.stock_qty) INTO snapshot;
 costs:=jsonb_build_array(jsonb_build_object('category','Benzin','amount',1,'currency','UZS','account','supply','employee_id',employee,'comment','Rollback test','spent_at',now()));
 result:=public.warehouse_reconcile_expenses(k,p.id,NULL,NULL,p.stock_qty,NULL,NULL,'UZS','{}',NULL,costs);
 replay:=public.warehouse_reconcile_expenses(k,p.id,NULL,NULL,p.stock_qty,NULL,NULL,'UZS','{}',NULL,costs);
 IF coalesce((replay->>'replayed')::boolean,false)<>true OR (SELECT count(*) FROM public.supplier_expenses WHERE document_id=k)<>1 THEN RAISE EXCEPTION 'Duplicate expense'; END IF;
 after_balance:=public.supplier_available('supply','UZS');
 IF after_balance<>before_balance-1 THEN RAISE EXCEPTION 'Debit mismatch % %',before_balance,after_balance; END IF;
 IF snapshot IS DISTINCT FROM jsonb_build_object('cash',(SELECT count(*) FROM public.cash_expenses),'invoice',(SELECT count(*) FROM public.intake_sessions),'price',(SELECT last_price FROM public.products WHERE id=p.id),'stock',(SELECT stock_qty FROM public.products WHERE id=p.id)) THEN RAISE EXCEPTION 'Cash invoice price stock changed'; END IF;
 SELECT * INTO e FROM public.supplier_expenses WHERE document_id=k;
 PERFORM public.change_supplier_expense(e.id,e.version,false,jsonb_build_object('category','Ovqat','amount',2,'currency','UZS','account','supply','employee_id',employee,'comment','','spent_at',now()));
 IF public.supplier_available('supply','UZS')<>before_balance-2 THEN RAISE EXCEPTION 'Edit balance mismatch'; END IF;
 BEGIN
  PERFORM public.change_supplier_expense(e.id,1,true,'{}'); RAISE EXCEPTION 'Stale version accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Stale version accepted' THEN RAISE; END IF; END;
 PERFORM public.change_supplier_expense(e.id,2,true,'{}');
 IF public.supplier_available('supply','UZS')<>before_balance THEN RAISE EXCEPTION 'Delete balance mismatch'; END IF;
 BEGIN
  PERFORM public.warehouse_reconcile_expenses(gen_random_uuid(),p.id,NULL,NULL,p.stock_qty,NULL,NULL,'UZS','{}',NULL,jsonb_build_array(jsonb_build_object('category','Benzin','amount',before_balance+1,'currency','UZS','account','supply','employee_id',employee,'spent_at',now()))); RAISE EXCEPTION 'Insufficient funds accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Insufficient funds accepted' THEN RAISE; END IF; END;
 RAISE NOTICE 'Supplier expense integration: idempotency, debit, edit, delete, stale version, insufficient funds, stock/price/cash/invoice independence passed';
END $$;
ROLLBACK;