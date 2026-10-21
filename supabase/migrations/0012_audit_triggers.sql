-- History is written by the database, not the app: every create, change,
-- archive and price version is logged with before/after values, so a code
-- path can't forget to log and a user can't write fake history.

alter table public.audit_log
  add column user_email text,
  add column note       text check (note is null or length(note) between 1 and 2000);

create index audit_log_entity on public.audit_log (entity, entity_id, at desc);

-- Users may only add notes; every other entry comes from triggers.
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert to authenticated
  with check (
    public.is_member(company_id) and user_id = auth.uid() and action = 'note'
    and entity in ('rate', 'customer', 'quote') and note is not null
  );

create or replace function public.audit_changes(o jsonb, n jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', o -> k, 'to', n -> k)), '{}'::jsonb)
  from jsonb_object_keys(n) k
  where k not in ('updated_at', 'version', 'search_text', 'ai_raw', 'customer_match')
    and (o -> k) is distinct from (n -> k);
$$;

create or replace function public.audit_write(cid uuid, act text, ent text, eid uuid, det jsonb)
returns void
language sql security definer set search_path = public
as $$
  insert into public.audit_log (company_id, user_id, user_email, action, entity, entity_id, detail)
  values (cid, auth.uid(), auth.jwt() ->> 'email', act, ent, eid, coalesce(det, '{}'::jsonb));
$$;

-- rates / customers: created, updated, archived, restored, reviewed.
create or replace function public.audit_record()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  ent text := tg_argv[0];
  changes jsonb;
  act text;
begin
  if tg_op = 'INSERT' then
    perform public.audit_write(new.company_id, ent || '.created', ent, new.id,
      jsonb_build_object('values', to_jsonb(new) - 'search_text' - 'source_row'));
    return new;
  end if;
  changes := public.audit_changes(to_jsonb(old), to_jsonb(new));
  if changes = '{}'::jsonb then
    return new;
  end if;
  act := case
    when old.archived_at is null and new.archived_at is not null then 'archived'
    when old.archived_at is not null and new.archived_at is null then 'restored'
    when changes ?& array['last_reviewed_at'] and (select count(*) from jsonb_object_keys(changes)) = 1 then 'reviewed'
    else 'updated'
  end;
  perform public.audit_write(new.company_id, ent || '.' || act, ent, new.id, jsonb_build_object('changes', changes));
  return new;
end;
$$;

create trigger rates_audit after insert or update on public.rates
for each row execute function public.audit_record('rate');
create trigger customers_audit after insert or update on public.customers
for each row execute function public.audit_record('customer');

-- Price versions are logged on the item they belong to.
create or replace function public.audit_rate_price()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.audit_write(new.company_id, 'rate.price_added', 'rate', new.rate_id,
    jsonb_build_object('price', new.price_ex_vat, 'effective_from', new.effective_from,
                       'reason', new.reason, 'source', new.source, 'import_batch_id', new.import_batch_id));
  return new;
end;
$$;

create trigger rate_prices_audit after insert on public.rate_prices
for each row execute function public.audit_rate_price();

-- Quotes: lifecycle events derived from the change itself.
create or replace function public.audit_quote()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write(new.company_id, 'quote.drafted', 'quote', new.id,
      jsonb_build_object('provider', new.provider, 'model', new.model, 'outcome', new.outcome, 'total', new.total));
    return new;
  end if;
  if new.status is distinct from old.status then
    perform public.audit_write(new.company_id, 'quote.' || new.status, 'quote', new.id,
      jsonb_build_object('from', old.status, 'total', new.total));
  end if;
  if new.customer_id is distinct from old.customer_id then
    perform public.audit_write(new.company_id, 'quote.customer_set', 'quote', new.id,
      jsonb_build_object('from', old.customer_id, 'to', new.customer_id));
  end if;
  if (new.subtotal, new.vat, new.total, new.outcome) is distinct from (old.subtotal, old.vat, old.total, old.outcome) then
    perform public.audit_write(new.company_id, 'quote.edited', 'quote', new.id,
      jsonb_build_object('total', jsonb_build_object('from', old.total, 'to', new.total), 'outcome', new.outcome));
  end if;
  return new;
end;
$$;

create trigger quotes_audit after insert or update on public.quotes
for each row execute function public.audit_quote();

-- Team changes.
create or replace function public.audit_membership()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write(new.company_id, 'member.added', 'member', new.user_id,
      jsonb_build_object('email', new.email, 'role', new.role));
  else
    perform public.audit_write(new.company_id, 'member.updated', 'member', new.user_id,
      jsonb_build_object('email', new.email, 'changes', public.audit_changes(to_jsonb(old), to_jsonb(new))));
  end if;
  return new;
end;
$$;

create trigger memberships_audit after insert or update on public.memberships
for each row execute function public.audit_membership();

-- Company settings.
create or replace function public.audit_company()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  changes jsonb := public.audit_changes(to_jsonb(old), to_jsonb(new));
begin
  if changes <> '{}'::jsonb then
    perform public.audit_write(new.id, 'company.updated', 'company', new.id, jsonb_build_object('changes', changes));
  end if;
  return new;
end;
$$;

create trigger companies_audit after update on public.companies
for each row execute function public.audit_company();
