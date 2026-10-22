CREATE OR REPLACE FUNCTION public.order_prefix(_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE
 WHEN n ~ '(selnometal|сельнометал)' THEN 'SEL'
 WHEN n ~ '(parm|парм)' THEN 'PARM'
 WHEN n ~ '(^|[^[:alnum:]])(kis|кис)([^[:alnum:]]|$)|kislotovoz|кислотовоз' THEN 'KIS'
 WHEN n ~ '(^|[^[:alnum:]])(asm|асм)([^[:alnum:]]|$)|assenizator|asseniz|ассениз' THEN 'ASM'
 WHEN n ~ '(^|[^[:alnum:]])(atz|атз)([^[:alnum:]]|$)|avtotopliv|автотоплив' THEN 'ATZ'
 WHEN n ~ '(^|[^[:alnum:]])(pro|про)([^[:alnum:]]|$)|promtovar|промтовар' THEN 'PRO'
 WHEN n ~ '(^|[^[:alnum:]])(izo|изо)([^[:alnum:]]|$)|izoterm|изотерм' THEN 'IZO'
 WHEN n ~ '(^|[^[:alnum:]])(mus|мус)([^[:alnum:]]|$)|musravoz|musorovoz|мусоровоз' THEN 'MUS'
 WHEN n ~ '(mikser|miksir|миксер)' THEN 'MIK'
 WHEN n ~ '(kmu|кму|kran[[:space:]-]*manipul|кран[[:space:]-]*манипул)' THEN 'KMU'
 ELSE 'KDM' END
 FROM (SELECT lower(regexp_replace(coalesce(_name,''), '[’''ʼ`]', '', 'g')) n) s
$$;
CREATE OR REPLACE FUNCTION public.assign_order_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text; s text; nxt bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('order_numbering'));
 p := public.order_prefix(NEW.product_name);
 s := public.order_series(p);
 SELECT GREATEST(coalesce(max((substring(order_number from '^(?:KIS|ASM|ATZ|PRO|IZO|MUS|KDM|KMU|MIK|PARM|SEL)([0-9]{4,})$'))::bigint),0),count(*))+1 INTO nxt
 FROM public.orders o WHERE public.order_series(public.order_prefix(o.product_name))=s;
 IF NEW.order_number IS NOT NULL AND NEW.order_number <> '' AND NEW.order_number !~ '^(KIS|ASM|ATZ|PRO|IZO|MUS|KDM|KMU|MIK|PARM|SEL)[0-9]{4,}$' THEN
 NEW.legacy_order_number := NEW.order_number;
 END IF;
 NEW.order_number := p || lpad(nxt::text,GREATEST(4,length(nxt::text)),'0');
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.renumber_orders(_include_completed boolean) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; cnt int := 0;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing')) THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('order_numbering'));
 CREATE TEMP TABLE _ren ON COMMIT DROP AS
 SELECT o.id,o.order_number AS old_no,
 public.order_prefix(o.product_name) || lpad(seq::text,GREATEST(4,length(seq::text)),'0') AS new_no,o.status
 FROM (SELECT o.*,row_number() OVER (PARTITION BY public.order_series(public.order_prefix(o.product_name)) ORDER BY o.created_at,o.id) seq FROM public.orders o) o;
 DELETE FROM _ren WHERE old_no=new_no OR (NOT _include_completed AND status::text IN ('completed','cancelled')) OR (_include_completed AND status::text NOT IN ('completed','cancelled'));
 IF EXISTS(SELECT 1 FROM _ren x JOIN public.orders o ON o.order_number=x.new_no AND o.id NOT IN(SELECT id FROM _ren)) THEN RAISE EXCEPTION 'Raqam to''qnashuvi: avval boshqa zakazlarni yangilang'; END IF;
 UPDATE public.orders o SET order_number='TMP-'||o.id::text FROM _ren x WHERE x.id=o.id;
 FOR r IN SELECT * FROM _ren LOOP
 UPDATE public.orders SET order_number=r.new_no,legacy_order_number=coalesce(legacy_order_number,r.old_no) WHERE id=r.id;
 INSERT INTO public.order_number_history(order_id,old_number,new_number,changed_by) VALUES(r.id,r.old_no,r.new_no,auth.uid());
 INSERT INTO public.audit_log(actor_id,action,entity,order_id,details) VALUES(auth.uid(),'order.renumber','order',r.id,r.old_no||' → '||r.new_no);
 cnt:=cnt+1;
 END LOOP;
 RETURN cnt;
END $$;