CREATE OR REPLACE FUNCTION public.employee_badge_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text;
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('employee-badge-claims',0));
  IF (session_user='postgres' OR auth.role()='service_role')
     AND current_setting('app.prepared_badge_code',true)=NEW.badge_code
     AND current_setting('app.prepared_badge_name',true)=NEW.full_name THEN
   IF NEW.badge_code !~ '^MCT[0-9]{5}$' OR NEW.badge_code='MCT00134' THEN RAISE EXCEPTION 'Tayyor bejik kodi noto‘g‘ri yoki rezervda'; END IF;
   IF EXISTS(SELECT 1 FROM public.employees WHERE badge_code=NEW.badge_code) OR EXISTS(SELECT 1 FROM public.employee_badge_aliases WHERE code=NEW.badge_code) THEN RAISE EXCEPTION 'Bu shtrix-kod boshqa xodimga biriktirilgan'; END IF;
   RETURN NEW;
  END IF;
  LOOP
   NEW.badge_code:='MCT'||lpad(nextval('public.employee_badge_sequence')::text,5,'0');
   EXIT WHEN NEW.badge_code<>'MCT00134' AND NOT EXISTS(SELECT 1 FROM public.employees WHERE badge_code=NEW.badge_code) AND NOT EXISTS(SELECT 1 FROM public.employee_badge_aliases WHERE code=NEW.badge_code);
  END LOOP;
  RETURN NEW;
 END IF;
 IF NEW.badge_code IS NOT DISTINCT FROM OLD.badge_code THEN RETURN NEW; END IF;
 IF NOT public.can_manage_employee_badges() THEN RAISE EXCEPTION 'Faqat Admin 2 shtrix-kodni o‘zgartira oladi'; END IF;
 NEW.badge_code:=public.normalize_employee_badge(NEW.badge_code);
 IF NEW.badge_code !~ '^MCT[A-Z0-9]{1,61}$' THEN RAISE EXCEPTION 'Xodim kodi MCT bilan boshlanishi kerak (4–64 belgi)'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('employee-badge-claims',0));
 IF EXISTS(SELECT 1 FROM public.employees WHERE badge_code=NEW.badge_code AND id<>NEW.id) OR EXISTS(SELECT 1 FROM public.employee_badge_aliases WHERE code=NEW.badge_code AND employee_id<>NEW.id) THEN RAISE EXCEPTION 'Bu shtrix-kod boshqa xodimga biriktirilgan'; END IF;
 IF OLD.badge_code IS NOT NULL THEN INSERT INTO public.employee_badge_aliases(code,employee_id,created_by) VALUES(OLD.badge_code,OLD.id,auth.uid()) ON CONFLICT(code) DO NOTHING; END IF;
 SELECT full_name INTO actor FROM public.profiles WHERE id=auth.uid();
 INSERT INTO public.entity_audit(entity,entity_id,action,old_value,new_value,actor_id,actor_name,role) VALUES('employee_badge',NEW.id,'Shtrix-kod o‘zgartirildi',jsonb_build_object('badge_code',OLD.badge_code),jsonb_build_object('badge_code',NEW.badge_code),auth.uid(),actor,'admin');
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.import_prepared_employee_badges(_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; code text; person text; name_key text; owners jsonb; matches uuid[]; emp uuid; primary_code text; result jsonb:='[]'::jsonb; seq_value bigint; max_code numeric; inserted_count integer:=0; alias_count integer:=0; conflict_count integer:=0;
BEGIN
 IF NOT (session_user='postgres' OR auth.role()='service_role') THEN RAISE EXCEPTION 'Import faqat himoyalangan xizmat uchun'; END IF;
 IF jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows)>100 THEN RAISE EXCEPTION 'Import ro‘yxati noto‘g‘ri'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('employee-badge-claims',0));
 LOCK TABLE public.employees IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.employee_badge_aliases IN SHARE ROW EXCLUSIVE MODE;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  code:=r->>'code'; person:=btrim(r->>'name');
  IF code IS NULL OR code !~ '^MCT[0-9]{5}$' OR code='MCT00134' OR person IS NULL OR person='' THEN RAISE EXCEPTION 'Import kodi yoki ismi noto‘g‘ri'; END IF;
  name_key:=public.employee_name_key(translate(person, chr(8216)||chr(8217)||chr(699)||chr(700)||chr(96),repeat(chr(39),5)));
  SELECT array_agg(id ORDER BY id) INTO matches FROM public.employees WHERE public.employee_name_key(translate(full_name,chr(8216)||chr(8217)||chr(699)||chr(700)||chr(96),repeat(chr(39),5)))=name_key;
  SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.full_name)) INTO owners FROM public.employees e WHERE e.badge_code=code OR EXISTS(SELECT 1 FROM public.employee_badge_aliases a WHERE a.employee_id=e.id AND a.code=code);
  IF owners IS NOT NULL AND (coalesce(array_length(matches,1),0)<>1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(owners) o WHERE (o->>'id')::uuid<>matches[1])) THEN
   RAISE NOTICE 'TO‘QNASHUV: %, %',code,owners;
   result:=result||jsonb_build_array(jsonb_build_object('code',code,'name',person,'outcome','conflict','owners',owners)); conflict_count:=conflict_count+1; CONTINUE;
  END IF;
  IF coalesce(array_length(matches,1),0)>1 THEN
   result:=result||jsonb_build_array(jsonb_build_object('code',code,'name',person,'outcome','ambiguous_name')); CONTINUE;
  END IF;
  IF array_length(matches,1)=1 THEN
   emp:=matches[1]; SELECT badge_code INTO primary_code FROM public.employees WHERE id=emp;
   IF owners IS NULL THEN
    INSERT INTO public.employee_badge_aliases(code,employee_id) VALUES(code,emp);
    alias_count:=alias_count+1;
    result:=result||jsonb_build_array(jsonb_build_object('code',code,'name',person,'id',emp,'primary_code',primary_code,'outcome','alias_added'));
   ELSE
    result:=result||jsonb_build_array(jsonb_build_object('code',code,'name',person,'id',emp,'primary_code',primary_code,'outcome','already_linked'));
   END IF;
  ELSE
   PERFORM set_config('app.prepared_badge_code',code,true); PERFORM set_config('app.prepared_badge_name',person,true);
   IF nullif(r->>'position','') IS NULL THEN
    INSERT INTO public.employees(full_name,badge_code,status,hire_date) VALUES(person,code,'active',CURRENT_DATE) RETURNING id INTO emp;
   ELSE
    INSERT INTO public.employees(full_name,badge_code,status,hire_date,position) VALUES(person,code,'active',CURRENT_DATE,r->>'position') RETURNING id INTO emp;
   END IF;
   PERFORM set_config('app.prepared_badge_code','',true); PERFORM set_config('app.prepared_badge_name','',true);
   inserted_count:=inserted_count+1;
   result:=result||jsonb_build_array(jsonb_build_object('code',code,'name',person,'id',emp,'primary_code',code,'outcome','created'));
  END IF;
 END LOOP;
 SELECT max(substring(x.code FROM 4)::numeric) INTO max_code FROM (SELECT badge_code AS code FROM public.employees UNION ALL SELECT a.code FROM public.employee_badge_aliases a) x WHERE x.code ~ '^MCT[0-9]+$';
 SELECT last_value INTO seq_value FROM public.employee_badge_sequence;
 IF greatest(coalesce(max_code,0),seq_value,139)>=99999 THEN RAISE EXCEPTION 'Bejik sequence diapazoni tugagan'; END IF;
 PERFORM setval('public.employee_badge_sequence',greatest(coalesce(max_code,0),seq_value,139)::bigint,true);
 RETURN jsonb_build_object('created',inserted_count,'aliases_added',alias_count,'conflicts',conflict_count,'rows',result,'next_code','MCT'||lpad((greatest(coalesce(max_code,0),seq_value,139)::bigint+1)::text,5,'0'));
END $$;
REVOKE ALL ON FUNCTION public.import_prepared_employee_badges(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_prepared_employee_badges(jsonb) TO service_role;