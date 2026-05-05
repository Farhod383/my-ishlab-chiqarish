
CREATE TABLE public.order_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_files_read_all" ON public.order_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_files_insert" ON public.order_files FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "order_files_delete" ON public.order_files FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role) OR uploaded_by = auth.uid());

CREATE INDEX idx_order_files_order_id ON public.order_files(order_id);
