
create type public.app_role as enum ('owner','admin','agent','storekeeper','accountant','distributor');
create type public.customer_category as enum ('retail','wholesale','supermarket','distributor','corporate');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;
create or replace function public.is_manager(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role in ('owner','admin'))
$$;
create or replace function public.is_active_user(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.profiles where id=_user_id), false)
$$;
create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role = any(_roles))
  and public.is_active_user(_user_id)
$$;

-- first person to register becomes the owner
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email);
  if not exists (select 1 from public.user_roles where role='owner') then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.business_settings (
  id boolean primary key default true check (id),
  business_name text not null default 'Prisca Household and Enterprise',
  brand_name text not null default 'Prisca Honey',
  address text, phone text, email text,
  currency text not null default 'NGN',
  timezone text not null default 'Africa/Lagos',
  invoice_prefix text not null default 'INV',
  honey_kg_to_litre numeric(8,4) not null default 0.7000 check (honey_kg_to_litre > 0),
  updated_at timestamptz not null default now()
);
insert into public.business_settings (id) values (true);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  size_label text not null,
  unit text not null default 'ml',
  barcode text,
  retail_price numeric(14,2) not null default 0 check (retail_price >= 0),
  wholesale_price numeric(14,2) not null default 0 check (wholesale_price >= 0),
  agent_price numeric(14,2) not null default 0 check (agent_price >= 0),
  min_stock numeric(14,2) not null default 0,
  reorder_qty numeric(14,2) not null default 0,
  packaging_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  production_cost numeric(14,2) not null default 0 check (production_cost >= 0),
  updated_at timestamptz not null default now()
);
create table public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  retail_price numeric(14,2) not null,
  wholesale_price numeric(14,2) not null,
  agent_price numeric(14,2) not null,
  effective_from timestamptz not null default now(),
  changed_by uuid
);
create or replace function public.log_price_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op='INSERT' or new.retail_price<>old.retail_price or new.wholesale_price<>old.wholesale_price or new.agent_price<>old.agent_price then
    insert into public.product_price_history(product_id,retail_price,wholesale_price,agent_price,changed_by)
    values (new.id,new.retail_price,new.wholesale_price,new.agent_price,auth.uid());
  end if;
  return new;
end $$;
create trigger products_price_history after insert or update on public.products
  for each row execute function public.log_price_change();

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text, phone text, address text, notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text, address text,
  category public.customer_category not null default 'retail',
  assigned_agent uuid,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  payment_terms text, notes text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index customers_agent_idx on public.customers(assigned_agent);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb, new_data jsonb
);
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  if tg_op='DELETE' then rid := (to_jsonb(old)->>'id'); else rid := (to_jsonb(new)->>'id'); end if;
  insert into public.audit_logs(user_id,table_name,record_id,action,old_data,new_data)
  values (auth.uid(), tg_table_name, rid, tg_op,
    case when tg_op<>'INSERT' then to_jsonb(old) end,
    case when tg_op<>'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_row();
create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function public.audit_row();
create trigger audit_customers after insert or update or delete on public.customers for each row execute function public.audit_row();
create trigger audit_settings after update on public.business_settings for each row execute function public.audit_row();
create trigger audit_roles after insert or update or delete on public.user_roles for each row execute function public.audit_row();

-- agents may not change restricted customer fields
create or replace function public.guard_customer_agent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager(auth.uid()) and not public.has_role(auth.uid(),'accountant') then
    if tg_op='INSERT' then
      new.assigned_agent := auth.uid(); new.credit_limit := 0;
    else
      new.assigned_agent := old.assigned_agent; new.credit_limit := old.credit_limit;
    end if;
  end if;
  return new;
end $$;
create trigger customers_guard before insert or update on public.customers
  for each row execute function public.guard_customer_agent();

-- grants
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, update on public.business_settings to authenticated;
grant select, insert, update on public.products to authenticated;
grant select, insert, update on public.product_costs to authenticated;
grant select on public.product_price_history to authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select on public.audit_logs to authenticated;
grant all on public.profiles, public.user_roles, public.business_settings, public.products, public.product_costs,
  public.product_price_history, public.suppliers, public.customers, public.audit_logs to service_role;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.business_settings enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.product_price_history enable row level security;
alter table public.suppliers enable row level security;
alter table public.customers enable row level security;
alter table public.audit_logs enable row level security;

create policy "own or manager read profile" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager(auth.uid()));
create policy "manager update profile" on public.profiles for update to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));
create policy "own or manager read roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_manager(auth.uid()));
create policy "active read settings" on public.business_settings for select to authenticated
  using (public.is_active_user(auth.uid()));
create policy "manager update settings" on public.business_settings for update to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));

create policy "active users read products" on public.products for select to authenticated
  using (public.has_any_role(auth.uid(), array['owner','admin','agent','storekeeper','accountant','distributor']::public.app_role[]));
create policy "manager insert products" on public.products for insert to authenticated with check (public.is_manager(auth.uid()));
create policy "manager update products" on public.products for update to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));

create policy "finance read costs" on public.product_costs for select to authenticated
  using (public.has_any_role(auth.uid(), array['owner','admin','accountant']::public.app_role[]));
create policy "manager insert costs" on public.product_costs for insert to authenticated with check (public.is_manager(auth.uid()));
create policy "manager update costs" on public.product_costs for update to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));
create policy "manager read price history" on public.product_price_history for select to authenticated
  using (public.has_any_role(auth.uid(), array['owner','admin','accountant']::public.app_role[]));

create policy "staff read suppliers" on public.suppliers for select to authenticated
  using (public.has_any_role(auth.uid(), array['owner','admin','storekeeper','accountant']::public.app_role[]));
create policy "manager insert suppliers" on public.suppliers for insert to authenticated with check (public.is_manager(auth.uid()));
create policy "manager update suppliers" on public.suppliers for update to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));

create policy "read customers" on public.customers for select to authenticated
  using (public.has_any_role(auth.uid(), array['owner','admin','accountant']::public.app_role[])
    or (assigned_agent = auth.uid() and public.has_any_role(auth.uid(), array['agent','distributor']::public.app_role[])));
create policy "insert customers" on public.customers for insert to authenticated
  with check (public.is_manager(auth.uid()) or public.has_any_role(auth.uid(), array['agent','distributor']::public.app_role[]));
create policy "update customers" on public.customers for update to authenticated
  using (public.is_manager(auth.uid()) or (assigned_agent = auth.uid() and public.has_any_role(auth.uid(), array['agent','distributor']::public.app_role[])))
  with check (public.is_manager(auth.uid()) or (assigned_agent = auth.uid()));

create policy "manager read audit" on public.audit_logs for select to authenticated
  using (public.is_manager(auth.uid()));

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_manager(uuid) from public, anon;
revoke execute on function public.is_active_user(uuid) from public, anon;
revoke execute on function public.has_any_role(uuid, public.app_role[]) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_manager(uuid) to authenticated;
grant execute on function public.is_active_user(uuid) to authenticated;
grant execute on function public.has_any_role(uuid, public.app_role[]) to authenticated;
