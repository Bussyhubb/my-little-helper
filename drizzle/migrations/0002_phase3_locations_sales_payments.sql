CREATE TYPE public.payment_method AS ENUM ('cash','transfer','pos','other');
CREATE TYPE public.txn_status AS ENUM ('posted','reversed');

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  agent_id uuid,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX locations_one_default ON public.locations(is_default) WHERE is_default;
INSERT INTO public.locations(name, is_default) VALUES ('Main store', true);

ALTER TABLE public.product_ledger ADD COLUMN location_id uuid REFERENCES public.locations(id);
UPDATE public.product_ledger SET location_id = (SELECT id FROM public.locations WHERE is_default) WHERE location_id IS NULL;
CREATE INDEX ON public.product_ledger(location_id, product_id);

CREATE OR REPLACE FUNCTION public.default_ledger_location() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.location_id IS NULL THEN NEW.location_id := (SELECT id FROM locations WHERE is_default); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_ledger_default_location BEFORE INSERT ON public.product_ledger FOR EACH ROW EXECUTE FUNCTION public.default_ledger_location();

CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_date date NOT NULL DEFAULT current_date,
  from_location uuid NOT NULL REFERENCES public.locations(id),
  to_location uuid NOT NULL REFERENCES public.locations(id),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_no bigint GENERATED ALWAYS AS IDENTITY,
  sale_date date NOT NULL DEFAULT current_date,
  customer_id uuid REFERENCES public.customers(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  agent_id uuid NOT NULL DEFAULT auth.uid(),
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  status public.txn_status NOT NULL DEFAULT 'posted',
  notes text,
  reversed_at timestamptz,
  reversed_by uuid,
  reverse_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_price numeric(14,2) NOT NULL,
  line_total numeric(14,2) NOT NULL
);
CREATE TABLE public.sale_line_costs (
  sale_line_id uuid PRIMARY KEY REFERENCES public.sale_lines(id),
  unit_cost numeric(14,4) NOT NULL DEFAULT 0
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference text,
  paid_at date NOT NULL DEFAULT current_date,
  received_by uuid DEFAULT auth.uid(),
  status public.txn_status NOT NULL DEFAULT 'posted',
  reversed_at timestamptz,
  reversed_by uuid,
  reverse_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.sale_lines(sale_id);
CREATE INDEX ON public.payments(sale_id);
CREATE INDEX ON public.sales(agent_id);

GRANT SELECT, INSERT, UPDATE ON public.locations TO authenticated;
GRANT SELECT ON public.stock_transfers, public.sales, public.sale_lines, public.sale_line_costs, public.payments TO authenticated;
GRANT ALL ON public.locations, public.stock_transfers, public.sales, public.sale_lines, public.sale_line_costs, public.payments TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_line_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read locations" ON public.locations FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]) OR agent_id = auth.uid());
CREATE POLICY "manager insert locations" ON public.locations FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "manager update locations" ON public.locations FOR UPDATE TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "staff read transfers" ON public.stock_transfers FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]));
CREATE POLICY "agent read own location ledger" ON public.product_ledger FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_id AND l.agent_id = auth.uid()));
CREATE POLICY "read sales" ON public.sales FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper','accountant']::public.app_role[]) OR agent_id = auth.uid());
CREATE POLICY "read sale lines" ON public.sale_lines FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));
CREATE POLICY "finance read sale costs" ON public.sale_line_costs FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','accountant']::public.app_role[]));
CREATE POLICY "read payments" ON public.payments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));

CREATE VIEW public.product_stock_by_location WITH (security_invoker = true) AS
  SELECT product_id, location_id, SUM(qty_change)::numeric(14,3) AS on_hand FROM public.product_ledger GROUP BY product_id, location_id;
CREATE VIEW public.sale_balances WITH (security_invoker = true) AS
  SELECT s.id AS sale_id, s.total, COALESCE((SELECT SUM(p.amount) FROM public.payments p WHERE p.sale_id = s.id AND p.status = 'posted'),0)::numeric(14,2) AS paid,
    (s.total - COALESCE((SELECT SUM(p.amount) FROM public.payments p WHERE p.sale_id = s.id AND p.status = 'posted'),0))::numeric(14,2) AS balance
  FROM public.sales s WHERE s.status = 'posted';
GRANT SELECT ON public.product_stock_by_location, public.sale_balances TO authenticated;

CREATE TRIGGER audit_locations AFTER INSERT OR UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_sales AFTER INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_transfers AFTER INSERT ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION public.audit_row();

CREATE OR REPLACE FUNCTION public.transfer_stock(_from uuid, _to uuid, _date date, _notes text, _lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i jsonb; pid uuid; q numeric; onhand numeric; c numeric; tid uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['owner','admin','storekeeper']::app_role[]) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from = _to THEN RAISE EXCEPTION 'Choose two different locations'; END IF;
  IF jsonb_array_length(COALESCE(_lines,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Add at least one product'; END IF;
  INSERT INTO stock_transfers(transfer_date, from_location, to_location, notes) VALUES (COALESCE(_date, current_date), _from, _to, NULLIF(trim(_notes),'')) RETURNING id INTO tid;
  FOR i IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    pid := (i->>'product_id')::uuid; q := (i->>'qty')::numeric;
    IF q IS NULL OR q <= 0 THEN RAISE EXCEPTION 'Quantities must be above zero'; END IF;
    PERFORM 1 FROM products WHERE id = pid FOR UPDATE;
    SELECT COALESCE(SUM(qty_change),0) INTO onhand FROM product_ledger WHERE product_id = pid AND location_id = _from;
    IF onhand < q THEN RAISE EXCEPTION 'Not enough % at source (have %, need %)', (SELECT name || ' ' || size_label FROM products WHERE id = pid), onhand, q; END IF;
    SELECT COALESCE(production_cost,0) INTO c FROM product_costs WHERE product_id = pid;
    INSERT INTO product_ledger(product_id, location_id, qty_change, unit_cost, ref_type, ref_id) VALUES (pid, _from, -q, COALESCE(c,0), 'transfer', tid), (pid, _to, q, COALESCE(c,0), 'transfer', tid);
  END LOOP;
  RETURN tid;
END $$;

CREATE OR REPLACE FUNCTION public.post_sale(_customer_id uuid, _location_id uuid, _sale_date date, _discount numeric, _notes text, _lines jsonb, _pay_amount numeric, _pay_method public.payment_method, _pay_ref text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); is_store boolean; loc record; cust record; i jsonb; pid uuid; q numeric; price numeric; onhand numeric; c numeric;
  sid uuid; lid uuid; sub numeric := 0; disc numeric := COALESCE(_discount,0); tot numeric; owed numeric;
BEGIN
  is_store := public.has_any_role(uid, ARRAY['owner','admin','storekeeper']::app_role[]);
  SELECT * INTO loc FROM locations WHERE id = _location_id AND is_active;
  IF loc IS NULL THEN RAISE EXCEPTION 'Location not found'; END IF;
  IF NOT (is_store OR (loc.agent_id = uid AND public.has_any_role(uid, ARRAY['agent','distributor']::app_role[]))) THEN RAISE EXCEPTION 'You cannot sell from this location'; END IF;
  IF disc < 0 THEN RAISE EXCEPTION 'Discount cannot be negative'; END IF;
  IF disc > 0 AND NOT public.is_manager(uid) THEN RAISE EXCEPTION 'Only owner or admin can give discounts'; END IF;
  IF _customer_id IS NOT NULL THEN
    SELECT * INTO cust FROM customers WHERE id = _customer_id AND is_active;
    IF cust IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
    IF NOT is_store AND NOT public.has_role(uid,'accountant') AND cust.assigned_agent IS DISTINCT FROM uid THEN RAISE EXCEPTION 'This is not your customer'; END IF;
  END IF;
  IF jsonb_array_length(COALESCE(_lines,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Add at least one product'; END IF;
  INSERT INTO sales(sale_date, customer_id, location_id, agent_id, notes) VALUES (COALESCE(_sale_date, current_date), _customer_id, _location_id, COALESCE(loc.agent_id, uid), NULLIF(trim(_notes),'')) RETURNING id INTO sid;
  FOR i IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    pid := (i->>'product_id')::uuid; q := (i->>'qty')::numeric;
    IF q IS NULL OR q <= 0 THEN RAISE EXCEPTION 'Quantities must be above zero'; END IF;
    SELECT CASE WHEN cust IS NULL OR cust.category = 'retail' THEN retail_price
                WHEN cust.category = 'distributor' THEN agent_price ELSE wholesale_price END
      INTO price FROM products WHERE id = pid AND is_active FOR UPDATE;
    IF price IS NULL THEN RAISE EXCEPTION 'Product not available'; END IF;
    IF price <= 0 THEN RAISE EXCEPTION 'No selling price set for %', (SELECT name || ' ' || size_label FROM products WHERE id = pid); END IF;
    SELECT COALESCE(SUM(qty_change),0) INTO onhand FROM product_ledger WHERE product_id = pid AND location_id = _location_id;
    IF onhand < q THEN RAISE EXCEPTION 'Not enough % in stock (have %, need %)', (SELECT name || ' ' || size_label FROM products WHERE id = pid), onhand, q; END IF;
    SELECT production_cost INTO c FROM product_costs WHERE product_id = pid;
    INSERT INTO sale_lines(sale_id, product_id, qty, unit_price, line_total) VALUES (sid, pid, q, price, round(q*price,2)) RETURNING id INTO lid;
    INSERT INTO sale_line_costs(sale_line_id, unit_cost) VALUES (lid, COALESCE(c,0));
    INSERT INTO product_ledger(product_id, location_id, qty_change, unit_cost, ref_type, ref_id) VALUES (pid, _location_id, -q, COALESCE(c,0), 'sale', sid);
    sub := sub + round(q*price,2);
  END LOOP;
  IF disc > sub THEN RAISE EXCEPTION 'Discount is larger than the sale'; END IF;
  tot := sub - disc;
  UPDATE sales SET subtotal = sub, discount = disc, total = tot WHERE id = sid;
  IF COALESCE(_pay_amount,0) < 0 THEN RAISE EXCEPTION 'Payment cannot be negative'; END IF;
  IF COALESCE(_pay_amount,0) > tot THEN RAISE EXCEPTION 'Payment is more than the sale total'; END IF;
  IF COALESCE(_pay_amount,0) < tot THEN
    IF cust IS NULL THEN RAISE EXCEPTION 'Walk-in sales must be paid in full'; END IF;
    SELECT COALESCE(SUM(b.balance),0) INTO owed FROM sale_balances b JOIN sales s ON s.id = b.sale_id WHERE s.customer_id = _customer_id AND s.id <> sid;
    IF owed + (tot - COALESCE(_pay_amount,0)) > cust.credit_limit THEN
      RAISE EXCEPTION 'Credit limit exceeded (limit %, already owing %)', cust.credit_limit, owed;
    END IF;
  END IF;
  IF COALESCE(_pay_amount,0) > 0 THEN
    INSERT INTO payments(sale_id, amount, method, reference, paid_at) VALUES (sid, _pay_amount, COALESCE(_pay_method,'cash'), NULLIF(trim(_pay_ref),''), COALESCE(_sale_date, current_date));
  END IF;
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.record_payment(_sale_id uuid, _amount numeric, _method public.payment_method, _ref text, _date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; bal numeric; pid uuid;
BEGIN
  SELECT * INTO s FROM sales WHERE id = _sale_id FOR UPDATE;
  IF s IS NULL OR s.status <> 'posted' THEN RAISE EXCEPTION 'Sale not found or reversed'; END IF;
  IF NOT (public.has_any_role(auth.uid(), ARRAY['owner','admin','accountant','storekeeper']::app_role[]) OR s.agent_id = auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be above zero'; END IF;
  SELECT balance INTO bal FROM sale_balances WHERE sale_id = _sale_id;
  IF _amount > bal THEN RAISE EXCEPTION 'Amount is more than the balance owed (%)', bal; END IF;
  INSERT INTO payments(sale_id, amount, method, reference, paid_at) VALUES (_sale_id, _amount, COALESCE(_method,'cash'), NULLIF(trim(_ref),''), COALESCE(_date, current_date)) RETURNING id INTO pid;
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_payment(_payment_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Only owner or admin can reverse payments'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE payments SET status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reverse_reason = trim(_reason) WHERE id = _payment_id AND status = 'posted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment already reversed'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_sale(_sale_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; l record;
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Only owner or admin can reverse sales'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO s FROM sales WHERE id = _sale_id FOR UPDATE;
  IF s IS NULL OR s.status <> 'posted' THEN RAISE EXCEPTION 'Sale already reversed'; END IF;
  FOR l IN SELECT sl.*, COALESCE(c.unit_cost,0) AS uc FROM sale_lines sl LEFT JOIN sale_line_costs c ON c.sale_line_id = sl.id WHERE sl.sale_id = _sale_id LOOP
    INSERT INTO product_ledger(product_id, location_id, qty_change, unit_cost, ref_type, ref_id, note) VALUES (l.product_id, s.location_id, l.qty, l.uc, 'sale_reversal', _sale_id, trim(_reason));
  END LOOP;
  UPDATE payments SET status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reverse_reason = 'Sale reversed: ' || trim(_reason) WHERE sale_id = _sale_id AND status = 'posted';
  UPDATE sales SET status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reverse_reason = trim(_reason) WHERE id = _sale_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.transfer_stock(uuid,uuid,date,text,jsonb), public.post_sale(uuid,uuid,date,numeric,text,jsonb,numeric,public.payment_method,text), public.record_payment(uuid,numeric,public.payment_method,text,date), public.reverse_payment(uuid,text), public.reverse_sale(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_stock(uuid,uuid,date,text,jsonb), public.post_sale(uuid,uuid,date,numeric,text,jsonb,numeric,public.payment_method,text), public.record_payment(uuid,numeric,public.payment_method,text,date), public.reverse_payment(uuid,text), public.reverse_sale(uuid,text) TO authenticated;