-- 0095: Shassi qabuli → 1C:УК «Приходная накладная» («Прием в переработку») QORALAMASI — bazaning o'zidan (pg_net).
-- Edge function (onec-chassis-intake) o'rniga: Lovable'siz ishlaydi. Mantiq _shared/onecUk.ts bilan bir xil.
-- pg_net so'rovlari tranzaksiyadan keyin ketadi, shuning uchun ish bosqichma-bosqich (integration_log.request = holat):
--   fetch → (javoblar) → [nom_wait] → doc_wait → ok/error. Har bosqichni onec__tick() suradi:
--   ERP sahifasi har 2 soniyada so'raydi (onec_intake_status) + pg_cron har daqiqada (onec_intake_tick_all).
-- 1C'da hujjat HECH QACHON o'tkazilmaydi (Posted=false) — buxgalter tekshirib o'tkazadi yoki o'chiradi.
-- Parol bazada ochiq saqlanmaydi: Supabase Vault'da 'clobus_uk_password' nomi bilan (admin o'zi kiritadi).

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1C:УК dagi doimiy ma'lumotlar (26.11.2026 OData'dan o'qilgan)
CREATE OR REPLACE FUNCTION public.onec__uk(_k text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _k
    WHEN 'url' THEN 'https://clobus.uz/a/sbm/77249/odata/standard.odata'
    WHEN 'organization' THEN '6eae1a8e-c6f9-11f1-817c-043f72d861a4'
    WHEN 'department' THEN '750e6cc5-c6f9-11f1-817c-043f72d861a4'
    WHEN 'warehouse' THEN '750e6cc6-c6f9-11f1-817c-043f72d861a4'
    WHEN 'currency' THEN '812c8d8a-c6f9-11f1-817c-043f72d861a4'
    WHEN 'vat_none' THEN '812c8ff3-c6f9-11f1-817c-043f72d861a4'
    WHEN 'unit_pcs' THEN '7b2de355-c6f9-11f1-817c-043f72d861a4'
    WHEN 'nomenclature' THEN 'Шасси давальческое (заказчика)'
    WHEN 'empty' THEN '00000000-0000-0000-0000-000000000000'
  END $$;

-- URL uchun foiz-kodlash (UTF-8 baytlari; A-Z a-z 0-9 - _ . ~ o'zgarmaydi)
CREATE OR REPLACE FUNCTION public.onec__urlenc(_s text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE b bytea := convert_to(coalesce(_s, ''), 'UTF8'); out text := ''; i int; c int;
BEGIN
  FOR i IN 0 .. length(b) - 1 LOOP
    c := get_byte(b, i);
    IF (c BETWEEN 48 AND 57) OR (c BETWEEN 65 AND 90) OR (c BETWEEN 97 AND 122) OR c IN (45, 95, 46, 126) THEN
      out := out || chr(c);
    ELSE
      out := out || '%' || upper(lpad(to_hex(c), 2, '0'));
    END IF;
  END LOOP;
  RETURN out;
END $$;

-- «$select=a,b&$top=500» (qiymatlar kodlangan)
CREATE OR REPLACE FUNCTION public.onec__q(VARIADIC kv text[]) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE i int := 1; out text := '';
BEGIN
  WHILE i < coalesce(array_length(kv, 1), 0) LOOP
    out := out || '&' || kv[i] || '=' || public.onec__urlenc(kv[i + 1]);
    i := i + 2;
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.onec__headers() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  usr text := coalesce((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'clobus_uk_user' LIMIT 1), 'odata.mcity');
  pwd text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'clobus_uk_password' LIMIT 1);
BEGIN
  IF pwd IS NULL OR pwd = '' THEN RAISE EXCEPTION '1C paroli kiritilmagan (Vault: clobus_uk_password)'; END IF;
  RETURN jsonb_build_object(
    'Authorization', 'Basic ' || replace(encode(convert_to(usr || ':' || pwd, 'UTF8'), 'base64'), E'\n', ''),
    'Accept', 'application/json', 'Content-Type', 'application/json');
END $$;

CREATE OR REPLACE FUNCTION public.onec__url(_entity text, _query text DEFAULT '') RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT rtrim(coalesce((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'clobus_uk_url' LIMIT 1), public.onec__uk('url')), '/')
    || '/' || public.onec__urlenc(_entity) || '?$format=json' || coalesce(_query, '')
$$;

CREATE OR REPLACE FUNCTION public.onec__get(_entity text, _query text DEFAULT '') RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT net.http_get(url => public.onec__url(_entity, _query), headers => public.onec__headers(), timeout_milliseconds => 60000)
$$;

CREATE OR REPLACE FUNCTION public.onec__post(_entity text, _body jsonb) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT net.http_post(url => public.onec__url(_entity), body => _body, headers => public.onec__headers(), timeout_milliseconds => 60000)
$$;

-- Javob: NULL — hali kelmagan; xato bo'lsa EXCEPTION; aks holda jsonb
CREATE OR REPLACE FUNCTION public.onec__resp(_id bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; msg text;
BEGIN
  SELECT status_code, content, timed_out, error_msg INTO r FROM net._http_response WHERE id = _id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.timed_out THEN RAISE EXCEPTION '1C javob bermadi (vaqt tugadi)'; END IF;
  IF r.error_msg IS NOT NULL THEN RAISE EXCEPTION '1C ga ulanib bo''lmadi: %', r.error_msg; END IF;
  IF r.status_code < 200 OR r.status_code >= 300 THEN
    BEGIN msg := (r.content::jsonb) -> 'odata.error' -> 'message' ->> 'value'; EXCEPTION WHEN others THEN msg := NULL; END;
    RAISE EXCEPTION '1C %: %', r.status_code, left(coalesce(msg, regexp_replace(coalesce(r.content, ''), '\s+', ' ', 'g')), 300);
  END IF;
  RETURN CASE WHEN coalesce(r.content, '') = '' THEN '{}'::jsonb ELSE r.content::jsonb END;
END $$;

-- Hujjat tanasi (sof funksiya)
CREATE OR REPLACE FUNCTION public.onec__intake_body(_ch public.chassis, _cp text, _con text, _nom text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE at_local text := to_char(_ch.received_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD"T"HH24:MI:SS');
  empty text := public.onec__uk('empty');
  note text := concat_ws('; ', 'ERP: давальческое шасси VIN ' || _ch.vin, 'двигатель ' || nullif(_ch.engine_no, ''),
    'акт приёма ' || _ch.intake_act_no, 'доверенность ' || nullif(_ch.inbound_proxy, ''));
BEGIN
  RETURN jsonb_build_object(
    'Date', at_local, 'Posted', false, 'DeletionMark', false, 'ВидОперации', 'ПриемВПереработку',
    'Организация_Key', public.onec__uk('organization'), 'Подразделение_Key', public.onec__uk('department'),
    'СтруктурнаяЕдиница_Key', public.onec__uk('warehouse'), 'ПоложениеСклада', 'ВШапке',
    'Контрагент_Key', _cp, 'Договор_Key', coalesce(_con, empty), 'ВалютаДокумента_Key', public.onec__uk('currency'),
    'Курс', 1, 'Кратность', '1', 'СуммаВключаетНДС', true, 'СуммаДокумента', 0,
    'НомерВходящегоДокумента', coalesce(_ch.intake_act_no, ''), 'ДатаВходящегоДокумента', at_local,
    'Комментарий', note || '. Создано из ERP как черновик — проверьте и проведите.',
    'Запасы', jsonb_build_array(jsonb_build_object(
      'LineNumber', '1', 'Номенклатура_Key', coalesce(_nom, empty), 'ЕдиницаИзмерения', public.onec__uk('unit_pcs'),
      'ЕдиницаИзмерения_Type', 'StandardODATA.Catalog_КлассификаторЕдиницИзмерения', 'Количество', 1, 'Цена', 0, 'Сумма', 0,
      'СтавкаНДС_Key', public.onec__uk('vat_none'), 'СуммаНДС', 0, 'Всего', 0, 'Содержание', 'Шасси VIN ' || _ch.vin,
      'Комментарий', _ch.vin, 'СтруктурнаяЕдиница_Key', public.onec__uk('warehouse'))));
END $$;

-- Bir bosqich oldinga. Qaytaradi: {status: pending|ok|error, ...}
CREATE OR REPLACE FUNCTION public.onec__tick(_log_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lg record; ch public.chassis; cl record; st jsonb; ids jsonb;
  docs jsonb; cps jsonb; cons jsonb; noms jsonb; d jsonb; made jsonb;
  cp_key text; con_key text; con_why text; nom_key text; nos text[]; live jsonb; by_no jsonb; buyers jsonb;
  empty text := public.onec__uk('empty'); err text;
BEGIN
  SELECT * INTO lg FROM public.integration_log WHERE id = _log_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pending'); END IF;
  IF lg.status <> 'pending' THEN RETURN jsonb_build_object('status', lg.status, 'ref', lg.onec_ref, 'message', lg.response); END IF;
  SELECT * INTO ch FROM public.chassis WHERE id = lg.erp_id;
  SELECT id, name, inn INTO cl FROM public.clients WHERE id = ch.client_id;
  st := coalesce(lg.request, '{}'::jsonb);
  ids := coalesce(st -> 'ids', '{}'::jsonb);

  BEGIN
    IF lg.updated_at < now() - interval '5 minutes' AND st ->> 'stage' <> 'fetch' THEN
      RAISE EXCEPTION '1C javob bermadi (5 daqiqa). «1C''ga qayta yuborish» ni bosing';
    END IF;

    IF st ->> 'stage' = 'fetch' THEN
      IF cl.inn IS NULL OR cl.inn = '' THEN
        RAISE EXCEPTION 'Mijoz «%» kartasiga STIR (INN) kiriting, keyin qayta yuboring', coalesce(cl.name, '—');
      END IF;
      ids := jsonb_build_object(
        'docs', public.onec__get('Document_ПриходнаяНакладная', public.onec__q('$select', 'Ref_Key,Number,НомерВходящегоДокумента,DeletionMark', '$orderby', 'Date desc', '$top', '500')),
        'cps', public.onec__get('Catalog_Контрагенты', public.onec__q('$select', 'Ref_Key,Description,ИНН,DeletionMark,IsFolder')),
        'cons', public.onec__get('Catalog_ДоговорыКонтрагентов', public.onec__q('$select', 'Ref_Key,Owner,Description,НомерДоговора,ВидДоговора,DeletionMark,Недействителен,Организация_Key')),
        'noms', public.onec__get('Catalog_Номенклатура', public.onec__q('$select', 'Ref_Key,Description,DeletionMark,IsFolder')));
      UPDATE public.integration_log SET request = jsonb_build_object('stage', 'fetched', 'ids', ids), updated_at = now() WHERE id = lg.id;
      RETURN jsonb_build_object('status', 'pending', 'stage', 'fetched');
    END IF;

    IF st ->> 'stage' = 'fetched' THEN
      docs := public.onec__resp((ids ->> 'docs')::bigint); cps := public.onec__resp((ids ->> 'cps')::bigint);
      cons := public.onec__resp((ids ->> 'cons')::bigint); noms := public.onec__resp((ids ->> 'noms')::bigint);
      IF docs IS NULL OR cps IS NULL OR cons IS NULL OR noms IS NULL THEN RETURN jsonb_build_object('status', 'pending', 'stage', 'fetched'); END IF;

      -- takrorlanmasin
      IF ch.intake_act_no IS NOT NULL THEN
        SELECT x INTO d FROM jsonb_array_elements(coalesce(docs -> 'value', '[]')) x
         WHERE NOT coalesce((x ->> 'DeletionMark')::boolean, false) AND x ->> 'НомерВходящегоДокумента' = ch.intake_act_no LIMIT 1;
        IF d IS NOT NULL THEN
          UPDATE public.chassis SET onec_intake_ref = d ->> 'Ref_Key' WHERE id = ch.id;
          UPDATE public.integration_log SET status = 'ok', onec_ref = d ->> 'Ref_Key', response = '1C''da allaqachon bor: ' || (d ->> 'Number'), updated_at = now() WHERE id = lg.id;
          RETURN jsonb_build_object('status', 'ok', 'ref', d ->> 'Ref_Key', 'number', d ->> 'Number', 'already', true);
        END IF;
      END IF;

      SELECT x ->> 'Ref_Key' INTO cp_key FROM jsonb_array_elements(coalesce(cps -> 'value', '[]')) x
       WHERE NOT coalesce((x ->> 'DeletionMark')::boolean, false) AND NOT coalesce((x ->> 'IsFolder')::boolean, false)
         AND trim(coalesce(x ->> 'ИНН', '')) = cl.inn LIMIT 1;
      IF cp_key IS NULL THEN
        RAISE EXCEPTION '1C:УК da STIR % («%») bilan kontragent yo''q. Buxgalter kontragentni qo''shsin, keyin qayta yuboring.', cl.inn, cl.name;
      END IF;

      SELECT coalesce(jsonb_agg(x), '[]') INTO live FROM jsonb_array_elements(coalesce(cons -> 'value', '[]')) x
       WHERE x ->> 'Owner' = cp_key AND NOT coalesce((x ->> 'DeletionMark')::boolean, false) AND NOT coalesce((x ->> 'Недействителен')::boolean, false)
         AND coalesce(x ->> 'Организация_Key', empty) IN (public.onec__uk('organization'), empty);
      SELECT array_agg(DISTINCT lower(regexp_replace(contract_no, '[№\s]', '', 'g'))) INTO nos FROM public.chassis_specs WHERE client_id = cl.id;
      SELECT coalesce(jsonb_agg(x), '[]') INTO by_no FROM jsonb_array_elements(live) x
       WHERE lower(regexp_replace(coalesce(x ->> 'НомерДоговора', ''), '[№\s]', '', 'g')) = ANY(coalesce(nos, '{}')) AND coalesce(x ->> 'НомерДоговора', '') <> '';
      SELECT coalesce(jsonb_agg(x), '[]') INTO buyers FROM jsonb_array_elements(live) x WHERE x ->> 'ВидДоговора' = 'СПокупателем';
      IF jsonb_array_length(by_no) = 1 THEN con_key := by_no -> 0 ->> 'Ref_Key'; con_why := 'shartnoma № ' || (by_no -> 0 ->> 'НомерДоговора');
      ELSIF jsonb_array_length(by_no) > 1 THEN con_why := 'bir xil raqamli bir nechta shartnoma — buxgalter tanlaydi';
      ELSIF jsonb_array_length(buyers) = 1 THEN con_key := buyers -> 0 ->> 'Ref_Key'; con_why := 'yagona «С покупателем»: ' || coalesce(buyers -> 0 ->> 'Description', '');
      ELSIF jsonb_array_length(live) = 1 THEN con_key := live -> 0 ->> 'Ref_Key'; con_why := 'yagona shartnoma: ' || coalesce(live -> 0 ->> 'Description', '');
      ELSE con_why := CASE WHEN jsonb_array_length(live) > 0 THEN 'bir nechta shartnoma — buxgalter qoralamada tanlaydi' ELSE '1C''da shartnoma yo''q — buxgalter qoralamada tanlaydi' END;
      END IF;

      SELECT x ->> 'Ref_Key' INTO nom_key FROM jsonb_array_elements(coalesce(noms -> 'value', '[]')) x
       WHERE NOT coalesce((x ->> 'DeletionMark')::boolean, false) AND NOT coalesce((x ->> 'IsFolder')::boolean, false)
         AND x ->> 'Description' = public.onec__uk('nomenclature') LIMIT 1;

      st := jsonb_build_object('cp', cp_key, 'con', con_key, 'con_why', con_why);
      IF nom_key IS NULL THEN
        -- ma'lumotnoma elementi (hujjat emas): «Шасси давальческое (заказчика)»
        ids := jsonb_build_object('nom', public.onec__post('Catalog_Номенклатура', jsonb_build_object(
          'Description', public.onec__uk('nomenclature'), 'НаименованиеПолное', public.onec__uk('nomenclature'),
          'ТипНоменклатуры', 'Запас', 'ЕдиницаИзмерения_Key', public.onec__uk('unit_pcs'),
          'Комментарий', 'Создано ERP для приёма давальческих шасси (Прием в переработку)')));
        UPDATE public.integration_log SET request = st || jsonb_build_object('stage', 'nom_wait', 'ids', ids), updated_at = now() WHERE id = lg.id;
        RETURN jsonb_build_object('status', 'pending', 'stage', 'nom_wait');
      END IF;
      st := st || jsonb_build_object('nom', nom_key, 'body', public.onec__intake_body(ch, cp_key, con_key, nom_key));
      ids := jsonb_build_object('doc', public.onec__post('Document_ПриходнаяНакладная', st -> 'body'));
      UPDATE public.integration_log SET request = st || jsonb_build_object('stage', 'doc_wait', 'ids', ids), updated_at = now() WHERE id = lg.id;
      RETURN jsonb_build_object('status', 'pending', 'stage', 'doc_wait');
    END IF;

    IF st ->> 'stage' = 'nom_wait' THEN
      made := public.onec__resp((ids ->> 'nom')::bigint);
      IF made IS NULL THEN RETURN jsonb_build_object('status', 'pending', 'stage', 'nom_wait'); END IF;
      st := st || jsonb_build_object('nom', made ->> 'Ref_Key', 'body', public.onec__intake_body(ch, st ->> 'cp', st ->> 'con', made ->> 'Ref_Key'));
      ids := jsonb_build_object('doc', public.onec__post('Document_ПриходнаяНакладная', st -> 'body'));
      UPDATE public.integration_log SET request = st || jsonb_build_object('stage', 'doc_wait', 'ids', ids), updated_at = now() WHERE id = lg.id;
      RETURN jsonb_build_object('status', 'pending', 'stage', 'doc_wait');
    END IF;

    IF st ->> 'stage' = 'doc_wait' THEN
      made := public.onec__resp((ids ->> 'doc')::bigint);
      IF made IS NULL THEN RETURN jsonb_build_object('status', 'pending', 'stage', 'doc_wait'); END IF;
      IF made ->> 'Ref_Key' IS NULL THEN RAISE EXCEPTION '1C hujjat havolasini qaytarmadi'; END IF;
      UPDATE public.chassis SET onec_intake_ref = made ->> 'Ref_Key' WHERE id = ch.id;
      UPDATE public.integration_log SET status = 'ok', onec_ref = made ->> 'Ref_Key',
        response = 'Qoralama ' || coalesce(made ->> 'Number', '') || '; ' || coalesce(st ->> 'con_why', ''), updated_at = now() WHERE id = lg.id;
      RETURN jsonb_build_object('status', 'ok', 'ref', made ->> 'Ref_Key', 'number', made ->> 'Number', 'contract', st ->> 'con_why');
    END IF;

    RAISE EXCEPTION 'Noma''lum bosqich: %', st ->> 'stage';
  EXCEPTION WHEN others THEN
    err := SQLERRM;
    UPDATE public.integration_log SET status = 'error', response = err, updated_at = now() WHERE id = lg.id;
    RETURN jsonb_build_object('status', 'error', 'message', err);
  END;
END $$;

-- Boshlash (ERP qabuldan keyin yoki «qayta yuborish» tugmasi)
CREATE OR REPLACE FUNCTION public.onec_send_chassis_intake(_chassis_id uuid, _force boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch record; prev record; log_id uuid; n_att int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.chassis_can_view() THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  SELECT * INTO ch FROM public.chassis WHERE id = _chassis_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'message', 'Shassi topilmadi'); END IF;
  IF ch.onec_intake_ref IS NOT NULL THEN RETURN jsonb_build_object('status', 'ok', 'ref', ch.onec_intake_ref, 'already', true); END IF;
  IF ch.status = 'expected' OR ch.received_at IS NULL THEN RETURN jsonb_build_object('status', 'error', 'message', 'Shassi hali qabul qilinmagan'); END IF;
  SELECT id, status, attempts, updated_at INTO prev FROM public.integration_log
   WHERE entity = 'chassis_intake' AND erp_id = ch.id ORDER BY created_at DESC LIMIT 1;
  IF prev.id IS NOT NULL AND prev.status = 'pending' AND prev.updated_at > now() - interval '5 minutes' THEN
    RETURN public.onec__tick(prev.id);  -- allaqachon ketmoqda
  END IF;
  IF prev.id IS NOT NULL AND prev.status <> 'ok' AND prev.attempts >= 5 AND NOT _force THEN
    RETURN jsonb_build_object('status', 'error', 'message', '5 marta urinildi. Xatoni tuzatib, «1C''ga qayta yuborish» tugmasini bosing.');
  END IF;
  n_att := coalesce(prev.attempts, 0) + 1;
  IF prev.id IS NOT NULL AND prev.status <> 'ok' THEN
    log_id := prev.id;
    UPDATE public.integration_log SET attempts = n_att, status = 'pending', response = NULL,
      request = jsonb_build_object('stage', 'fetch'), updated_at = now() WHERE id = log_id;
  ELSE
    INSERT INTO public.integration_log(direction, entity, erp_id, attempts, status, request)
    VALUES ('erp_to_1c', 'chassis_intake', ch.id, n_att, 'pending', jsonb_build_object('stage', 'fetch')) RETURNING id INTO log_id;
  END IF;
  RETURN public.onec__tick(log_id);
END $$;

-- ERP sahifasi so'raydi: holat (va bir qadam oldinga suradi)
CREATE OR REPLACE FUNCTION public.onec_intake_status(_chassis_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lg record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.chassis_can_view() THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  SELECT id, status, onec_ref, response INTO lg FROM public.integration_log
   WHERE entity = 'chassis_intake' AND erp_id = _chassis_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'none'); END IF;
  IF lg.status = 'pending' THEN RETURN public.onec__tick(lg.id); END IF;
  RETURN jsonb_build_object('status', lg.status, 'ref', lg.onec_ref, 'message', lg.response);
END $$;

-- pg_cron: sahifa yopilgan bo'lsa ham tugatadi
CREATE OR REPLACE FUNCTION public.onec_intake_tick_all() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.integration_log WHERE entity = 'chassis_intake' AND status = 'pending' AND created_at > now() - interval '1 day' LOOP
    PERFORM public.onec__tick(r.id); n := n + 1;
  END LOOP;
  RETURN n;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('onec_intake_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'onec_intake_tick');
  PERFORM cron.schedule('onec_intake_tick', '* * * * *', 'SELECT public.onec_intake_tick_all()');
END $$;

REVOKE ALL ON FUNCTION public.onec__headers(), public.onec__url(text, text), public.onec__get(text, text), public.onec__post(text, jsonb),
  public.onec__resp(bigint), public.onec__tick(uuid), public.onec_intake_tick_all() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onec_send_chassis_intake(uuid, boolean), public.onec_intake_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onec_send_chassis_intake(uuid, boolean), public.onec_intake_status(uuid) TO authenticated;
