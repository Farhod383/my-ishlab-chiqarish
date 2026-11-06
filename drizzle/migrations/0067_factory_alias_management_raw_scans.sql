ALTER TABLE public.scan_history ADD COLUMN IF NOT EXISTS raw_code text;
CREATE OR REPLACE FUNCTION public.log_scan_raw(_code text,_raw text,_module text,_action text,_product_id uuid,_product_name text,_product_type_id uuid,_kind text,_result text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE sid uuid; BEGIN sid:=public.log_scan(_code,_module,_action,_product_id,_product_name,_product_type_id,_kind,_result); UPDATE public.scan_history SET raw_code=_raw WHERE id=sid; RETURN sid; END $$;
REVOKE ALL ON FUNCTION public.log_scan_raw(text,text,text,text,uuid,text,uuid,text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.log_scan_raw(text,text,text,text,uuid,text,uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.bind_barcode_alias(_code text,_product_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE tid uuid; code text; canonical text; pname text; punit text; pkind text; BEGIN
IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse')) THEN RAISE EXCEPTION 'Kod biriktirishga ruxsat yo‘q'; END IF;
PERFORM pg_advisory_xact_lock(814720063);
code := (public.scan_code_variants(_code))[array_length(public.scan_code_variants(_code),1)];
IF coalesce(code,'')='' OR code !~ '^[ -~]+$' THEN RAISE EXCEPTION 'To‘g‘ri shtrix-kod kiriting'; END IF;
IF code LIKE 'MCT%' THEN RAISE EXCEPTION 'MCT kodi xodim bejigi uchun ajratilgan'; END IF;
SELECT product_type_id,name,unit,'product' INTO tid,pname,punit,pkind FROM public.products WHERE id=_product_id AND instrument_id IS NULL;
IF tid IS NULL THEN SELECT product_type_id,name,'dona','instrument' INTO tid,pname,punit,pkind FROM public.instruments WHERE id=_product_id; END IF;
IF tid IS NULL THEN RAISE EXCEPTION 'Mahsulot turi topilmadi'; END IF;
SELECT barcode INTO canonical FROM public.product_types WHERE id=tid;
IF EXISTS(SELECT 1 FROM public.product_types WHERE upper(barcode)=code AND id<>tid) OR EXISTS(SELECT 1 FROM public.product_type_barcode_aliases WHERE upper(barcode)=code AND product_type_id<>tid) THEN RAISE EXCEPTION 'Bu shtrix-kod boshqa mahsulot turiga biriktirilgan'; END IF;
IF upper(canonical)<>code AND NOT EXISTS(SELECT 1 FROM public.product_type_barcode_aliases WHERE upper(barcode)=code AND product_type_id=tid) THEN
INSERT INTO public.product_type_barcode_aliases(barcode,product_type_id,reason) VALUES(code,tid,'factory_code');
INSERT INTO public.entity_audit(entity,entity_id,action,new_value,actor_id,actor_name) VALUES('product_types',tid,'barcode_alias_bind',jsonb_build_object('barcode',code),auth.uid(),(SELECT full_name FROM public.profiles WHERE id=auth.uid())); END IF;
RETURN jsonb_build_object('product_id',_product_id,'id',_product_id,'product_type_id',tid,'name',pname,'unit',punit,'kind',pkind,'barcode',canonical,'alias',code); END $$;
CREATE OR REPLACE FUNCTION public.remove_factory_barcode(_type_id uuid,_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse')) THEN RAISE EXCEPTION 'Kod o‘chirishga ruxsat yo‘q'; END IF;
PERFORM pg_advisory_xact_lock(814720063);
IF NOT EXISTS(SELECT 1 FROM public.product_type_barcode_aliases WHERE product_type_id=_type_id AND barcode=_code AND reason IN ('factory_code','Qo‘lda kod biriktirish')) THEN RAISE EXCEPTION 'Faqat zavod kodini o‘chirish mumkin'; END IF;
DELETE FROM public.product_type_barcode_aliases WHERE product_type_id=_type_id AND barcode=_code AND reason IN ('factory_code','Qo‘lda kod biriktirish');
INSERT INTO public.entity_audit(entity,entity_id,action,old_value,actor_id,actor_name) VALUES('product_types',_type_id,'barcode_alias_remove',jsonb_build_object('barcode',_code),auth.uid(),(SELECT full_name FROM public.profiles WHERE id=auth.uid())); END $$;
REVOKE ALL ON FUNCTION public.bind_barcode_alias(text,uuid),public.remove_factory_barcode(uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.bind_barcode_alias(text,uuid),public.remove_factory_barcode(uuid,text) TO authenticated;