ALTER TABLE public.intake_items DROP CONSTRAINT intake_items_product_id_fkey;
ALTER TABLE public.intake_items ADD CONSTRAINT intake_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.order_parts DROP CONSTRAINT order_parts_product_id_fkey;
ALTER TABLE public.order_parts ADD CONSTRAINT order_parts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.returns DROP CONSTRAINT returns_product_id_fkey;
ALTER TABLE public.returns ADD CONSTRAINT returns_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.defects DROP CONSTRAINT defects_product_id_fkey;
ALTER TABLE public.defects ADD CONSTRAINT defects_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.service_request_items DROP CONSTRAINT service_request_items_product_id_fkey;
ALTER TABLE public.service_request_items ADD CONSTRAINT service_request_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;