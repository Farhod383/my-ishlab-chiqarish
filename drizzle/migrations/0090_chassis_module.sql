-- «Shassi» moduli: buyurtmachining давальческое shassisiga ustqurma o'rnatish va qaytarish.
-- Faqat yangi jadvallar, funksiyalar va ko'rinishlar. Mavjud jadvallar, siyosatlar va ma'lumotlar o'zgarmaydi.

-- ---------- turlar ----------
DO $$ BEGIN
  CREATE TYPE public.chassis_status AS ENUM ('expected','received','in_production','ready','in_act','shipped','esf_issued','closed','returned_without_work');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.chassis_act_status AS ENUM ('draft','shipped','esf_issued','closed','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 1. ustqurma turlari ----------
CREATE TABLE IF NOT EXISTS public.body_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]+$'),
  name text NOT NULL,                       -- akt va ESF uchun nomi
  short_name text NOT NULL,
  mxik_code text,
  unit text NOT NULL DEFAULT 'шт',
  requires_test boolean NOT NULL DEFAULT false,
  order_prefix text CHECK (order_prefix IS NULL OR order_prefix ~ '^[A-Z]{2,5}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.body_types (code, name, short_name, requires_test, order_prefix) VALUES
  ('selno',    'Надстройка ассенизационная (сельнос)',      'Selnos',      false, 'SEL'),
  ('vodovoz',  'Надстройка водовоз',                          'Vodovoz',     false, NULL),
  ('atz',      'Надстройка автотопливозаправщик (АТЗ)',       'ATZ',         true,  'ATZ'),
  ('vyshka28', 'Надстройка автовышка 28 м',                   'Avtovishka 28', true, NULL)
ON CONFLICT (code) DO NOTHING;

-- ---------- 2. spetsifikatsiyalar ----------
CREATE TABLE IF NOT EXISTS public.chassis_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  contract_no text NOT NULL,
  spec_no text NOT NULL,
  spec_date date NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, spec_no)
);

-- ---------- 3. spetsifikatsiya qatorlari ----------
CREATE TABLE IF NOT EXISTS public.chassis_spec_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id uuid NOT NULL REFERENCES public.chassis_specs(id) ON DELETE RESTRICT,
  body_type_id uuid NOT NULL REFERENCES public.body_types(id) ON DELETE RESTRICT,
  qty int CHECK (qty IS NULL OR qty > 0),   -- NULL = cheklanmagan
  price_gross numeric(16,2) NOT NULL CHECK (price_gross > 0),  -- 1 dona narxi, QQS bilan
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chassis_spec_lines_spec_idx ON public.chassis_spec_lines(spec_id);

-- ---------- 4. shassilar ----------
CREATE TABLE IF NOT EXISTS public.chassis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin text NOT NULL UNIQUE CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  engine_no text,
  model text NOT NULL DEFAULT 'FAW Tiger V VUM1110 4x2',
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  inbound_proxy text,                       -- qabuldagi buyurtmachi ishonchnomasi
  received_at timestamptz,
  received_by uuid,
  mileage_km int CHECK (mileage_km IS NULL OR mileage_km >= 0),
  kit jsonb NOT NULL DEFAULT '{}'::jsonb,
  defects text,
  photo_paths text[] NOT NULL DEFAULT '{}',
  intake_act_no text UNIQUE,
  body_type_id uuid REFERENCES public.body_types(id) ON DELETE RESTRICT,
  spec_line_id uuid REFERENCES public.chassis_spec_lines(id) ON DELETE RESTRICT,
  order_id uuid UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,   -- bitta shassi = bitta zakaz
  status public.chassis_status NOT NULL DEFAULT 'expected',
  test_passed_at timestamptz,
  warning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chassis_status_idx ON public.chassis(status);
CREATE INDEX IF NOT EXISTS chassis_client_idx ON public.chassis(client_id);
CREATE INDEX IF NOT EXISTS chassis_vin_tail_idx ON public.chassis(right(vin, 6));

-- ---------- 5. aktlar ----------
CREATE TABLE IF NOT EXISTS public.chassis_act_counters (year int PRIMARY KEY, last_no int NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS public.chassis_acts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  act_no text UNIQUE,                       -- trigger beradi: A-YYYY-NNN
  act_date date NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  body_type_id uuid NOT NULL REFERENCES public.body_types(id) ON DELETE RESTRICT,
  price_gross numeric(16,2) NOT NULL CHECK (price_gross > 0),
  qty int NOT NULL CHECK (qty > 0),
  total_gross numeric(16,2) NOT NULL CHECK (total_gross > 0),
  total_vat numeric(16,2) GENERATED ALWAYS AS (round(total_gross * 12 / 112, 2)) STORED,
  total_net numeric(16,2) GENERATED ALWAYS AS (total_gross - round(total_gross * 12 / 112, 2)) STORED,
  status public.chassis_act_status NOT NULL DEFAULT 'draft',
  shipped_at timestamptz,
  recipient_name text,
  recipient_proxy text,
  replaces_act_id uuid REFERENCES public.chassis_acts(id) ON DELETE RESTRICT,
  void_reason text,
  esf_number text,
  esf_date date,
  esf_amount numeric(16,2),
  onec_ref text,                            -- 1C:УК dagi hujjat Ref_Key
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS chassis_acts_esf_number_uq ON public.chassis_acts(esf_number) WHERE esf_number IS NOT NULL AND status <> 'void';
CREATE INDEX IF NOT EXISTS chassis_acts_status_idx ON public.chassis_acts(status);

-- ---------- 6. akt qatorlari ----------
CREATE TABLE IF NOT EXISTS public.chassis_act_items (
  act_id uuid NOT NULL REFERENCES public.chassis_acts(id) ON DELETE RESTRICT,
  chassis_id uuid NOT NULL REFERENCES public.chassis(id) ON DELETE RESTRICT,
  spec_line_id uuid NOT NULL REFERENCES public.chassis_spec_lines(id) ON DELETE RESTRICT,
  price_gross numeric(16,2) NOT NULL,
  PRIMARY KEY (act_id, chassis_id)
);
CREATE INDEX IF NOT EXISTS chassis_act_items_chassis_idx ON public.chassis_act_items(chassis_id);
CREATE INDEX IF NOT EXISTS chassis_act_items_line_idx ON public.chassis_act_items(spec_line_id);

-- ---------- 7. tarix ----------
CREATE TABLE IF NOT EXISTS public.chassis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis_id uuid NOT NULL REFERENCES public.chassis(id) ON DELETE RESTRICT,
  act_id uuid REFERENCES public.chassis_acts(id) ON DELETE RESTRICT,
  from_status text,
  to_status text,
  actor_id uuid,
  actor_role text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chassis_events_chassis_idx ON public.chassis_events(chassis_id, created_at);

-- ================= himoya triggerlari =================

-- Tarixni o'zgartirish yoki o'chirish hech kimga mumkin emas
CREATE OR REPLACE FUNCTION public.chassis_events_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Shassi tarixini o''zgartirib yoki o''chirib bo''lmaydi';
END $$;
DROP TRIGGER IF EXISTS chassis_events_no_update ON public.chassis_events;
CREATE TRIGGER chassis_events_no_update BEFORE UPDATE OR DELETE ON public.chassis_events
  FOR EACH ROW EXECUTE FUNCTION public.chassis_events_immutable();

-- status faqat modul funksiyalari ichida o'zgaradi (set_config('mcity.chassis_tx','1',true))
CREATE OR REPLACE FUNCTION public.chassis_guard_status() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(current_setting('mcity.chassis_tx', true), '') <> '1' THEN
      RAISE EXCEPTION 'Yozuv faqat Shassi funksiyalari orqali yaratiladi';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND coalesce(current_setting('mcity.chassis_tx', true), '') <> '1' THEN
    RAISE EXCEPTION 'Holatni to''g''ridan-to''g''ri o''zgartirib bo''lmaydi (%→%). Shassi funksiyalaridan foydalaning', OLD.status, NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chassis_status_guard ON public.chassis;
CREATE TRIGGER chassis_status_guard BEFORE INSERT OR UPDATE ON public.chassis
  FOR EACH ROW EXECUTE FUNCTION public.chassis_guard_status();
DROP TRIGGER IF EXISTS chassis_acts_status_guard ON public.chassis_acts;
CREATE TRIGGER chassis_acts_status_guard BEFORE INSERT OR UPDATE ON public.chassis_acts
  FOR EACH ROW EXECUTE FUNCTION public.chassis_guard_status();

-- qabul akti raqami: P-YYYYMMDD-<VIN oxirgi 4>
CREATE OR REPLACE FUNCTION public.chassis_intake_act_no() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.received_at IS NOT NULL AND NEW.intake_act_no IS NULL THEN
    NEW.intake_act_no := 'P-' || to_char(NEW.received_at AT TIME ZONE 'Asia/Tashkent', 'YYYYMMDD') || '-' || right(NEW.vin, 4);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chassis_intake_act_no ON public.chassis;
CREATE TRIGGER chassis_intake_act_no BEFORE INSERT OR UPDATE OF received_at ON public.chassis
  FOR EACH ROW EXECUTE FUNCTION public.chassis_intake_act_no();

-- akt raqami: A-YYYY-NNN, har yil yangidan
CREATE OR REPLACE FUNCTION public.chassis_assign_act_no() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y int := extract(year FROM NEW.act_date)::int; n int;
BEGIN
  IF NEW.act_no IS NULL THEN
    INSERT INTO public.chassis_act_counters(year, last_no) VALUES (y, 1)
      ON CONFLICT (year) DO UPDATE SET last_no = chassis_act_counters.last_no + 1
      RETURNING last_no INTO n;
    NEW.act_no := 'A-' || y || '-' || lpad(n::text, 3, '0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chassis_acts_number ON public.chassis_acts;
CREATE TRIGGER chassis_acts_number BEFORE INSERT ON public.chassis_acts
  FOR EACH ROW EXECUTE FUNCTION public.chassis_assign_act_no();

-- bitta VIN bir vaqtda faqat bitta amaldagi (bekor qilinmagan) aktda
CREATE OR REPLACE FUNCTION public.chassis_one_live_act() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chassis_act_items i JOIN public.chassis_acts a ON a.id = i.act_id
             WHERE i.chassis_id = NEW.chassis_id AND i.act_id <> NEW.act_id AND a.status <> 'void') THEN
    RAISE EXCEPTION 'VIN % allaqachon boshqa aktda', (SELECT vin FROM public.chassis WHERE id = NEW.chassis_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chassis_act_items_one_live ON public.chassis_act_items;
CREATE TRIGGER chassis_act_items_one_live BEFORE INSERT ON public.chassis_act_items
  FOR EACH ROW EXECUTE FUNCTION public.chassis_one_live_act();

-- ================= yordamchilar =================

CREATE OR REPLACE FUNCTION public.chassis_normalize_vin(_vin text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT translate(upper(regexp_replace(coalesce(_vin, ''), '[[:space:]-]', '', 'g')), 'OI', '01')
$$;

CREATE OR REPLACE FUNCTION public.chassis_status_label(_s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s
    WHEN 'expected' THEN 'kutilmoqda' WHEN 'received' THEN 'qabul qilingan' WHEN 'in_production' THEN 'ishlab chiqarishda'
    WHEN 'ready' THEN 'tayyor' WHEN 'in_act' THEN 'aktda' WHEN 'shipped' THEN 'jo''natilgan'
    WHEN 'esf_issued' THEN 'ESF yozilgan' WHEN 'closed' THEN 'yopilgan' WHEN 'returned_without_work' THEN 'ishsiz qaytarilgan'
    ELSE _s END
$$;

-- Modulni ko'ra oladigan rollar
CREATE OR REPLACE FUNCTION public.chassis_can_view() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager','marketing','warehouse','otk','engineer','accountant','chief_accountant'))
$$;

-- Ruxsatni tekshiradi va funksiya rejimini yoqadi. Qaytaradi: foydalanuvchining shu amal uchun roli
CREATE OR REPLACE FUNCTION public.chassis__begin(_roles public.app_role[]) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Tizimga kiring'; END IF;
  SELECT role::text INTO r FROM public.user_roles
   WHERE user_id = auth.uid() AND (role = ANY(_roles) OR role = 'admin')
   ORDER BY (role = 'admin') LIMIT 1;
  IF r IS NULL THEN RAISE EXCEPTION 'Bu amal uchun ruxsat yo''q'; END IF;
  PERFORM set_config('mcity.chassis_tx', '1', true);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.chassis__end() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT set_config('mcity.chassis_tx', '', true) $$;

CREATE OR REPLACE FUNCTION public.chassis__log(_chassis uuid, _act uuid, _from text, _to text, _role text, _comment text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.chassis_events(chassis_id, act_id, from_status, to_status, actor_id, actor_role, comment)
  VALUES (_chassis, _act, _from, _to, auth.uid(), _role, _comment);
  INSERT INTO public.entity_audit(entity, entity_id, action, old_value, new_value, actor_id, role)
  VALUES ('chassis', _chassis, coalesce(_comment, 'Holat o''zgardi'),
          CASE WHEN _from IS NULL THEN NULL ELSE jsonb_build_object('status', _from) END,
          jsonb_build_object('status', _to, 'act_id', _act), auth.uid(), _role);
$$;

-- ================= amallar =================

-- a) kutilayotgan shassilar ro'yxati
CREATE OR REPLACE FUNCTION public.chassis_expect(_vins text[], _client_id uuid, _proxy text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['warehouse']::public.app_role[]);
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

-- b) qabul
CREATE OR REPLACE FUNCTION public.chassis_receive(_vin text, _engine_no text, _mileage int, _kit jsonb, _defects text,
  _photo_paths text[], _proxy text, _body_type_id uuid DEFAULT NULL, _client_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['warehouse']::public.app_role[]);
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

-- c) ishlab chiqarishga
CREATE OR REPLACE FUNCTION public.chassis_to_production(_chassis_id uuid, _spec_line_id uuid, _order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['engineer','manager']::public.app_role[]);
  c record; ln record; o record; other text;
BEGIN
  SELECT * INTO c FROM public.chassis WHERE id = _chassis_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shassi topilmadi'; END IF;
  IF c.status <> 'received' THEN RAISE EXCEPTION 'Faqat qabul qilingan shassini ishlab chiqarishga berish mumkin (hozir: %)', public.chassis_status_label(c.status::text); END IF;
  SELECT l.*, s.client_id, b.order_prefix, b.short_name INTO ln
    FROM public.chassis_spec_lines l JOIN public.chassis_specs s ON s.id = l.spec_id JOIN public.body_types b ON b.id = l.body_type_id
   WHERE l.id = _spec_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Spetsifikatsiya qatori topilmadi'; END IF;
  IF ln.client_id <> c.client_id THEN RAISE EXCEPTION 'Spetsifikatsiya boshqa buyurtmachiniki'; END IF;
  IF c.body_type_id IS NOT NULL AND c.body_type_id <> ln.body_type_id THEN RAISE EXCEPTION 'Shassi uchun boshqa ustqurma turi belgilangan'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Zakaz topilmadi'; END IF;
  IF ln.order_prefix IS NOT NULL AND substring(o.order_number FROM '^[A-Z]+') IS DISTINCT FROM ln.order_prefix THEN
    RAISE EXCEPTION 'Zakaz % prefiksi % ustqurmasiga mos emas (kerak: %)', o.order_number, ln.short_name, ln.order_prefix;
  END IF;
  SELECT vin INTO other FROM public.chassis WHERE order_id = _order_id AND id <> c.id;
  IF other IS NOT NULL THEN RAISE EXCEPTION 'Zakaz % boshqa shassiga bog''langan: %', o.order_number, other; END IF;
  UPDATE public.chassis SET status = 'in_production', spec_line_id = _spec_line_id, body_type_id = ln.body_type_id, order_id = _order_id
   WHERE id = c.id;
  PERFORM public.chassis__log(c.id, NULL, 'received', 'in_production', r, 'Ishlab chiqarishga: ' || o.order_number);
  PERFORM public.chassis__end();
END $$;

-- d) OTK: tayyor
CREATE OR REPLACE FUNCTION public.chassis_mark_ready(_chassis_id uuid, _test_passed boolean, _comment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['otk']::public.app_role[]);
  c record; need_test boolean; pending int;
BEGIN
  SELECT * INTO c FROM public.chassis WHERE id = _chassis_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shassi topilmadi'; END IF;
  IF c.status <> 'in_production' THEN RAISE EXCEPTION 'Faqat ishlab chiqarishdagi shassi tayyor bo''ladi (hozir: %)', public.chassis_status_label(c.status::text); END IF;
  SELECT count(*) INTO pending FROM public.order_stages WHERE order_id = c.order_id AND qc_required AND qc_passed IS NOT TRUE;
  IF pending > 0 THEN RAISE EXCEPTION 'Zakazda OTK''dan o''tmagan % ta bosqich bor', pending; END IF;
  SELECT requires_test INTO need_test FROM public.body_types WHERE id = c.body_type_id;
  IF coalesce(need_test, false) AND _test_passed IS NOT TRUE THEN RAISE EXCEPTION 'Bu ustqurma uchun sinov majburiy'; END IF;
  UPDATE public.chassis SET status = 'ready', test_passed_at = CASE WHEN _test_passed THEN now() ELSE test_passed_at END WHERE id = c.id;
  PERFORM public.chassis__log(c.id, NULL, 'in_production', 'ready', r,
    'OTK: tayyor' || CASE WHEN _test_passed THEN ', sinov o''tdi' ELSE '' END || coalesce(' · ' || nullif(trim(_comment), ''), ''));
  PERFORM public.chassis__end();
END $$;

-- e) akt yaratish (atomar)
CREATE OR REPLACE FUNCTION public.chassis_create_act(_chassis_ids uuid[], _act_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['marketing','manager']::public.app_role[]);
  n int; bad text; clients_n int; types_n int; prices_n int; cl uuid; bt uuid; price numeric; aid uuid; ln record; used int;
BEGIN
  n := coalesce(array_length(_chassis_ids, 1), 0);
  IF n = 0 THEN RAISE EXCEPTION 'Kamida bitta shassi tanlang'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_chassis_ids) x) <> n THEN RAISE EXCEPTION 'Ro''yxatda bitta shassi ikki marta'; END IF;
  PERFORM 1 FROM public.chassis WHERE id = ANY(_chassis_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.chassis WHERE id = ANY(_chassis_ids)) <> n THEN RAISE EXCEPTION 'Ba''zi shassilar topilmadi'; END IF;
  SELECT string_agg(vin, ', ') INTO bad FROM public.chassis WHERE id = ANY(_chassis_ids) AND status <> 'ready';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Tayyor bo''lmagan shassilar: %', bad; END IF;
  SELECT count(DISTINCT c.client_id), count(DISTINCT c.body_type_id), count(DISTINCT l.price_gross), min(c.client_id::text)::uuid, min(c.body_type_id::text)::uuid, min(l.price_gross)
    INTO clients_n, types_n, prices_n, cl, bt, price
    FROM public.chassis c JOIN public.chassis_spec_lines l ON l.id = c.spec_line_id WHERE c.id = ANY(_chassis_ids);
  IF clients_n <> 1 THEN RAISE EXCEPTION 'Aktda faqat bitta buyurtmachining shassilari bo''ladi'; END IF;
  IF types_n <> 1 THEN RAISE EXCEPTION 'Aktda faqat bitta ustqurma turi bo''ladi'; END IF;
  IF prices_n <> 1 THEN RAISE EXCEPTION 'Aktdagi shassilarning narxi bir xil bo''lishi kerak'; END IF;
  FOR ln IN SELECT l.id, l.qty, count(*) AS adding FROM public.chassis c JOIN public.chassis_spec_lines l ON l.id = c.spec_line_id
            WHERE c.id = ANY(_chassis_ids) GROUP BY l.id, l.qty LOOP
    IF ln.qty IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('chassis_spec_line:' || ln.id));
      SELECT count(*) INTO used FROM public.chassis_act_items i JOIN public.chassis_acts a ON a.id = i.act_id
       WHERE i.spec_line_id = ln.id AND a.status <> 'void';
      IF used + ln.adding > ln.qty THEN
        RAISE EXCEPTION 'Spetsifikatsiyadan oshib ketadi: shartnomada %, aktlarda %, qo''shilmoqda %', ln.qty, used, ln.adding;
      END IF;
    END IF;
  END LOOP;
  INSERT INTO public.chassis_acts(act_date, client_id, body_type_id, price_gross, qty, total_gross, status, created_by)
  VALUES (coalesce(_act_date, current_date), cl, bt, price, n, price * n, 'draft', auth.uid()) RETURNING id INTO aid;
  INSERT INTO public.chassis_act_items(act_id, chassis_id, spec_line_id, price_gross)
    SELECT aid, c.id, c.spec_line_id, price FROM public.chassis c WHERE c.id = ANY(_chassis_ids);
  UPDATE public.chassis SET status = 'in_act' WHERE id = ANY(_chassis_ids);
  PERFORM public.chassis__log(id, aid, 'ready', 'in_act', r, 'Aktga kiritildi: ' || (SELECT act_no FROM public.chassis_acts WHERE id = aid))
    FROM public.chassis WHERE id = ANY(_chassis_ids);
  PERFORM public.chassis__end();
  RETURN aid;
END $$;

-- ichki: aktning shassilarini bir holatdan boshqasiga o'tkazish
CREATE OR REPLACE FUNCTION public.chassis__move_act_chassis(_act uuid, _from public.chassis_status, _to public.chassis_status, _role text, _comment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.chassis__log(c.id, _act, _from::text, _to::text, _role, _comment)
    FROM public.chassis c JOIN public.chassis_act_items i ON i.chassis_id = c.id WHERE i.act_id = _act AND c.status = _from;
  UPDATE public.chassis c SET status = _to FROM public.chassis_act_items i WHERE i.chassis_id = c.id AND i.act_id = _act AND c.status = _from;
END $$;

-- f) jo'natish
CREATE OR REPLACE FUNCTION public.chassis_ship_act(_act_id uuid, _shipped_at timestamptz, _recipient_name text, _recipient_proxy text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['warehouse']::public.app_role[]); a record;
BEGIN
  SELECT * INTO a FROM public.chassis_acts WHERE id = _act_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akt topilmadi'; END IF;
  IF a.status <> 'draft' THEN RAISE EXCEPTION 'Faqat qoralama akt jo''natiladi'; END IF;
  IF nullif(trim(coalesce(_recipient_name, '')), '') IS NULL OR nullif(trim(coalesce(_recipient_proxy, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Oluvchi va ishonchnoma majburiy';
  END IF;
  UPDATE public.chassis_acts SET status = 'shipped', shipped_at = coalesce(_shipped_at, now()),
    recipient_name = trim(_recipient_name), recipient_proxy = trim(_recipient_proxy) WHERE id = a.id;
  PERFORM public.chassis__move_act_chassis(a.id, 'in_act', 'shipped', r, 'Jo''natildi: ' || a.act_no);
  PERFORM public.chassis__end();
END $$;

-- g) ESF
CREATE OR REPLACE FUNCTION public.chassis_register_esf(_act_id uuid, _esf_number text, _esf_date date, _esf_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['accountant','chief_accountant']::public.app_role[]); a record; num text := nullif(trim(coalesce(_esf_number, '')), '');
BEGIN
  SELECT * INTO a FROM public.chassis_acts WHERE id = _act_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akt topilmadi'; END IF;
  IF a.status <> 'shipped' THEN RAISE EXCEPTION 'ESF faqat jo''natilgan aktga yoziladi'; END IF;
  IF num IS NULL OR _esf_date IS NULL OR _esf_amount IS NULL THEN RAISE EXCEPTION 'ESF raqami, sanasi va summasi majburiy'; END IF;
  IF abs(_esf_amount - a.total_gross) > 0.5 THEN
    RAISE EXCEPTION 'ESF summasi aktdagidan farq qiladi: ESF % so''m, akt % so''m', _esf_amount, a.total_gross;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chassis_acts WHERE esf_number = num AND status <> 'void' AND id <> a.id) THEN
    RAISE EXCEPTION 'ESF % boshqa aktga yozilgan', num;
  END IF;
  UPDATE public.chassis_acts SET status = 'esf_issued', esf_number = num, esf_date = _esf_date, esf_amount = _esf_amount WHERE id = a.id;
  PERFORM public.chassis__move_act_chassis(a.id, 'shipped', 'esf_issued', r, 'ESF yozildi: ' || num);
  PERFORM public.chassis__end();
END $$;

-- h) yopish (ESF buyurtmachi tomonidan imzolandi)
CREATE OR REPLACE FUNCTION public.chassis_close_act(_act_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['accountant','chief_accountant']::public.app_role[]); a record;
BEGIN
  SELECT * INTO a FROM public.chassis_acts WHERE id = _act_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akt topilmadi'; END IF;
  IF a.status <> 'esf_issued' THEN RAISE EXCEPTION 'Faqat ESF yozilgan akt yopiladi'; END IF;
  UPDATE public.chassis_acts SET status = 'closed' WHERE id = a.id;
  PERFORM public.chassis__move_act_chassis(a.id, 'esf_issued', 'closed', r, 'ESF imzolandi, akt yopildi: ' || a.act_no);
  PERFORM public.chassis__end();
END $$;

-- i) bekor qilish
CREATE OR REPLACE FUNCTION public.chassis_void_act(_act_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.chassis__begin(ARRAY['marketing','manager']::public.app_role[]); a record;
BEGIN
  SELECT * INTO a FROM public.chassis_acts WHERE id = _act_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akt topilmadi'; END IF;
  IF a.status NOT IN ('draft','shipped') THEN RAISE EXCEPTION 'Faqat qoralama yoki jo''natilgan akt bekor qilinadi'; END IF;
  IF nullif(trim(coalesce(_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Sababini yozing'; END IF;
  UPDATE public.chassis_acts SET status = 'void', void_reason = trim(_reason) WHERE id = a.id;
  PERFORM public.chassis__log(c.id, a.id, c.status::text, 'ready', r, 'Akt bekor qilindi: ' || a.act_no || ' · ' || trim(_reason))
    FROM public.chassis c JOIN public.chassis_act_items i ON i.chassis_id = c.id WHERE i.act_id = a.id;
  UPDATE public.chassis c SET status = 'ready' FROM public.chassis_act_items i WHERE i.chassis_id = c.id AND i.act_id = a.id;
  PERFORM public.chassis__end();
END $$;

-- i) almashtirish: eski akt bekor, yangi akt o'sha jo'natish ma'lumotlari bilan darhol «jo'natildi»
CREATE OR REPLACE FUNCTION public.chassis_replace_act(_old_act_id uuid, _chassis_ids uuid[], _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text; a record; nid uuid;
BEGIN
  SELECT * INTO a FROM public.chassis_acts WHERE id = _old_act_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akt topilmadi'; END IF;
  IF a.status <> 'shipped' THEN RAISE EXCEPTION 'Faqat jo''natilgan akt almashtiriladi'; END IF;
  PERFORM public.chassis_void_act(_old_act_id, _reason);
  nid := public.chassis_create_act(_chassis_ids, current_date);
  r := public.chassis__begin(ARRAY['marketing','manager']::public.app_role[]);
  UPDATE public.chassis_acts SET status = 'shipped', shipped_at = a.shipped_at, recipient_name = a.recipient_name,
    recipient_proxy = a.recipient_proxy, replaces_act_id = a.id WHERE id = nid;
  PERFORM public.chassis__move_act_chassis(nid, 'in_act', 'shipped', r, 'Almashtiruvchi akt, ' || a.act_no || ' o''rniga');
  PERFORM public.chassis__end();
  RETURN nid;
END $$;

-- ================= ruxsatlar (RLS) =================
ALTER TABLE public.body_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chassis_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chassis_spec_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chassis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chassis_acts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chassis_act_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chassis_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chassis_act_counters ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['body_types','chassis_specs','chassis_spec_lines','chassis','chassis_acts','chassis_act_items','chassis_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.chassis_can_view()))', t || '_select', t);
  END LOOP;
  -- ma'lumotnomalarni faqat admin va bosh buxgalter o'zgartiradi
  FOREACH t IN ARRAY ARRAY['body_types','chassis_specs','chassis_spec_lines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT public.has_role(auth.uid(), ''admin'')) OR (SELECT public.has_role(auth.uid(), ''chief_accountant''))) WITH CHECK ((SELECT public.has_role(auth.uid(), ''admin'')) OR (SELECT public.has_role(auth.uid(), ''chief_accountant'')))', t || '_write', t);
  END LOOP;
END $$;

GRANT SELECT ON public.body_types, public.chassis_specs, public.chassis_spec_lines, public.chassis, public.chassis_acts, public.chassis_act_items, public.chassis_events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.body_types, public.chassis_specs, public.chassis_spec_lines TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chassis, public.chassis_acts, public.chassis_act_items, public.chassis_events FROM authenticated, anon;

-- ichki funksiyalarni to'g'ridan-to'g'ri chaqirib bo'lmaydi
REVOKE ALL ON FUNCTION public.chassis__begin(public.app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chassis__end() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chassis__log(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chassis__move_act_chassis(uuid, public.chassis_status, public.chassis_status, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chassis_expect(text[], uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chassis_receive(text, text, int, jsonb, text, text[], text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chassis_to_production(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chassis_mark_ready(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chassis_create_act(uuid[], date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chassis_ship_act(uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chassis_register_esf(uuid, text, date, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chassis_close_act(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chassis_void_act(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chassis_replace_act(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chassis_expect(text[], uuid, text), public.chassis_receive(text, text, int, jsonb, text, text[], text, uuid, uuid),
  public.chassis_to_production(uuid, uuid, uuid), public.chassis_mark_ready(uuid, boolean, text), public.chassis_create_act(uuid[], date),
  public.chassis_ship_act(uuid, timestamptz, text, text), public.chassis_register_esf(uuid, text, date, numeric), public.chassis_close_act(uuid),
  public.chassis_void_act(uuid, text), public.chassis_replace_act(uuid, uuid[], text), public.chassis_normalize_vin(text) TO authenticated;

-- ================= ko'rinishlar =================
-- Ko'rinishlar egasi huquqi bilan ishlaydi (zakaz va mijoz nomlari ombor/OTK roliga ham ko'rinsin), lekin faqat modul rollariga qator qaytaradi.

-- shassi + zakaz + amaldagi akt + ESF + maydonchadagi kunlar
CREATE OR REPLACE VIEW public.chassis_overview AS
SELECT c.id, c.vin, right(c.vin, 6) AS vin_tail, c.engine_no, c.model, c.status, c.client_id, cl.name AS client_name,
  c.body_type_id, b.short_name AS body_type_name, c.spec_line_id, c.order_id, o.order_number, o.status AS order_status,
  c.intake_act_no, c.inbound_proxy, c.received_at, c.mileage_km, c.kit, c.defects, c.photo_paths, c.test_passed_at, c.warning, c.created_at,
  a.id AS act_id, a.act_no, a.status AS act_status, a.esf_number, a.esf_date,
  CASE WHEN c.status IN ('received','in_production','ready','in_act') AND c.received_at IS NOT NULL
       THEN (current_date - (c.received_at AT TIME ZONE 'Asia/Tashkent')::date) END AS days_on_site,
  CASE WHEN c.status = 'expected' THEN (current_date - (c.created_at AT TIME ZONE 'Asia/Tashkent')::date) END AS days_expected
FROM public.chassis c
JOIN public.clients cl ON cl.id = c.client_id
LEFT JOIN public.body_types b ON b.id = c.body_type_id
LEFT JOIN public.orders o ON o.id = c.order_id
LEFT JOIN LATERAL (SELECT a.* FROM public.chassis_act_items i JOIN public.chassis_acts a ON a.id = i.act_id
                   WHERE i.chassis_id = c.id ORDER BY (a.status = 'void'), a.created_at DESC LIMIT 1) a ON true
WHERE public.chassis_can_view();

-- spetsifikatsiya qoldig'i
CREATE OR REPLACE VIEW public.chassis_spec_balance AS
SELECT l.id AS spec_line_id, s.id AS spec_id, s.client_id, cl.name AS client_name, s.contract_no, s.spec_no, s.spec_date,
  l.body_type_id, b.short_name AS body_type_name, l.qty, l.price_gross,
  coalesce(u.in_acts, 0) AS in_acts,
  CASE WHEN l.qty IS NULL THEN NULL ELSE l.qty - coalesce(u.in_acts, 0) END AS remaining
FROM public.chassis_spec_lines l
JOIN public.chassis_specs s ON s.id = l.spec_id
JOIN public.clients cl ON cl.id = s.client_id
JOIN public.body_types b ON b.id = l.body_type_id
LEFT JOIN (SELECT i.spec_line_id, count(*) AS in_acts FROM public.chassis_act_items i JOIN public.chassis_acts a ON a.id = i.act_id
           WHERE a.status <> 'void' GROUP BY i.spec_line_id) u ON u.spec_line_id = l.id
WHERE public.chassis_can_view();

-- oy yakuni: qabul qilingan, topshirilgan (tur bo'yicha), aktlar summasi
CREATE OR REPLACE VIEW public.chassis_monthly AS
WITH r AS (
  SELECT date_trunc('month', received_at AT TIME ZONE 'Asia/Tashkent')::date AS month, body_type_id, count(*) AS received
    FROM public.chassis WHERE received_at IS NOT NULL GROUP BY 1, 2),
s AS (
  SELECT date_trunc('month', shipped_at AT TIME ZONE 'Asia/Tashkent')::date AS month, body_type_id, sum(qty) AS shipped, sum(total_gross) AS acts_gross
    FROM public.chassis_acts WHERE status IN ('shipped','esf_issued','closed') GROUP BY 1, 2)
SELECT coalesce(r.month, s.month) AS month, coalesce(r.body_type_id, s.body_type_id) AS body_type_id, b.short_name AS body_type_name,
  coalesce(r.received, 0) AS received, coalesce(s.shipped, 0) AS shipped, coalesce(s.acts_gross, 0) AS acts_gross
FROM r FULL JOIN s ON s.month = r.month AND s.body_type_id IS NOT DISTINCT FROM r.body_type_id
LEFT JOIN public.body_types b ON b.id = coalesce(r.body_type_id, s.body_type_id)
WHERE public.chassis_can_view();

-- «Diqqat talab qiladi»
CREATE OR REPLACE FUNCTION public.chassis_business_days_since(_ts timestamptz) RETURNS int
LANGUAGE sql STABLE AS $$
  SELECT count(*)::int FROM generate_series((_ts AT TIME ZONE 'Asia/Tashkent')::date + 1, current_date, interval '1 day') d
   WHERE extract(isodow FROM d) < 6
$$;

CREATE OR REPLACE VIEW public.chassis_alerts AS
SELECT * FROM (
SELECT 'act_shipped_no_esf'::text AS kind, 'high'::text AS severity, 'act'::text AS entity, a.id AS entity_id,
       a.act_no || ' jo''natilgan, ESF yo''q' AS title, cl.name AS detail, a.shipped_at AS since
  FROM public.chassis_acts a JOIN public.clients cl ON cl.id = a.client_id
 WHERE a.status = 'shipped' AND public.chassis_business_days_since(a.shipped_at) > 1
UNION ALL
SELECT 'act_draft_old', 'medium', 'act', a.id, a.act_no || ' qoralama 1 kundan ortiq', cl.name, a.created_at
  FROM public.chassis_acts a JOIN public.clients cl ON cl.id = a.client_id
 WHERE a.status = 'draft' AND a.created_at < now() - interval '1 day'
UNION ALL
SELECT 'chassis_stuck', 'medium', 'chassis', c.id, c.vin || ' ' || (current_date - (c.received_at AT TIME ZONE 'Asia/Tashkent')::date) || ' kundan beri maydonchada',
       public.chassis_status_label(c.status::text), c.received_at
  FROM public.chassis c WHERE c.status IN ('received','in_production') AND c.received_at < now() - interval '15 days'
UNION ALL
SELECT 'chassis_expected_old', 'medium', 'chassis', c.id, c.vin || ' 7 kundan ortiq kelmadi', cl.name, c.created_at
  FROM public.chassis c JOIN public.clients cl ON cl.id = c.client_id
 WHERE c.status = 'expected' AND c.created_at < now() - interval '7 days'
UNION ALL
SELECT 'sel_order_no_chassis', 'medium', 'order', o.id, o.order_number || ' tugagan, shassi bog''lanmagan', o.product_name, o.updated_at
  FROM public.orders o
 WHERE o.order_number LIKE 'SEL%' AND o.status = 'completed' AND o.created_at >= '2026-11-25'
   AND NOT EXISTS (SELECT 1 FROM public.chassis c WHERE c.order_id = o.id)
UNION ALL
SELECT 'chassis_closed_order_open', 'low', 'chassis', c.id, c.vin || ' yopilgan, zakaz tugamagan', o.order_number, c.updated_at
  FROM public.chassis c JOIN public.orders o ON o.id = c.order_id
 WHERE c.status = 'closed' AND o.status <> 'completed'
) x WHERE public.chassis_can_view();

GRANT SELECT ON public.chassis_overview, public.chassis_spec_balance, public.chassis_monthly, public.chassis_alerts TO authenticated;

-- ================= rasmlar (yopiq bucket) =================
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('chassis-photos', 'chassis-photos', false) ON CONFLICT (id) DO NOTHING;
    DROP POLICY IF EXISTS chassis_photos_read ON storage.objects;
    CREATE POLICY chassis_photos_read ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'chassis-photos' AND (SELECT public.chassis_can_view()));
    DROP POLICY IF EXISTS chassis_photos_upload ON storage.objects;
    CREATE POLICY chassis_photos_upload ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'chassis-photos' AND ((SELECT public.has_role(auth.uid(), 'warehouse')) OR (SELECT public.has_role(auth.uid(), 'admin'))));
  END IF;
END $$;

-- ================= ESF qatori =================
-- ESF uchun tayyor qiymatlar: hammasi bazada hisoblanadi, ekran faqat ko'rsatadi va nusxalaydi
CREATE OR REPLACE FUNCTION public.chassis_esf_line(_act_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'name', b.name || ' с установкой на давальческое шасси ' || coalesce(min(c.model), 'FAW Tiger V VUM1110 4x2')
            || ' (Спецификация № ' || s.spec_no || ' от ' || to_char(s.spec_date, 'DD.MM.YYYY')
            || ', акт № ' || a.act_no || ' от ' || to_char(a.act_date, 'DD.MM.YYYY') || ') VIN: '
            || string_agg(c.vin, ';' ORDER BY c.vin),
    'mxik', b.mxik_code, 'unit', b.unit, 'qty', a.qty,
    'price_net', round(a.price_gross / 1.12, 2),
    'cost_net', a.total_net, 'vat_rate', 12, 'vat', a.total_vat, 'total', a.total_gross,
    'origin', 'Собственное производство')
  FROM public.chassis_acts a
  JOIN public.body_types b ON b.id = a.body_type_id
  JOIN public.chassis_act_items i ON i.act_id = a.id
  JOIN public.chassis c ON c.id = i.chassis_id
  JOIN public.chassis_spec_lines l ON l.id = i.spec_line_id
  JOIN public.chassis_specs s ON s.id = l.spec_id
  WHERE a.id = _act_id AND public.chassis_can_view()
  GROUP BY a.id, b.name, b.mxik_code, b.unit, s.spec_no, s.spec_date
$$;
REVOKE ALL ON FUNCTION public.chassis_esf_line(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chassis_esf_line(uuid) TO authenticated;
