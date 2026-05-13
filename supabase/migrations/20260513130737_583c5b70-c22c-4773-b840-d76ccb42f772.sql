
-- 1. Products: allow warehouse role to manage
DROP POLICY IF EXISTS products_warehouse_manage ON public.products;
CREATE POLICY products_warehouse_manage ON public.products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'warehouse'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'warehouse'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2. user_roles: allow any authenticated user to see role assignments (needed for chat role labels)
DROP POLICY IF EXISTS users_view_own_roles ON public.user_roles;
CREATE POLICY user_roles_read_all ON public.user_roles
  FOR SELECT TO authenticated
  USING (true);

-- 3. Storage policy for product-images: warehouse + admin can upload/update/delete
DROP POLICY IF EXISTS "product_images_warehouse_write" ON storage.objects;
CREATE POLICY "product_images_warehouse_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-images' AND (public.has_role(auth.uid(),'warehouse'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supply'::app_role)))
  WITH CHECK (bucket_id = 'product-images' AND (public.has_role(auth.uid(),'warehouse'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supply'::app_role)));
