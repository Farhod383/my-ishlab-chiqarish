CREATE OR REPLACE FUNCTION public.guard_issue_document_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.issue_document_id IS NOT NULL AND (current_setting('app.issue_document_id',true) IS DISTINCT FROM NEW.issue_document_id::text OR NOT EXISTS (SELECT 1 FROM public.stock_issue_documents d WHERE d.id=NEW.issue_document_id AND d.created_by=auth.uid() AND d.employee_id=NEW.recipient_employee_id)) THEN RAISE EXCEPTION 'Topshirish faqat himoyalangan API orqali saqlanadi'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.issue_document_id IS NOT NULL THEN RAISE EXCEPTION 'Umumiy topshirish tarixi o‘zgartirilmaydi'; END IF;
 IF TG_OP='UPDATE' AND NEW.issue_document_id IS DISTINCT FROM OLD.issue_document_id THEN RAISE EXCEPTION 'Topshirish bog‘lanishi o‘zgartirilmaydi'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.enable_issue_document_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM set_config('app.issue_document_id',NEW.id::text,true); RETURN NEW; END $$;
CREATE TRIGGER enable_issue_document_insert AFTER INSERT ON public.stock_issue_documents FOR EACH ROW EXECUTE FUNCTION public.enable_issue_document_insert();