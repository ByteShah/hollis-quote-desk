-- Prices become dated versions. A price is never overwritten: each change is a
-- new row with the date it takes effect, who made it and why. The current
-- price is the latest version in effect today (see rates_current).

alter table public.rates drop constraint if exists rates_status_check;
update public.rates set status = 'archived' where status = 'superseded';
alter table public.rates
  add constraint rates_status_check check (status in ('active', 'price_on_request', 'not_offered', 'archived')),
  add column category         text,
  add column archived_at      timestamptz,
  add column last_reviewed_at timestamptz,
  add column version          int not null default 1,
  add column created_by       uuid references auth.users(id),
  add column updated_at       timestamptz not null default now(),
  add constraint rates_id_company_unique unique (id, company_id),
  add constraint rates_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  add constraint rates_item_length check (length(item) between 1 and 200),
  add constraint rates_unit_check check (unit in ('m2', 'm', 'm3', 'each', 'job', 'day', 'load', 'tonne'));

update public.rates set archived_at = now() where status = 'archived';

create table public.rate_prices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  rate_id         uuid not null,
  price_ex_vat    numeric(10,2) not null check (price_ex_vat >= 0 and price_ex_vat < 1000000),
  effective_from  date not null default current_date,
  reason          text not null check (length(reason) between 1 and 300),
  source          text not null check (source in ('seed', 'manual', 'import')),
  import_batch_id uuid,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  foreign key (rate_id, company_id) references public.rates(id, company_id) on delete cascade
);
create index rate_prices_lookup on public.rate_prices (rate_id, effective_from desc, created_at desc);
create index rate_prices_batch on public.rate_prices (import_batch_id) where import_batch_id is not null;

-- Carry today's prices across as the first version of each item.
insert into public.rate_prices (company_id, rate_id, price_ex_vat, effective_from, reason, source)
select company_id, id, rate_ex_vat, current_date, 'Imported from the original price list', 'seed'
from public.rates where rate_ex_vat is not null;

update public.rates set last_reviewed_at = now() where status = 'active';
alter table public.rates drop column rate_ex_vat;

-- Every edit bumps the version, so two people can't silently overwrite each other.
create or replace function public.bump_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger rates_bump_version before update on public.rates
for each row execute function public.bump_version();

-- Codes can't change once created: quotes refer to them.
create or replace function public.rates_code_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.code <> old.code then
    raise exception 'An item code can''t be changed once created.' using errcode = 'P0001';
  end if;
  if new.company_id <> old.company_id then
    raise exception 'company_id is immutable';
  end if;
  return new;
end;
$$;

create trigger rates_code_immutable before update on public.rates
for each row execute function public.rates_code_immutable();

-- One row per item with the price in effect today and any scheduled change.
-- security_invoker: the caller's RLS applies, exactly as if they read rates.
create view public.rates_current with (security_invoker = true) as
select
  r.id, r.company_id, r.code, r.item, r.category, r.unit, r.unit_raw, r.status, r.notes,
  r.modifiers, r.import_notes, r.archived_at, r.last_reviewed_at, r.version, r.updated_at, r.created_at,
  cur.price_ex_vat    as rate_ex_vat,
  cur.effective_from  as price_since,
  nxt.price_ex_vat    as next_price,
  nxt.effective_from  as next_price_from
from public.rates r
left join lateral (
  select p.price_ex_vat, p.effective_from from public.rate_prices p
  where p.rate_id = r.id and p.effective_from <= current_date
  order by p.effective_from desc, p.created_at desc limit 1
) cur on true
left join lateral (
  select p.price_ex_vat, p.effective_from from public.rate_prices p
  where p.rate_id = r.id and p.effective_from > current_date
  order by p.effective_from asc, p.created_at desc limit 1
) nxt on true;

grant select on public.rates_current to authenticated;
revoke all on public.rates_current from anon;

alter table public.rate_prices enable row level security;

create policy rate_prices_select on public.rate_prices
  for select to authenticated using (public.is_member(company_id));
-- Append-only: owners and managers add versions; nobody edits or deletes them.
create policy rate_prices_insert on public.rate_prices
  for insert to authenticated
  with check (public.has_role(company_id, array['owner', 'manager']) and created_by = auth.uid() and source = 'manual');
revoke update, delete on public.rate_prices from anon, authenticated;

create policy rates_insert on public.rates
  for insert to authenticated
  with check (public.has_role(company_id, array['owner', 'manager']) and created_by = auth.uid());
create policy rates_update on public.rates
  for update to authenticated
  using (public.has_role(company_id, array['owner', 'manager']))
  with check (public.has_role(company_id, array['owner', 'manager']));
revoke delete on public.rates from anon, authenticated;
