-- ---------------------------------------------------------------------------
-- Companies & membership
-- ---------------------------------------------------------------------------

create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  vat_rate    numeric(5,4) not null default 0.20,
  min_charge  numeric(10,2) not null default 0,
  -- Anything bigger than this is never auto-priced: it goes to a site visit.
  auto_quote_max_m2 numeric(10,2) not null default 150,
  -- Company-specific rules given to the AI (what they don't do, when to refuse).
  quoting_rules text not null default '',
  created_at  timestamptz not null default now()
);

create table public.memberships (
  user_id     uuid not null references auth.users(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null check (role in ('owner', 'staff')),
  created_at  timestamptz not null default now(),
  primary key (user_id, company_id)
);

-- SECURITY DEFINER so policies can consult memberships without recursing
-- through memberships' own RLS.
create or replace function public.is_member(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where company_id = cid and user_id = auth.uid()
  );
$$;

create or replace function public.member_role(cid uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.memberships
  where company_id = cid and user_id = auth.uid();
$$;
