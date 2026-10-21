-- Roles inside a company (owner / manager / estimator), deactivation, and
-- platform admins who can create companies but never read inside them.

alter table public.memberships drop constraint if exists memberships_role_check;
update public.memberships set role = 'estimator' where role = 'staff';
alter table public.memberships
  add constraint memberships_role_check check (role in ('owner', 'manager', 'estimator')),
  add column active     boolean not null default true,
  add column email      text,
  add column invited_by uuid references auth.users(id),
  add column updated_at timestamptz not null default now();

update public.memberships m set email = u.email from auth.users u where u.id = m.user_id;

-- Membership checks now ignore deactivated people.
create or replace function public.is_member(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where company_id = cid and user_id = auth.uid() and active
  );
$$;

create or replace function public.member_role(cid uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.memberships
  where company_id = cid and user_id = auth.uid() and active;
$$;

create or replace function public.has_role(cid uuid, roles text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where company_id = cid and user_id = auth.uid() and active and role = any(roles)
  );
$$;

-- Every company keeps at least one active owner.
create or replace function public.memberships_keep_an_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  losing_owner boolean;
begin
  if tg_op = 'DELETE' then
    losing_owner := old.role = 'owner' and old.active;
  else
    losing_owner := old.role = 'owner' and old.active and (new.role <> 'owner' or not new.active);
  end if;
  if losing_owner and not exists (
       select 1 from public.memberships
       where company_id = old.company_id and role = 'owner' and active and user_id <> old.user_id
     ) then
    raise exception 'A company must keep at least one active owner.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;

create trigger memberships_keep_an_owner before update or delete on public.memberships
for each row execute function public.memberships_keep_an_owner();

-- Team members can see who else is in their company (names on history, approvals).
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated using (user_id = auth.uid() or public.is_member(company_id));

-- Owners manage roles and deactivation; inserts happen server-side via invitations.
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.has_role(company_id, array['owner']))
  with check (public.has_role(company_id, array['owner']));

-- Owners edit their own company's settings.
create policy companies_update on public.companies
  for update to authenticated
  using (public.has_role(id, array['owner']))
  with check (public.has_role(id, array['owner']));

alter table public.companies
  add column price_review_months int not null default 6 check (price_review_months between 1 and 36),
  add column updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Platform admins
-- ---------------------------------------------------------------------------

create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Approving and rejecting is for owners and managers only.
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
  if new.status <> old.status and new.status in ('approved', 'rejected')
     and not public.has_role(new.company_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can approve or reject quotes.' using errcode = 'P0001';
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
