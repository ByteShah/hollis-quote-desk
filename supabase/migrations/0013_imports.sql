-- CSV imports. The app computes and shows a preview; on confirm it calls one
-- of these functions, which applies everything in a single transaction and
-- records a batch that can be undone. The functions run as definer, so every
-- statement is explicitly scoped to the company and gated on the caller's role.

create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null check (kind in ('rates', 'customers')),
  filename    text not null check (length(filename) between 1 and 200),
  status      text not null default 'applied' check (status in ('applied', 'reverted')),
  summary     jsonb not null default '{}'::jsonb,
  rows        jsonb not null default '[]'::jsonb,
  created_by  uuid references auth.users(id),
  created_by_email text,
  created_at  timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid references auth.users(id),
  revert_summary jsonb
);
create index import_batches_company on public.import_batches (company_id, created_at desc);

alter table public.import_batches enable row level security;
create policy import_batches_select on public.import_batches
  for select to authenticated using (public.has_role(company_id, array['owner', 'manager']));
revoke insert, update, delete on public.import_batches from anon, authenticated;

alter table public.rate_prices
  add constraint rate_prices_batch_fk foreign key (import_batch_id) references public.import_batches(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Rates
-- items: [{action: create|update, code, item, unit, unit_raw, category, status,
--          notes, import_notes, price, effective_from}]
-- ---------------------------------------------------------------------------
create or replace function public.apply_rates_import(cid uuid, file_name text, items jsonb, totals jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  batch uuid;
  it jsonb;
  r public.rates;
  before jsonb;
  out_rows jsonb := '[]'::jsonb;
  price_id uuid;
  cur_price numeric;
begin
  if not public.has_role(cid, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can import a price list.' using errcode = '42501';
  end if;
  if jsonb_array_length(items) > 5000 then
    raise exception 'Too many rows.';
  end if;

  insert into public.import_batches (company_id, kind, filename, summary, created_by, created_by_email)
  values (cid, 'rates', file_name, coalesce(totals, '{}'::jsonb), auth.uid(), auth.jwt() ->> 'email')
  returning id into batch;

  for it in select * from jsonb_array_elements(items) loop
    price_id := null;
    if it ->> 'action' = 'create' then
      insert into public.rates (company_id, code, item, unit, unit_raw, category, status, notes, import_notes,
                                created_by, last_reviewed_at, archived_at)
      values (cid, it ->> 'code', it ->> 'item', it ->> 'unit', it ->> 'unit_raw', it ->> 'category',
              it ->> 'status', it ->> 'notes', it ->> 'import_notes', auth.uid(), now(),
              case when it ->> 'status' = 'archived' then now() end)
      returning * into r;
      before := null;
    elsif it ->> 'action' = 'update' then
      select * into r from public.rates where company_id = cid and code = it ->> 'code' for update;
      if not found then
        raise exception 'Item % no longer exists; preview again.', it ->> 'code';
      end if;
      before := jsonb_build_object('item', r.item, 'unit', r.unit, 'category', r.category, 'status', r.status,
                                   'notes', r.notes, 'archived_at', r.archived_at, 'last_reviewed_at', r.last_reviewed_at);
      update public.rates set
        item = coalesce(it ->> 'item', item),
        unit = coalesce(it ->> 'unit', unit),
        category = coalesce(it ->> 'category', category),
        status = coalesce(it ->> 'status', status),
        notes = coalesce(it ->> 'notes', notes),
        archived_at = case when coalesce(it ->> 'status', status) = 'archived' then coalesce(archived_at, now()) else null end,
        last_reviewed_at = now()
      where id = r.id
      returning * into r;
    else
      continue;
    end if;

    if it ? 'price' and jsonb_typeof(it -> 'price') = 'number' then
      select rc.rate_ex_vat into cur_price from public.rates_current rc where rc.id = r.id;
      if cur_price is distinct from (it ->> 'price')::numeric or (it ->> 'effective_from')::date > current_date then
        insert into public.rate_prices (company_id, rate_id, price_ex_vat, effective_from, reason, source, import_batch_id, created_by)
        values (cid, r.id, (it ->> 'price')::numeric, coalesce((it ->> 'effective_from')::date, current_date),
                'Imported from ' || file_name, 'import', batch, auth.uid())
        returning id into price_id;
      end if;
    end if;

    out_rows := out_rows || jsonb_build_object(
      'code', r.code, 'action', it ->> 'action', 'record_id', r.id, 'version_after', r.version,
      'before', before, 'price_version_id', price_id);
  end loop;

  update public.import_batches set rows = out_rows where id = batch;
  return batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customers
-- items: [{action: create|update, id?, values: {name, company_name, emails[], phones[],
--          address, postcode, notes, invoice_email, payment_terms, tags[]}}]
-- ---------------------------------------------------------------------------
create or replace function public.apply_customers_import(cid uuid, file_name text, items jsonb, totals jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  batch uuid;
  it jsonb;
  v jsonb;
  c public.customers;
  before jsonb;
  out_rows jsonb := '[]'::jsonb;
begin
  if not public.has_role(cid, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can import customers.' using errcode = '42501';
  end if;
  if jsonb_array_length(items) > 5000 then
    raise exception 'Too many rows.';
  end if;

  insert into public.import_batches (company_id, kind, filename, summary, created_by, created_by_email)
  values (cid, 'customers', file_name, coalesce(totals, '{}'::jsonb), auth.uid(), auth.jwt() ->> 'email')
  returning id into batch;

  for it in select * from jsonb_array_elements(items) loop
    v := it -> 'values';
    if it ->> 'action' = 'create' then
      insert into public.customers (company_id, name, company_name, emails, phones, address, postcode, notes,
                                    invoice_email, payment_terms, tags, source, created_by)
      values (cid, v ->> 'name', v ->> 'company_name',
              array(select jsonb_array_elements_text(coalesce(v -> 'emails', '[]'))),
              array(select jsonb_array_elements_text(coalesce(v -> 'phones', '[]'))),
              v ->> 'address', v ->> 'postcode', v ->> 'notes', v ->> 'invoice_email', v ->> 'payment_terms',
              array(select jsonb_array_elements_text(coalesce(v -> 'tags', '[]'))), 'import', auth.uid())
      returning * into c;
      before := null;
    elsif it ->> 'action' = 'update' then
      select * into c from public.customers where company_id = cid and id = (it ->> 'id')::uuid for update;
      if not found then
        raise exception 'A customer in this file no longer exists; preview again.';
      end if;
      before := jsonb_build_object('name', c.name, 'company_name', c.company_name, 'emails', c.emails, 'phones', c.phones,
                                   'address', c.address, 'postcode', c.postcode, 'notes', c.notes,
                                   'invoice_email', c.invoice_email, 'payment_terms', c.payment_terms, 'tags', c.tags);
      update public.customers set
        name = coalesce(v ->> 'name', name),
        company_name = coalesce(v ->> 'company_name', company_name),
        emails = case when jsonb_typeof(v -> 'emails') = 'array' then array(select jsonb_array_elements_text(v -> 'emails')) else emails end,
        phones = case when jsonb_typeof(v -> 'phones') = 'array' then array(select jsonb_array_elements_text(v -> 'phones')) else phones end,
        address = coalesce(v ->> 'address', address),
        postcode = coalesce(v ->> 'postcode', postcode),
        notes = coalesce(v ->> 'notes', notes),
        invoice_email = coalesce(v ->> 'invoice_email', invoice_email),
        payment_terms = coalesce(v ->> 'payment_terms', payment_terms),
        tags = case when jsonb_typeof(v -> 'tags') = 'array' then array(select jsonb_array_elements_text(v -> 'tags')) else tags end
      where id = c.id
      returning * into c;
    else
      continue;
    end if;
    out_rows := out_rows || jsonb_build_object('name', c.name, 'action', it ->> 'action', 'record_id', c.id,
                                               'version_after', c.version, 'before', before);
  end loop;

  update public.import_batches set rows = out_rows where id = batch;
  return batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo. Records edited since the import are left alone and reported.
-- ---------------------------------------------------------------------------
create or replace function public.revert_import(batch_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  b public.import_batches;
  row jsonb;
  rid uuid;
  cur_version int;
  restored int := 0;
  removed int := 0;
  archived int := 0;
  skipped jsonb := '[]'::jsonb;
  used boolean;
  label text;
  result jsonb;
begin
  select * into b from public.import_batches where id = batch_id for update;
  if not found or not public.has_role(b.company_id, array['owner', 'manager']) then
    raise exception 'Import not found.' using errcode = '42501';
  end if;
  if b.status <> 'applied' then
    raise exception 'This import has already been undone.';
  end if;

  for row in select * from jsonb_array_elements(b.rows) loop
    rid := (row ->> 'record_id')::uuid;
    label := coalesce(row ->> 'code', row ->> 'name');

    if b.kind = 'rates' then
      select version into cur_version from public.rates where id = rid and company_id = b.company_id;
      if cur_version is null then continue; end if;
      if cur_version <> (row ->> 'version_after')::int then
        skipped := skipped || jsonb_build_object('label', label, 'reason', 'edited since the import');
        continue;
      end if;
      delete from public.rate_prices where import_batch_id = b.id and rate_id = rid and company_id = b.company_id;
      if row ->> 'action' = 'create' then
        select exists (select 1 from public.quote_lines ql join public.rates r on r.code = ql.rate_code
                       where r.id = rid and ql.company_id = b.company_id) into used;
        if used then
          update public.rates set status = 'archived', archived_at = now() where id = rid;
          archived := archived + 1;
        else
          delete from public.rates where id = rid;
          removed := removed + 1;
        end if;
      else
        update public.rates set
          item = row -> 'before' ->> 'item', unit = row -> 'before' ->> 'unit',
          category = row -> 'before' ->> 'category', status = row -> 'before' ->> 'status',
          notes = row -> 'before' ->> 'notes',
          archived_at = (row -> 'before' ->> 'archived_at')::timestamptz,
          last_reviewed_at = (row -> 'before' ->> 'last_reviewed_at')::timestamptz
        where id = rid;
        restored := restored + 1;
      end if;

    else
      select version into cur_version from public.customers where id = rid and company_id = b.company_id;
      if cur_version is null then continue; end if;
      if cur_version <> (row ->> 'version_after')::int then
        skipped := skipped || jsonb_build_object('label', label, 'reason', 'edited since the import');
        continue;
      end if;
      if row ->> 'action' = 'create' then
        select exists (select 1 from public.quotes where customer_id = rid) into used;
        if used then
          update public.customers set archived_at = now() where id = rid;
          archived := archived + 1;
        else
          delete from public.customers where id = rid;
          removed := removed + 1;
        end if;
      else
        update public.customers set
          name = row -> 'before' ->> 'name', company_name = row -> 'before' ->> 'company_name',
          emails = array(select jsonb_array_elements_text(row -> 'before' -> 'emails')),
          phones = array(select jsonb_array_elements_text(row -> 'before' -> 'phones')),
          address = row -> 'before' ->> 'address', postcode = row -> 'before' ->> 'postcode',
          notes = row -> 'before' ->> 'notes', invoice_email = row -> 'before' ->> 'invoice_email',
          payment_terms = row -> 'before' ->> 'payment_terms',
          tags = array(select jsonb_array_elements_text(row -> 'before' -> 'tags'))
        where id = rid;
        restored := restored + 1;
      end if;
    end if;
  end loop;

  result := jsonb_build_object('restored', restored, 'removed', removed, 'archived', archived, 'skipped', skipped);
  update public.import_batches
  set status = 'reverted', reverted_at = now(), reverted_by = auth.uid(), revert_summary = result
  where id = b.id;
  perform public.audit_write(b.company_id, 'import.reverted', 'import', b.id, result);
  return result;
end;
$$;

revoke execute on function public.apply_rates_import(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.apply_customers_import(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.revert_import(uuid) from public, anon;
grant execute on function public.apply_rates_import(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.apply_customers_import(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.revert_import(uuid) to authenticated;
