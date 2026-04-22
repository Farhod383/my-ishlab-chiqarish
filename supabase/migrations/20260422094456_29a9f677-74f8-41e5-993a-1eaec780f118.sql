DROP POLICY IF EXISTS "order_files_read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_read" ON storage.objects;
CREATE POLICY "order_files_read_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='order-files');
CREATE POLICY "product_images_read_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='product-images');