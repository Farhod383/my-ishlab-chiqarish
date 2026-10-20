ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS amount_usd numeric NOT NULL DEFAULT 0;
CREATE TABLE public.debt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS','USD')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_items TO authenticated;
GRANT ALL ON public.debt_items TO service_role;
ALTER TABLE public.debt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY debt_items_select ON public.debt_items FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY debt_items_write ON public.debt_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'chief_accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'chief_accountant'));
CREATE OR REPLACE FUNCTION public.recalc_debt_from_items() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid := COALESCE(NEW.debt_id, OLD.debt_id);
BEGIN
  UPDATE public.debts d SET
    amount = COALESCE((SELECT sum(quantity*unit_price) FROM public.debt_items WHERE debt_id=_id AND currency='UZS'),0),
    amount_usd = COALESCE((SELECT sum(quantity*unit_price) FROM public.debt_items WHERE debt_id=_id AND currency='USD'),0),
    currency = 'UZS', updated_at = now()
  WHERE d.id=_id;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_debt_items_recalc AFTER INSERT OR UPDATE OR DELETE ON public.debt_items FOR EACH ROW EXECUTE FUNCTION public.recalc_debt_from_items();