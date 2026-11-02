CREATE TABLE public.scan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL,
  product_id uuid,
  product_name text,
  product_type_id uuid,
  kind text,
  module text NOT NULL,
  action text NOT NULL DEFAULT 'search',
  result text NOT NULL,
  quantity numeric,
  stock_after numeric,
  scanned_by uuid,
  scanned_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.scan_history TO authenticated;
GRANT ALL ON public.scan_history TO service_role;

ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users log own scans"
ON public.scan_history FOR INSERT TO authenticated
WITH CHECK (scanned_by = auth.uid());

CREATE POLICY "Warehouse roles read scan history"
ON public.scan_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'chief_accountant'));

CREATE OR REPLACE FUNCTION public.log_scan(_code text, _module text, _action text, _product_id uuid, _product_name text, _product_type_id uuid, _kind text, _result text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE _id uuid; _name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Kirish talab qilinadi'; END IF;
  IF coalesce(btrim(_code),'')='' OR coalesce(btrim(_module),'')='' OR _result NOT IN ('found','not_found') THEN RAISE EXCEPTION 'Skaner ma''lumoti noto‘g‘ri'; END IF;
  SELECT full_name INTO _name FROM public.profiles WHERE id=auth.uid();
  INSERT INTO public.scan_history(code,module,action,product_id,product_name,product_type_id,kind,result,scanned_by,scanned_by_name)
  VALUES(btrim(_code),btrim(_module),coalesce(nullif(btrim(_action),''),'search'),_product_id,_product_name,_product_type_id,_kind,_result,auth.uid(),_name)
  RETURNING id INTO _id;
  RETURN _id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finalize_scan(_id uuid, _action text, _quantity numeric, _stock_after numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Kirish talab qilinadi'; END IF;
  UPDATE public.scan_history
  SET action = coalesce(nullif(btrim(_action),''), action),
      quantity = _quantity,
      stock_after = _stock_after
  WHERE id = _id AND scanned_by = auth.uid() AND result = 'found' AND quantity IS NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public.stock_balance_check()
RETURNS TABLE(product_id uuid, name text, unit text, stock_qty numeric, history_qty numeric, diff numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT p.id, p.name, p.unit, p.stock_qty,
         COALESCE(h.qty, 0) AS history_qty,
         p.stock_qty - COALESCE(h.qty, 0) AS diff
  FROM public.products p
  LEFT JOIN (
    SELECT m.product_id, SUM(CASE WHEN m.direction='in' THEN m.quantity ELSE -m.quantity END) AS qty
    FROM public.stock_movements m
    WHERE m.product_id IS NOT NULL
    GROUP BY m.product_id
  ) h ON h.product_id = p.id
  WHERE p.instrument_id IS NULL
    AND abs(p.stock_qty - COALESCE(h.qty, 0)) > 0.0001
  ORDER BY abs(p.stock_qty - COALESCE(h.qty, 0)) DESC
$fn$;

REVOKE ALL ON FUNCTION public.stock_balance_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_balance_check() TO authenticated;