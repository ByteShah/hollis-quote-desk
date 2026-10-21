-- ---------------------------------------------------------------------------
-- Rates
-- ---------------------------------------------------------------------------

create table public.rates (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  code         text not null,
  item         text not null,
  unit         text not null,             -- canonical: m2, m, m3, each, job, day, load, tonne
  unit_raw     text,
  rate_ex_vat  numeric(10,2),             -- null when there is no usable price
  status       text not null check (status in ('active', 'superseded', 'price_on_request', 'not_offered')),
  notes        text,
  modifiers    jsonb not null default '[]'::jsonb,
  import_notes text,
  source_row   jsonb,
  created_at   timestamptz not null default now(),
  unique (company_id, code)
);
