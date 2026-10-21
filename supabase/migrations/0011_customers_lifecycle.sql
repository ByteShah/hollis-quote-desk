-- Customers become editable records: tags, archive instead of delete,
-- version numbers for safe concurrent edits, and one owner per email address.

alter table public.customers
  add column tags        text[] not null default '{}',
  add column archived_at timestamptz,
  add column version     int not null default 1,
  add column source      text not null default 'import' check (source in ('import', 'manual', 'quote')),
  add column created_by  uuid references auth.users(id),
  add column updated_at  timestamptz not null default now(),
  add column search_text text not null default '',
  add constraint customers_name_length check (length(name) between 1 and 200);

create index customers_emails_gin on public.customers using gin (emails);
create index customers_company_name on public.customers (company_id, name);

-- Normalise, keep the search column up to date, and refuse a second customer
-- with an email address another active customer in the same company already has.
create or replace function public.customers_normalise()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  clash text;
begin
  new.emails := array(select distinct lower(trim(e)) from unnest(new.emails) e where trim(e) <> '');
  new.phones := array(select distinct trim(p) from unnest(new.phones) p where trim(p) <> '');
  new.tags := array(select distinct lower(trim(t)) from unnest(new.tags) t where trim(t) <> '');
  new.invoice_email := nullif(lower(trim(coalesce(new.invoice_email, ''))), '');
  new.search_text := lower(concat_ws(' ', new.name, new.company_name, array_to_string(new.emails, ' '),
                                     array_to_string(new.phones, ' '), new.address, new.postcode));
  if new.archived_at is null then
    select c.name into clash from public.customers c
    where c.company_id = new.company_id and c.id <> new.id and c.archived_at is null
      and c.emails && new.emails
    limit 1;
    if clash is not null then
      raise exception 'Another customer (%) already uses that email address.', clash using errcode = 'P0002';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.company_id <> old.company_id then
      raise exception 'company_id is immutable';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger customers_normalise before insert or update on public.customers
for each row execute function public.customers_normalise();

-- Fill the search column for existing rows.
update public.customers set name = name;

-- Everyone in the company can add and edit customers; nobody deletes them.
create policy customers_insert on public.customers
  for insert to authenticated
  with check (public.is_member(company_id) and created_by = auth.uid());
create policy customers_update on public.customers
  for update to authenticated
  using (public.is_member(company_id))
  with check (public.is_member(company_id));
revoke delete on public.customers from anon, authenticated;
