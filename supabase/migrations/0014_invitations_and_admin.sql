-- Invitations: one-time links to join a company with a given role. Only a
-- SHA-256 hash of the token is stored; the link is shown once to whoever
-- created it. Accepting happens server-side (the invitee isn't a member yet).

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  role        text not null check (role in ('owner', 'manager', 'estimator')),
  token_hash  text not null unique,
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at  timestamptz,
  created_by  uuid references auth.users(id),
  created_by_email text,
  created_at  timestamptz not null default now()
);
create index invitations_company on public.invitations (company_id, created_at desc);

alter table public.invitations enable row level security;
-- Owners see and revoke their company's invitations. Creation and acceptance
-- go through the server so the token never touches the database in clear.
create policy invitations_select on public.invitations
  for select to authenticated using (public.has_role(company_id, array['owner']));
create policy invitations_update on public.invitations
  for update to authenticated
  using (public.has_role(company_id, array['owner']))
  with check (public.has_role(company_id, array['owner']));
revoke insert, delete on public.invitations from anon, authenticated;
-- token_hash is never needed by a client.
revoke select (token_hash) on public.invitations from authenticated;

create or replace function public.audit_invitation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write(new.company_id, 'member.invited', 'member', new.id,
      jsonb_build_object('email', new.email, 'role', new.role));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform public.audit_write(new.company_id, 'member.invite_revoked', 'member', new.id,
      jsonb_build_object('email', new.email));
  end if;
  return new;
end;
$$;

create trigger invitations_audit after insert or update on public.invitations
for each row execute function public.audit_invitation();

-- ---------------------------------------------------------------------------
-- Platform admin overview: company metadata and counts only. No quotes,
-- prices or customer details are ever returned.
-- ---------------------------------------------------------------------------
create or replace function public.admin_company_overview()
returns table (
  id uuid, name text, slug text, created_at timestamptz,
  members int, owners int, pending_invites int,
  has_ai_key boolean, rates int, customers int, quotes int, last_quote_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return query
  select c.id, c.name, c.slug, c.created_at,
    (select count(*)::int from memberships m where m.company_id = c.id and m.active),
    (select count(*)::int from memberships m where m.company_id = c.id and m.active and m.role = 'owner'),
    (select count(*)::int from invitations i where i.company_id = c.id and i.accepted_at is null
       and i.revoked_at is null and i.expires_at > now()),
    exists (select 1 from company_ai_settings s where s.company_id = c.id),
    (select count(*)::int from rates r where r.company_id = c.id and r.status <> 'archived'),
    (select count(*)::int from customers cu where cu.company_id = c.id and cu.archived_at is null),
    (select count(*)::int from quotes q where q.company_id = c.id),
    (select max(q.created_at) from quotes q where q.company_id = c.id)
  from companies c
  order by c.created_at desc;
end;
$$;

revoke execute on function public.admin_company_overview() from public, anon;
grant execute on function public.admin_company_overview() to authenticated;

-- Setup progress for a company's own checklist (members only).
create or replace function public.company_setup_status(cid uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_member(cid) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'rules', (select length(trim(quoting_rules)) > 0 from companies where id = cid),
    'ai_key', exists (select 1 from company_ai_settings where company_id = cid),
    'rates', (select count(*) from rates where company_id = cid and status = 'active'),
    'customers', (select count(*) from customers where company_id = cid and archived_at is null),
    'team', (select count(*) from memberships where company_id = cid and active),
    'quotes', (select count(*) from quotes where company_id = cid)
  );
end;
$$;

revoke execute on function public.company_setup_status(uuid) from public, anon;
grant execute on function public.company_setup_status(uuid) to authenticated;
