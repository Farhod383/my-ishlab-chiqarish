ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_clients_updated ON public.clients;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.client_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'phone',
  content text NOT NULL,
  next_contact_date date,
  comment text,
  actor_id uuid,
  actor_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_interactions TO authenticated;
GRANT ALL ON public.client_interactions TO service_role;
ALTER TABLE public.client_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read interactions" ON public.client_interactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert interactions" ON public.client_interactions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "owner or admin update interactions" ON public.client_interactions FOR UPDATE TO authenticated USING (actor_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owner or admin delete interactions" ON public.client_interactions FOR DELETE TO authenticated USING (actor_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  name text NOT NULL,
  doc_type text,
  status text NOT NULL DEFAULT 'pending',
  issued_at date,
  file_url text,
  comment text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_documents TO authenticated;
GRANT ALL ON public.client_documents TO service_role;
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read client docs" ON public.client_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert client docs" ON public.client_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update client docs" ON public.client_documents FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete client docs" ON public.client_documents FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_client_docs_updated BEFORE UPDATE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_client_interactions_client ON public.client_interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_documents_client ON public.client_documents(client_id);