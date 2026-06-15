
CREATE TABLE public.order_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  product_name text NOT NULL,
  default_quantity integer NOT NULL DEFAULT 1,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_templates TO authenticated;
GRANT ALL ON public.order_templates TO service_role;
ALTER TABLE public.order_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tpl_select_auth" ON public.order_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpl_modify_admin_marketing" ON public.order_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'));
CREATE TRIGGER trg_order_templates_updated BEFORE UPDATE ON public.order_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.order_template_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.order_templates(id) ON DELETE CASCADE,
  stage_order integer NOT NULL,
  name text NOT NULL,
  norm_days numeric NOT NULL DEFAULT 1,
  qc_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tpl_stages_tpl ON public.order_template_stages(template_id, stage_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_template_stages TO authenticated;
GRANT ALL ON public.order_template_stages TO service_role;
ALTER TABLE public.order_template_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tpls_select_auth" ON public.order_template_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpls_modify_admin_marketing" ON public.order_template_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'));

CREATE TABLE public.order_template_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.order_templates(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  part_name text NOT NULL,
  unit text NOT NULL DEFAULT 'dona',
  qty_per_unit numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tpl_parts_tpl ON public.order_template_parts(template_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_template_parts TO authenticated;
GRANT ALL ON public.order_template_parts TO service_role;
ALTER TABLE public.order_template_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tplp_select_auth" ON public.order_template_parts FOR SELECT TO authenticated USING (true);
CREATE POLICY "tplp_modify_admin_marketing" ON public.order_template_parts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'));
