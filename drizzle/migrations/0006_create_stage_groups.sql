-- 1. Stage groups
CREATE TABLE public.stage_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  group_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stage_groups_name_lower_idx ON public.stage_groups (lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_groups TO authenticated;
GRANT ALL ON public.stage_groups TO service_role;
ALTER TABLE public.stage_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY sg_select ON public.stage_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY sg_insert ON public.stage_groups FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY sg_update ON public.stage_groups FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY sg_delete ON public.stage_groups FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Catalog of child stages inside a group
CREATE TABLE public.stage_group_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.stage_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  item_order integer NOT NULL DEFAULT 1,
  norm_days numeric NOT NULL DEFAULT 1,
  qc_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stage_group_items_unique_idx ON public.stage_group_items (group_id, lower(name));
CREATE INDEX stage_group_items_group_idx ON public.stage_group_items (group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_group_items TO authenticated;
GRANT ALL ON public.stage_group_items TO service_role;
ALTER TABLE public.stage_group_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY sgi_select ON public.stage_group_items FOR SELECT TO authenticated USING (true);
CREATE POLICY sgi_insert ON public.stage_group_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY sgi_update ON public.stage_group_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY sgi_delete ON public.stage_group_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Link existing stages to groups (additive, nullable)
ALTER TABLE public.order_stages ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.stage_groups(id) ON DELETE SET NULL;
ALTER TABLE public.order_stages ADD COLUMN IF NOT EXISTS group_order integer;
CREATE INDEX IF NOT EXISTS order_stages_group_idx ON public.order_stages (group_id);

-- 4. Seed default groups
INSERT INTO public.stage_groups (name, group_order) VALUES
  ('Chizma', 1),
  ('Zagatovka', 2),
  ('Lazer', 3),
  ('Valsofka', 4),
  ('GIP', 5),
  ('Svarka', 6),
  ('Malyarka', 7),
  ('Bo''yoq', 8),
  ('Zborka', 9),
  ('Elektrika', 10),
  ('Ispitaniya', 11),
  ('Tozalash va upakovka', 12),
  ('Boshqa', 99);

-- 5. Backfill: attach every existing stage to a group by keyword (names untouched)
UPDATE public.order_stages os
SET group_id = g.id,
    group_order = COALESCE(os.group_order, os.stage_order)
FROM public.stage_groups g
WHERE os.group_id IS NULL
  AND g.name = (
    CASE
      WHEN lower(os.name) LIKE '%chizma%' THEN 'Chizma'
      WHEN lower(os.name) LIKE '%lazer%' THEN 'Lazer'
      WHEN lower(os.name) LIKE '%valsofka%' OR lower(os.name) LIKE '%vals %' THEN 'Valsofka'
      WHEN lower(os.name) LIKE '%gip%' THEN 'GIP'
      WHEN lower(os.name) LIKE '%svarka%' THEN 'Svarka'
      WHEN lower(os.name) LIKE '%malyarka%' THEN 'Malyarka'
      WHEN lower(os.name) LIKE '%kraska%' OR lower(os.name) LIKE '%bo''yoq%' OR lower(os.name) LIKE '%boyoq%' OR lower(os.name) LIKE '%grunt%' OR lower(os.name) LIKE '%pokraska%' THEN 'Bo''yoq'
      WHEN lower(os.name) LIKE '%ispitaniya%' OR lower(os.name) LIKE '%germetik%' OR lower(os.name) LIKE '%test%' THEN 'Ispitaniya'
      WHEN lower(os.name) LIKE '%elektrika%' OR lower(os.name) LIKE '%chiroq%' OR lower(os.name) LIKE '%kamera%' OR lower(os.name) LIKE '%migalka%' OR lower(os.name) LIKE '%bzu%' OR lower(os.name) LIKE '%zzu%' THEN 'Elektrika'
      WHEN lower(os.name) LIKE '%zagatov%' THEN 'Zagatovka'
      WHEN lower(os.name) LIKE '%zborka%' OR lower(os.name) LIKE '%montaj%' OR lower(os.name) LIKE '%ornatish%' OR lower(os.name) LIKE '%o''rnatish%' OR lower(os.name) LIKE '%ustanovka%' OR lower(os.name) LIKE '%obshifka%' OR lower(os.name) LIKE '%yopishtirish%' THEN 'Zborka'
      WHEN lower(os.name) LIKE '%chistka%' OR lower(os.name) LIKE '%tozalash%' OR lower(os.name) LIKE '%upakovka%' THEN 'Tozalash va upakovka'
      ELSE 'Boshqa'
    END
  );

-- 6. Seed catalog from existing distinct stage names, preserving original spelling
INSERT INTO public.stage_group_items (group_id, name, item_order, norm_days, qc_required)
SELECT DISTINCT ON (os.group_id, lower(btrim(os.name)))
       os.group_id,
       btrim(os.name),
       1,
       GREATEST(COALESCE(os.norm_days, 1), 0.5),
       false
FROM public.order_stages os
WHERE os.group_id IS NOT NULL AND btrim(os.name) <> ''
ORDER BY os.group_id, lower(btrim(os.name)), os.created_at;

CREATE TRIGGER stage_groups_updated_at BEFORE UPDATE ON public.stage_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
