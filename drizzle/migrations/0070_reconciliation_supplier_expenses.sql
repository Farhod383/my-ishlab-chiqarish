CREATE TABLE public.reconciliation_documents (
 id uuid PRIMARY KEY, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL, result jsonb NOT NULL
);
GRANT SELECT ON public.reconciliation_documents TO authenticated;
GRANT ALL ON public.reconciliation_documents TO service_role;
ALTER TABLE public.reconciliation_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY reconciliation_documents_read ON public.reconciliation_documents FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'supply') OR public.has_role(auth.uid(),'chief_accountant') OR public.has_role(auth.uid(),'accountant'));
CREATE TABLE public.supplier_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES public.reconciliation_documents(id), category text NOT NULL, amount numeric NOT NULL, currency text NOT NULL, account text NOT NULL, employee_id uuid NOT NULL REFERENCES public.employees(id), employee_name text NOT NULL, comment text, spent_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, version integer NOT NULL DEFAULT 1,
 CONSTRAINT supplier_expense_amount CHECK (amount > 0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 CONSTRAINT supplier_expense_currency CHECK (currency IN ('UZS','USD')),
 CONSTRAINT supplier_expense_account CHECK (account IN ('supply','supply2')),
 CONSTRAINT supplier_expense_category CHECK (length(btrim(category)) > 0)
);
GRANT SELECT ON public.supplier_expenses TO authenticated;
GRANT ALL ON public.supplier_expenses TO service_role;
ALTER TABLE public.supplier_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_expenses_read ON public.supplier_expenses FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'supply') OR public.has_role(auth.uid(),'chief_accountant') OR public.has_role(auth.uid(),'accountant'));
CREATE INDEX supplier_expenses_account_date ON public.supplier_expenses(account,created_at) WHERE deleted_at IS NULL;
CREATE OR REPLACE FUNCTION public.lock_supplier_accounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply2',0));
 RETURN NULL;
END $$;
CREATE TRIGGER supplier_cash_serial BEFORE INSERT OR UPDATE OR DELETE ON public.cash_expenses FOR EACH STATEMENT EXECUTE FUNCTION public.lock_supplier_accounts();
CREATE TRIGGER supplier_stock_serial BEFORE INSERT OR UPDATE OR DELETE ON public.stock_movements FOR EACH STATEMENT EXECUTE FUNCTION public.lock_supplier_accounts();
CREATE OR REPLACE FUNCTION public.supplier_available(_account text,_currency text) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r timestamptz; opening_amount numeric; stock_amount numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'supply') OR public.has_role(auth.uid(),'chief_accountant') OR public.has_role(auth.uid(),'accountant')) THEN RAISE EXCEPTION 'Ruxsat yo‘q'; END IF;
 IF _account NOT IN ('supply','supply2') OR _currency NOT IN ('UZS','USD') THEN RAISE EXCEPTION 'Hisob yoki valyuta noto‘g‘ri'; END IF;
 r:=public.cash_reset_at(_account);
 SELECT coalesce(sum(coalesce((opening->>(pt||'_'||_currency))::numeric,0)),0) INTO opening_amount FROM (SELECT opening FROM public.cash_resets WHERE kassa=_account ORDER BY reset_at DESC LIMIT 1) s CROSS JOIN unnest(ARRAY['cash','transfer','corporate_card']) pt;
 IF _account='supply' THEN SELECT coalesce(sum(total),0) INTO stock_amount FROM public.supply_spendings WHERE currency=_currency AND created_at>=r;
 ELSE SELECT coalesce(sum(total),0) INTO stock_amount FROM public.supply2_spendings WHERE currency=_currency AND created_at>=r; END IF;
 RETURN coalesce(opening_amount,0)+coalesce((SELECT sum(amount) FROM public.cash_expenses WHERE purpose=_account AND currency=_currency AND created_at>=r),0)-stock_amount-coalesce((SELECT sum(amount) FROM public.supplier_expenses WHERE account=_account AND currency=_currency AND created_at>=r AND deleted_at IS NULL),0);
END $$;
REVOKE ALL ON FUNCTION public.supplier_available(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supplier_available(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.warehouse_reconcile_expenses(_key uuid,_product_id uuid,_name text,_unit text,_quantity numeric,_barcode text,_price numeric DEFAULT NULL,_currency text DEFAULT 'UZS',_technical jsonb DEFAULT '{}',_comment text DEFAULT NULL,_expenses jsonb DEFAULT '[]') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE payload jsonb; d public.reconciliation_documents%ROWTYPE; result jsonb; e jsonb; employee public.employees%ROWTYPE; total_row record; available numeric; actor text;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sverka kirimiga ruxsat yo‘q'; END IF;
 IF _key IS NULL OR _expenses IS NULL OR jsonb_typeof(_expenses)<>'array' THEN RAISE EXCEPTION 'So‘rov noto‘g‘ri'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply',0)); PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply2',0)); PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,0));
 payload:=jsonb_build_object('product_id',_product_id,'name',_name,'unit',_unit,'quantity',_quantity,'barcode',_barcode,'price',_price,'currency',_currency,'technical',_technical,'comment',_comment,'expenses',_expenses);
 SELECT * INTO d FROM public.reconciliation_documents WHERE id=_key;
 IF FOUND THEN
  IF d.created_by IS DISTINCT FROM auth.uid() OR d.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'So‘rov boshqa ma’lumot bilan ishlatilgan'; END IF;
  RETURN d.result || jsonb_build_object('replayed',true);
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_expenses) LOOP
  IF coalesce(btrim(e->>'category'),'')='' OR coalesce(e->>'account','') NOT IN ('supply','supply2') OR coalesce(e->>'currency','') NOT IN ('UZS','USD') OR coalesce((e->>'amount')::numeric,0)<=0 OR (e->>'amount') IN ('NaN','Infinity','-Infinity') OR nullif(e->>'spent_at','') IS NULL THEN RAISE EXCEPTION 'Xarajat maydonlarini to‘g‘ri kiriting'; END IF;
  SELECT * INTO employee FROM public.employees WHERE id=(e->>'employee_id')::uuid AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Faol ta’minotchini tanlang'; END IF;
 END LOOP;
 FOR total_row IN SELECT value->>'account' AS account,value->>'currency' AS currency,sum((value->>'amount')::numeric) AS total FROM jsonb_array_elements(_expenses) GROUP BY 1,2 LOOP
  available:=public.supplier_available(total_row.account,total_row.currency);
  IF total_row.total>available THEN RAISE EXCEPTION 'Mablag‘ yetarli emas: % %; mavjud: %',total_row.total,total_row.currency,available; END IF;
 END LOOP;
 result:=public.warehouse_reconcile_with_barcode(_key,_product_id,_name,_unit,_quantity,_barcode,_price,_currency,_technical,_comment);
 result:=result||jsonb_build_object('document_id',_key);
 INSERT INTO public.reconciliation_documents(id,created_by,payload,result) VALUES(_key,auth.uid(),payload,result);
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 FOR e IN SELECT value FROM jsonb_array_elements(_expenses) LOOP
  INSERT INTO public.supplier_expenses(document_id,category,amount,currency,account,employee_id,employee_name,comment,spent_at,created_by)
  SELECT _key,btrim(e->>'category'),(e->>'amount')::numeric,e->>'currency',e->>'account',id,full_name,nullif(btrim(e->>'comment'),''),(e->>'spent_at')::timestamptz,auth.uid() FROM public.employees WHERE id=(e->>'employee_id')::uuid;
 END LOOP;
 INSERT INTO public.entity_audit(entity,entity_id,action,new_value,actor_id,actor_name) VALUES('reconciliation_documents',_key,'supplier_expenses_created',payload,auth.uid(),actor);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_reconcile_expenses(uuid,uuid,text,text,numeric,text,numeric,text,jsonb,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_reconcile_expenses(uuid,uuid,text,text,numeric,text,numeric,text,jsonb,text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.change_supplier_expense(_id uuid,_version integer,_delete boolean DEFAULT false,_values jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_row public.supplier_expenses%ROWTYPE; new_row public.supplier_expenses%ROWTYPE; available numeric; actor text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply',0)); PERFORM pg_advisory_xact_lock(hashtextextended('supplier-account:supply2',0));
 SELECT * INTO old_row FROM public.supplier_expenses WHERE id=_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Xarajat topilmadi'; END IF;
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'chief_accountant') OR (NOT _delete AND public.has_role(auth.uid(),'accountant')) OR (old_row.created_by=auth.uid() AND (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'supply')))) THEN RAISE EXCEPTION 'Xarajatni o‘zgartirishga ruxsat yo‘q'; END IF;
 IF old_row.version<>_version THEN RAISE EXCEPTION 'Xarajat o‘zgargan; ro‘yxatni yangilang'; END IF;
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 IF _delete THEN UPDATE public.supplier_expenses SET deleted_at=now(),updated_at=now(),version=version+1 WHERE id=_id RETURNING * INTO new_row;
 ELSE
  new_row:=old_row;
  new_row.category:=btrim(_values->>'category'); new_row.amount:=(_values->>'amount')::numeric; new_row.currency:=_values->>'currency'; new_row.account:=_values->>'account'; new_row.employee_id:=(_values->>'employee_id')::uuid; new_row.spent_at:=(_values->>'spent_at')::timestamptz; new_row.comment:=nullif(btrim(_values->>'comment'),'');
  SELECT full_name INTO new_row.employee_name FROM public.employees WHERE id=new_row.employee_id;
  IF new_row.employee_name IS NULL OR coalesce(new_row.category,'')='' OR coalesce(new_row.amount,0)<=0 OR new_row.amount::text IN ('NaN','Infinity','-Infinity') OR coalesce(new_row.currency,'') NOT IN ('UZS','USD') OR coalesce(new_row.account,'') NOT IN ('supply','supply2') OR new_row.spent_at IS NULL THEN RAISE EXCEPTION 'Xarajat maydonlari noto‘g‘ri'; END IF;
  IF old_row.created_at>=public.cash_reset_at(new_row.account) THEN
   available:=public.supplier_available(new_row.account,new_row.currency);
   IF old_row.account=new_row.account AND old_row.currency=new_row.currency THEN available:=available+old_row.amount; END IF;
   IF new_row.amount>available THEN RAISE EXCEPTION 'Mablag‘ yetarli emas: % %; mavjud: %',new_row.amount,new_row.currency,available; END IF;
  END IF;
  UPDATE public.supplier_expenses SET category=new_row.category,amount=new_row.amount,currency=new_row.currency,account=new_row.account,employee_id=new_row.employee_id,employee_name=new_row.employee_name,comment=new_row.comment,spent_at=new_row.spent_at,updated_at=now(),version=version+1 WHERE id=_id RETURNING * INTO new_row;
 END IF;
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name) VALUES('supplier_expenses',_id,CASE WHEN _delete THEN 'delete' ELSE 'update' END,to_jsonb(old_row),to_jsonb(new_row),auth.uid(),actor);
END $$;
REVOKE ALL ON FUNCTION public.change_supplier_expense(uuid,integer,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.change_supplier_expense(uuid,integer,boolean,jsonb) TO authenticated;