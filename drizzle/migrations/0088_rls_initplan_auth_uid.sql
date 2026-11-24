-- Tezlik (Supabase tavsiyasi): RLS qoidalarida auth.uid() har bir qator uchun qayta hisoblanmasin.
-- auth.uid() -> (select auth.uid()). Mantiq AYNAN bir xil qoladi; faqat Postgres uni so'rovga
-- bir marta hisoblaydi (initPlan). Faqat public sxemasi; allaqachon o'ralganlarga tegilmaydi.
DO $$
DECLARE
  p record;
  q text;
  c text;
  n int := 0;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    q := p.qual;
    c := p.with_check;
    IF q IS NOT NULL AND q ~ 'auth\.uid\(\)' AND q !~* 'select auth\.uid\(\)' THEN
      q := regexp_replace(q, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    END IF;
    IF c IS NOT NULL AND c ~ 'auth\.uid\(\)' AND c !~* 'select auth\.uid\(\)' THEN
      c := regexp_replace(c, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    END IF;
    IF q IS DISTINCT FROM p.qual THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, q);
      n := n + 1;
    END IF;
    IF c IS DISTINCT FROM p.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, c);
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'RLS: % ta ifoda (select auth.uid()) ga o''raldi', n;
END $$;
