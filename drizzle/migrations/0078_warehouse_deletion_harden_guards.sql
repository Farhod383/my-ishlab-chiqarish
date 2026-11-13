DO $ddl$ DECLARE definition text; fn text; BEGIN
FOR fn IN SELECT unnest(ARRAY['guard_warehouse_delete','guard_issue_document_movement','guard_reconciliation_movement']) LOOP
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=fn;
 definition:=regexp_replace(definition, E'^[^\n]*auth\\.uid\\(\\) IS NULL AND[^\n]*RETURN OLD; END IF;[^\n]*\n', '', 'gn');
 EXECUTE definition;
END LOOP;
SELECT pg_get_functiondef('public.delete_warehouse_record(text,uuid[],numeric)'::regprocedure) INTO definition;
definition:=replace(definition,'e.reconciliation_id=m.reconciliation_key','e.document_id=m.reconciliation_key');
EXECUTE definition;
END $ddl$;