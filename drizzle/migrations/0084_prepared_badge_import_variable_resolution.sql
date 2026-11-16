DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.import_prepared_employee_badges(jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'DECLARE r jsonb;',E'#variable_conflict use_variable\nDECLARE r jsonb;');
 EXECUTE definition;
END $$;