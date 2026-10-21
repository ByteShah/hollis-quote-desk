-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------

create table public.quotes (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  customer_id    uuid,
  enquiry_text   text not null check (length(enquiry_text) <= 20000),
  outcome        text not null check (outcome in ('quote', 'needs_site_visit', 'cannot_quote')),
  status         text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  summary        text,
  customer_match jsonb not null default '{}'::jsonb,
  assumptions    jsonb not null default '[]'::jsonb,
  questions      jsonb not null default '[]'::jsonb,
  exclusions     jsonb not null default '[]'::jsonb,
  flags          jsonb not null default '[]'::jsonb,
  subtotal       numeric(12,2) not null default 0,
  vat            numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  provider       text,
  model          text,
  ai_raw         jsonb,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  approved_by    uuid references auth.users(id),
  approved_by_email text,
  approved_at    timestamptz,
  unique (id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id)
);

create table public.quote_lines (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null,
  company_id    uuid not null,
  position      int not null default 0,
  rate_code     text,                     -- null for system lines (e.g. minimum charge top-up)
  description   text not null,
  qty           numeric(12,3) not null check (qty >= 0),
  unit          text not null,
  unit_rate     numeric(10,2) not null check (unit_rate >= 0),
  line_total    numeric(12,2) not null,
  source        text not null check (source in ('ai', 'human', 'system')),
  note          text,
  foreign key (quote_id, company_id) references public.quotes(id, company_id) on delete cascade
);

create index on public.quote_lines (quote_id);
create index on public.quotes (company_id, created_at desc);

-- Approval integrity: approved_by/approved_at are stamped by the database from
-- the session, approved quotes are frozen, and company_id can never change.
create or replace function public.quotes_guard()
returns trigger
language plpgsql
as $$
begin
  if new.company_id <> old.company_id then
    raise exception 'company_id is immutable';
  end if;
  if old.status = 'approved' then
    raise exception 'approved quotes are read-only';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    if auth.uid() is null then
      raise exception 'a signed-in person must approve a quote';
    end if;
    new.approved_by := auth.uid();
    new.approved_by_email := auth.jwt() ->> 'email';
    new.approved_at := now();
  elsif new.status <> 'approved' then
    new.approved_by := null;
    new.approved_by_email := null;
    new.approved_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger quotes_guard before update on public.quotes
for each row execute function public.quotes_guard();

-- Inserts can never arrive pre-approved (e.g. from the AI pipeline).
create or replace function public.quotes_insert_guard()
returns trigger
language plpgsql
as $$
begin
  new.status := 'draft';
  new.approved_by := null;
  new.approved_by_email := null;
  new.approved_at := null;
  return new;
end;
$$;

create trigger quotes_insert_guard before insert on public.quotes
for each row execute function public.quotes_insert_guard();

create or replace function public.quote_lines_guard()
returns trigger
language plpgsql
as $$
declare
  q_status text;
begin
  select status into q_status from public.quotes
  where id = coalesce(new.quote_id, old.quote_id);
  if q_status = 'approved' then
    raise exception 'approved quotes are read-only';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quote_lines_guard before insert or update or delete on public.quote_lines
for each row execute function public.quote_lines_guard();
