-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'marketing', 'manager', 'worker', 'warehouse', 'supply');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;

CREATE POLICY "users_view_own_roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_manage_roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "self_insert_initial_role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email);
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_read_all" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_marketing_manage" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'marketing') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'marketing') OR public.has_role(auth.uid(),'admin'));

-- ============ PRODUCTS (sklad katalogi) ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'dona',
  image_url TEXT,
  stock_qty NUMERIC NOT NULL DEFAULT 0,
  min_limit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_read_all" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_supply_manage" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'supply') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'marketing'))
  WITH CHECK (public.has_role(auth.uid(),'supply') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'marketing'));

-- ============ ORDERS ============
CREATE TYPE public.order_priority AS ENUM ('normal','exception');
CREATE TYPE public.order_status AS ENUM ('pending','in_progress','completed','delayed','cancelled');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_image_url TEXT,
  tz_file_url TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  priority order_priority NOT NULL DEFAULT 'normal',
  status order_status NOT NULL DEFAULT 'pending',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deadline DATE NOT NULL,
  queue_position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  exception_approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_read_all" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "orders_marketing_create" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'marketing') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "orders_managers_update" ON public.orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'));
CREATE POLICY "orders_admin_delete" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ ORDER STAGES ============
CREATE TYPE public.stage_status AS ENUM ('pending','in_progress','completed','delayed');

CREATE TABLE public.order_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  norm_days NUMERIC NOT NULL DEFAULT 1,
  qc_required BOOLEAN NOT NULL DEFAULT false,
  qc_passed BOOLEAN,
  status stage_status NOT NULL DEFAULT 'pending',
  worker_id UUID REFERENCES auth.users(id),
  worker_changed_comment TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stages_read_all" ON public.order_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "stages_manage" ON public.order_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'worker') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'))
  WITH CHECK (public.has_role(auth.uid(),'worker') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'));

-- ============ STAGE TEMPLATES ============
CREATE TABLE public.stage_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.template_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.stage_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  norm_days NUMERIC NOT NULL DEFAULT 1,
  qc_required BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.stage_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tpl_read_all" ON public.stage_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpl_manage" ON public.stage_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'marketing') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'marketing') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "tpls_read_all" ON public.template_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpls_manage" ON public.template_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'marketing') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'marketing') OR public.has_role(auth.uid(),'admin'));

-- ============ ORDER PARTS (zakaz uchun kerakli detallar) ============
CREATE TABLE public.order_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  part_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'dona',
  norm_qty NUMERIC NOT NULL DEFAULT 0,
  actual_qty NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parts_read_all" ON public.order_parts FOR SELECT TO authenticated USING (true);
CREATE POLICY "parts_manage" ON public.order_parts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'))
  WITH CHECK (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing'));

-- ============ STOCK MOVEMENTS ============
CREATE TYPE public.movement_direction AS ENUM ('in','out');

CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  direction movement_direction NOT NULL,
  quantity NUMERIC NOT NULL,
  taken_by UUID REFERENCES auth.users(id),
  recipient_name TEXT,
  comment TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mv_read_all" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "mv_warehouse_out" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    (direction='out' AND (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')))
    OR (direction='in' AND (public.has_role(auth.uid(),'supply') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse')))
  );

-- Update product stock & order_parts on movement
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
      SET stock_qty = stock_qty + CASE WHEN NEW.direction='in' THEN NEW.quantity ELSE -NEW.quantity END
      WHERE id = NEW.product_id;
  END IF;
  IF NEW.direction='out' AND NEW.order_id IS NOT NULL AND NEW.product_id IS NOT NULL THEN
    UPDATE public.order_parts SET actual_qty = actual_qty + NEW.quantity
      WHERE order_id = NEW.order_id AND product_id = NEW.product_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_apply_stock_movement AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.order_stages(id) ON DELETE SET NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read_all" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert_auth" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES ('order-files','order-files',true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images','product-images',true) ON CONFLICT DO NOTHING;

CREATE POLICY "order_files_read" ON storage.objects FOR SELECT USING (bucket_id='order-files');
CREATE POLICY "order_files_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='order-files');
CREATE POLICY "order_files_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='order-files');
CREATE POLICY "product_images_read" ON storage.objects FOR SELECT USING (bucket_id='product-images');
CREATE POLICY "product_images_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='product-images');
CREATE POLICY "product_images_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='product-images');

-- Indexes
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_queue ON public.orders(queue_position);
CREATE INDEX idx_stages_order ON public.order_stages(order_id, stage_order);
CREATE INDEX idx_movements_order ON public.stock_movements(order_id);
CREATE INDEX idx_audit_order ON public.audit_log(order_id);