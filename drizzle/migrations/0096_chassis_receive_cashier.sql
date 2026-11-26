-- 0096: shassi qabuli — buxgalter va kassirga (bosh buxgalterga emas). Kassir Shassi bo'limini ko'radi.
-- Rasm yuklash ham shu rollarga (avval faqat omborchi edi).

CREATE OR REPLACE FUNCTION public.chassis_can_view() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager','marketing','warehouse','otk','engineer','accountant','chief_accountant','cashier'))
$$;

DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS chassis_photos_upload ON storage.objects;
    CREATE POLICY chassis_photos_upload ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'chassis-photos' AND ((SELECT public.has_role(auth.uid(), 'accountant')) OR (SELECT public.has_role(auth.uid(), 'cashier'))
        OR (SELECT public.has_role(auth.uid(), 'admin'))));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.chassis_expect(_vins text[], _client_id uuid, _proxy text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['accountant','cashier']::public.app_role[]);
  v text; raw text; ex record; rejected jsonb := '[]'::jsonb; added int := 0; seen text[] := '{}'; cid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id) THEN RAISE EXCEPTION 'Buyurtmachi topilmadi'; END IF;
  FOREACH raw IN ARRAY coalesce(_vins, '{}') LOOP
    v := public.chassis_normalize_vin(raw);
    CONTINUE WHEN v = '';
    IF v !~ '^[A-HJ-NPR-Z0-9]{17}$' THEN
      rejected := rejected || jsonb_build_object('vin', raw, 'reason', 'VIN noto''g''ri: 17 belgi, I/O/Q bo''lmaydi');
    ELSIF v = ANY(seen) THEN
      rejected := rejected || jsonb_build_object('vin', v, 'reason', 'Ro''yxatda takrorlangan');
    ELSE
      SELECT c.status, (SELECT a.act_no FROM public.chassis_act_items i JOIN public.chassis_acts a ON a.id = i.act_id
                         WHERE i.chassis_id = c.id AND a.status <> 'void' LIMIT 1) AS act_no
        INTO ex FROM public.chassis c WHERE c.vin = v;
      IF FOUND THEN
        rejected := rejected || jsonb_build_object('vin', v, 'reason',
          'VIN allaqachon reestrda: ' || public.chassis_status_label(ex.status::text) || coalesce(', ' || ex.act_no, ''));
      ELSE
        INSERT INTO public.chassis(vin, client_id, inbound_proxy, status) VALUES (v, _client_id, _proxy, 'expected') RETURNING id INTO cid;
        PERFORM public.chassis__log(cid, NULL, NULL, 'expected', r, 'Kutilayotganlar ro''yxatiga qo''shildi');
        added := added + 1;
      END IF;
    END IF;
    seen := seen || v;
  END LOOP;
  PERFORM public.chassis__end();
  RETURN jsonb_build_object('added', added, 'rejected', rejected);
END $$;

CREATE OR REPLACE FUNCTION public.chassis_receive(_vin text, _engine_no text, _mileage int, _kit jsonb, _defects text,
  _photo_paths text[], _proxy text, _body_type_id uuid DEFAULT NULL, _client_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['accountant','cashier']::public.app_role[]);
  v text := public.chassis_normalize_vin(_vin); c record; cid uuid; act text;
BEGIN
  IF v !~ '^[A-HJ-NPR-Z0-9]{17}$' THEN RAISE EXCEPTION 'VIN noto''g''ri: 17 belgi, I/O/Q bo''lmaydi'; END IF;
  IF coalesce(array_length(array_remove(_photo_paths, NULL), 1), 0) < 1 THEN RAISE EXCEPTION 'Kamida 1 ta rasm kerak'; END IF;
  IF nullif(trim(coalesce(_proxy, '')), '') IS NULL THEN RAISE EXCEPTION 'Buyurtmachi ishonchnomasini kiriting'; END IF;
  SELECT * INTO c FROM public.chassis WHERE vin = v FOR UPDATE;
  IF FOUND THEN
    IF c.status <> 'expected' THEN
      SELECT a.act_no INTO act FROM public.chassis_act_items i JOIN public.chassis_acts a ON a.id = i.act_id
       WHERE i.chassis_id = c.id AND a.status <> 'void' LIMIT 1;
      RAISE EXCEPTION 'VIN allaqachon reestrda: %, %', public.chassis_status_label(c.status::text), coalesce(act, 'aktsiz');
    END IF;
    IF _client_id IS NOT NULL AND _client_id <> c.client_id THEN RAISE EXCEPTION 'Bu VIN boshqa buyurtmachidan kutilmoqda'; END IF;
    UPDATE public.chassis SET status = 'received', engine_no = nullif(trim(_engine_no), ''), mileage_km = _mileage,
      kit = coalesce(_kit, '{}'::jsonb), defects = nullif(trim(coalesce(_defects, '')), ''), photo_paths = _photo_paths,
      inbound_proxy = _proxy, body_type_id = coalesce(_body_type_id, body_type_id), received_at = now(), received_by = auth.uid()
    WHERE id = c.id;
    cid := c.id;
    PERFORM public.chassis__log(cid, NULL, 'expected', 'received', r, 'Qabul qilindi');
  ELSE
    IF _client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id) THEN
      RAISE EXCEPTION 'Ro''yxatda yo''q VIN uchun buyurtmachini tanlang';
    END IF;
    INSERT INTO public.chassis(vin, engine_no, client_id, inbound_proxy, received_at, received_by, mileage_km, kit, defects, photo_paths, body_type_id, status)
    VALUES (v, nullif(trim(_engine_no), ''), _client_id, _proxy, now(), auth.uid(), _mileage, coalesce(_kit, '{}'::jsonb),
            nullif(trim(coalesce(_defects, '')), ''), _photo_paths, _body_type_id, 'received')
    RETURNING id INTO cid;
    PERFORM public.chassis__log(cid, NULL, NULL, 'received', r, 'Qabul qilindi (kutilganlar ro''yxatida yo''q edi)');
  END IF;
  PERFORM public.chassis__end();
  RETURN cid;
END $$;
