-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  name           text not null,
  company_name   text,
  emails         text[] not null default '{}',
  phones         text[] not null default '{}',
  address        text,
  postcode       text,
  notes          text,
  invoice_email  text,
  payment_terms  text,
  merged_from    jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  unique (id, company_id)
);
