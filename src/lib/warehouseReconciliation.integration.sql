-- Execute transactionally through the privileged database test tool; no test rows survive.
BEGIN;
SELECT set_config('request.jwt.claim.sub','0b1a18e5-92fe-4679-bbf6-221224b521f4',true);
DO $$
DECLARE p public.products%ROWTYPE; r jsonb; k uuid:=gen_random_uuid(); snapshot jsonb; denied boolean; old_code text;
BEGIN
 SELECT * INTO p FROM public.products WHERE instrument_id IS NULL ORDER BY created_at LIMIT 1;
 SELECT jsonb_build_object('incomes',(SELECT count(*) FROM public.cash_incomes),'expenses',(SELECT count(*) FROM public.cash_expenses),'invoices',(SELECT count(*) FROM public.intake_sessions),'debts',(SELECT count(*) FROM public.debts),'supply',(SELECT coalesce(sum(total),0) FROM public.supply_spendings),'supply2',(SELECT coalesce(sum(total),0) FROM public.supply2_spendings)) INTO snapshot;
 r:=public.warehouse_reconcile(k,p.id,NULL,NULL,2,999,'USD','{}',NULL);
 IF (SELECT stock_qty FROM public.products WHERE id=p.id)<>p.stock_qty+2 OR (SELECT last_price FROM public.products WHERE id=p.id)<>p.last_price THEN RAISE EXCEPTION 'Stock or price mismatch'; END IF;
 r:=public.warehouse_reconcile(k,p.id,NULL,NULL,2,999,'USD','{}',NULL);
 IF NOT (r->>'replayed')::boolean OR (SELECT count(*) FROM public.stock_movements WHERE reconciliation_key=k)<>1 THEN RAISE EXCEPTION 'Retry double counted'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.entity_audit WHERE entity_id=(r->>'movement_id')::uuid AND action='sverka_intake' AND actor_id=auth.uid() AND (old_value->>'stock_qty')::numeric=p.stock_qty AND (new_value->>'stock_qty')::numeric=p.stock_qty+2) THEN RAISE EXCEPTION 'Stock audit missing'; END IF;
 denied:=false;
 BEGIN UPDATE public.stock_movements SET quantity=99 WHERE reconciliation_key=k; EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Sverka history mutable'; END IF;
 old_code:=p.mxik_code;
 PERFORM public.set_product_mxik(p.id,'00012345678901234',old_code);
 IF NOT EXISTS(SELECT 1 FROM public.entity_audit WHERE entity_id=p.id AND action='manual_mxik' AND new_value->>'mxik_code'='00012345678901234' AND old_value->>'mxik_code' IS NOT DISTINCT FROM old_code AND actor_id=auth.uid()) THEN RAISE EXCEPTION 'MXIK audit missing'; END IF;
 IF (SELECT barcode FROM public.products WHERE id=p.id) IS DISTINCT FROM p.barcode THEN RAISE EXCEPTION 'Barcode changed'; END IF;
 IF snapshot IS DISTINCT FROM jsonb_build_object('incomes',(SELECT count(*) FROM public.cash_incomes),'expenses',(SELECT count(*) FROM public.cash_expenses),'invoices',(SELECT count(*) FROM public.intake_sessions),'debts',(SELECT count(*) FROM public.debts),'supply',(SELECT coalesce(sum(total),0) FROM public.supply_spendings),'supply2',(SELECT coalesce(sum(total),0) FROM public.supply2_spendings)) THEN RAISE EXCEPTION 'Cash, debt or invoice changed'; END IF;
END $$;
ROLLBACK;