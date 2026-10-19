CREATE TYPE public.material_kind AS ENUM ('raw_honey','packaging');
CREATE TYPE public.purchase_status AS ENUM ('draft','received','cancelled');

CREATE TABLE public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind public.material_kind NOT NULL DEFAULT 'packaging',
  unit text NOT NULL DEFAULT 'pcs',
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  avg_cost numeric(14,4) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  purchase_date date NOT NULL DEFAULT current_date,
  reference text,
  status public.purchase_status NOT NULL DEFAULT 'draft',
  notes text,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  received_at timestamptz,
  received_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id),
  qty numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost >= 0)
);
CREATE TABLE public.material_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  material_id uuid NOT NULL REFERENCES public.materials(id),
  qty_change numeric(14,3) NOT NULL,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  ref_type text NOT NULL,
  ref_id uuid,
  note text,
  created_by uuid DEFAULT auth.uid()
);
CREATE TABLE public.product_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty_change numeric(14,3) NOT NULL,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  ref_type text NOT NULL,
  ref_id uuid,
  note text,
  created_by uuid DEFAULT auth.uid()
);
CREATE TABLE public.bottling_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL DEFAULT current_date,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty_produced numeric(14,3) NOT NULL CHECK (qty_produced > 0),
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bottling_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.bottling_runs(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id),
  qty numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_cost numeric(14,4) NOT NULL DEFAULT 0
);
CREATE INDEX ON public.material_ledger(material_id);
CREATE INDEX ON public.product_ledger(product_id);
CREATE INDEX ON public.purchase_lines(purchase_id);

GRANT SELECT, INSERT, UPDATE ON public.materials, public.purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_lines TO authenticated;
GRANT SELECT ON public.material_ledger, public.product_ledger, public.bottling_runs, public.bottling_inputs TO authenticated;
GRANT ALL ON public.materials, public.purchases, public.purchase_lines, public.material_ledger, public.product_ledger, public.bottling_runs, public.bottling_inputs TO service_role;

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bottling_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bottling_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read materials" ON public.materials FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]));
CREATE POLICY "manager insert materials" ON public.materials FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "manager update materials" ON public.materials FOR UPDATE TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "staff read purchases" ON public.purchases FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]));
CREATE POLICY "store insert purchases" ON public.purchases FOR INSERT TO authenticated WITH CHECK (status = 'draft' AND public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper']::public.app_role[]));
CREATE POLICY "store update draft purchases" ON public.purchases FOR UPDATE TO authenticated USING (status = 'draft' AND public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper']::public.app_role[])) WITH CHECK (status = 'draft');

CREATE POLICY "staff read purchase lines" ON public.purchase_lines FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]));
CREATE POLICY "store write draft lines" ON public.purchase_lines FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper']::public.app_role[]) AND EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND p.status = 'draft'))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper']::public.app_role[]) AND EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND p.status = 'draft'));

CREATE POLICY "staff read material ledger" ON public.material_ledger FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]));
CREATE POLICY "staff read product ledger" ON public.product_ledger FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]));
CREATE POLICY "staff read bottling" ON public.bottling_runs FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]));
CREATE POLICY "staff read bottling inputs" ON public.bottling_inputs FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]));

CREATE VIEW public.material_stock WITH (security_invoker = true) AS
  SELECT material_id, SUM(qty_change)::numeric(14,3) AS on_hand FROM public.material_ledger GROUP BY material_id;
CREATE VIEW public.product_stock WITH (security_invoker = true) AS
  SELECT product_id, SUM(qty_change)::numeric(14,3) AS on_hand FROM public.product_ledger GROUP BY product_id;
GRANT SELECT ON public.material_stock, public.product_stock TO authenticated;

CREATE TRIGGER audit_materials AFTER INSERT OR UPDATE OR DELETE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_purchases AFTER INSERT OR UPDATE OR DELETE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_bottling AFTER INSERT ON public.bottling_runs FOR EACH ROW EXECUTE FUNCTION public.audit_row();

CREATE OR REPLACE FUNCTION public.receive_purchase(_purchase_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; l record; onhand numeric; cur_avg numeric; tot numeric := 0;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper']::app_role[]) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO p FROM purchases WHERE id = _purchase_id FOR UPDATE;
  IF p IS NULL THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Purchase already %', p.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM purchase_lines WHERE purchase_id = _purchase_id) THEN RAISE EXCEPTION 'Purchase has no items'; END IF;
  FOR l IN SELECT * FROM purchase_lines WHERE purchase_id = _purchase_id LOOP
    SELECT avg_cost INTO cur_avg FROM materials WHERE id = l.material_id FOR UPDATE;
    SELECT COALESCE(SUM(qty_change),0) INTO onhand FROM material_ledger WHERE material_id = l.material_id;
    UPDATE materials SET avg_cost = CASE WHEN onhand <= 0 THEN l.unit_cost
      ELSE round((onhand * cur_avg + l.qty * l.unit_cost) / (onhand + l.qty), 4) END WHERE id = l.material_id;
    INSERT INTO material_ledger(material_id, qty_change, unit_cost, ref_type, ref_id)
      VALUES (l.material_id, l.qty, l.unit_cost, 'purchase', _purchase_id);
    tot := tot + l.qty * l.unit_cost;
  END LOOP;
  UPDATE purchases SET status = 'received', total = round(tot, 2), received_at = now(), received_by = auth.uid() WHERE id = _purchase_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_purchase(_purchase_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper']::app_role[]) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE purchases SET status = 'cancelled' WHERE id = _purchase_id AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only draft purchases can be cancelled'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.post_bottling(_product_id uuid, _qty numeric, _run_date date, _notes text, _inputs jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i jsonb; mid uuid; q numeric; onhand numeric; c numeric; tot numeric := 0; rid uuid; ucost numeric; pon numeric; pavg numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper']::app_role[]) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantity produced must be above zero'; END IF;
  IF jsonb_array_length(COALESCE(_inputs,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Add at least one material used'; END IF;
  INSERT INTO bottling_runs(run_date, product_id, qty_produced, notes) VALUES (COALESCE(_run_date, current_date), _product_id, _qty, NULLIF(trim(_notes),'')) RETURNING id INTO rid;
  FOR i IN SELECT * FROM jsonb_array_elements(_inputs) LOOP
    mid := (i->>'material_id')::uuid; q := (i->>'qty')::numeric;
    IF q IS NULL OR q <= 0 THEN RAISE EXCEPTION 'Material quantities must be above zero'; END IF;
    SELECT avg_cost INTO c FROM materials WHERE id = mid FOR UPDATE;
    SELECT COALESCE(SUM(qty_change),0) INTO onhand FROM material_ledger WHERE material_id = mid;
    IF onhand < q THEN RAISE EXCEPTION 'Not enough % in stock (have %, need %)', (SELECT name FROM materials WHERE id = mid), onhand, q; END IF;
    INSERT INTO bottling_inputs(run_id, material_id, qty, unit_cost) VALUES (rid, mid, q, c);
    INSERT INTO material_ledger(material_id, qty_change, unit_cost, ref_type, ref_id) VALUES (mid, -q, c, 'bottling', rid);
    tot := tot + q * c;
  END LOOP;
  ucost := round(tot / _qty, 4);
  UPDATE bottling_runs SET unit_cost = ucost, total_cost = round(tot, 2) WHERE id = rid;
  SELECT COALESCE(SUM(qty_change),0) INTO pon FROM product_ledger WHERE product_id = _product_id;
  SELECT production_cost INTO pavg FROM product_costs WHERE product_id = _product_id;
  INSERT INTO product_costs(product_id, production_cost, updated_at)
    VALUES (_product_id, CASE WHEN pon <= 0 OR pavg IS NULL THEN round(ucost,2) ELSE round((pon*pavg + tot)/(pon+_qty), 2) END, now())
    ON CONFLICT (product_id) DO UPDATE SET production_cost = EXCLUDED.production_cost, updated_at = now();
  INSERT INTO product_ledger(product_id, qty_change, unit_cost, ref_type, ref_id) VALUES (_product_id, _qty, ucost, 'bottling', rid);
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.adjust_material_stock(_material_id uuid, _qty_change numeric, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE onhand numeric; c numeric;
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Only owner or admin can adjust stock'; END IF;
  IF _qty_change IS NULL OR _qty_change = 0 THEN RAISE EXCEPTION 'Enter a non-zero quantity'; END IF;
  IF COALESCE(trim(_note),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT avg_cost INTO c FROM materials WHERE id = _material_id FOR UPDATE;
  SELECT COALESCE(SUM(qty_change),0) INTO onhand FROM material_ledger WHERE material_id = _material_id;
  IF onhand + _qty_change < 0 THEN RAISE EXCEPTION 'Stock cannot go below zero'; END IF;
  INSERT INTO material_ledger(material_id, qty_change, unit_cost, ref_type, note) VALUES (_material_id, _qty_change, c, 'adjustment', trim(_note));
END $$;

REVOKE EXECUTE ON FUNCTION public.receive_purchase(uuid), public.cancel_purchase(uuid), public.post_bottling(uuid, numeric, date, text, jsonb), public.adjust_material_stock(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase(uuid), public.cancel_purchase(uuid), public.post_bottling(uuid, numeric, date, text, jsonb), public.adjust_material_stock(uuid, numeric, text) TO authenticated;