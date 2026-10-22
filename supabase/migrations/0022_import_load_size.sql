-- Answers given during an import ("one load holds 6 m³") are saved on the
-- new items, so imports now also set load_size.

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
                                modifiers, included_in, site_visit_reason, load_size, created_by, last_reviewed_at, archived_at)
      values (cid, it ->> 'code', it ->> 'item', it ->> 'unit', it ->> 'unit_raw', it ->> 'category',
              it ->> 'status', it ->> 'notes', it ->> 'import_notes',
              case when jsonb_typeof(it -> 'modifiers') = 'array' then it -> 'modifiers' else '[]'::jsonb end,
              case when jsonb_typeof(it -> 'included_in') = 'array'
                   then array(select jsonb_array_elements_text(it -> 'included_in')) else '{}' end,
              nullif(it ->> 'site_visit_reason', ''),
              case when jsonb_typeof(it -> 'load_size') = 'number' then (it ->> 'load_size')::numeric end,
              auth.uid(), now(),
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
      if cur_price is distinct from (it ->> 'price')::numeric or (it ->> 'effective_from')::date > public.business_date() then
        insert into public.rate_prices (company_id, rate_id, price_ex_vat, effective_from, reason, source, import_batch_id, created_by)
        values (cid, r.id, (it ->> 'price')::numeric, coalesce((it ->> 'effective_from')::date, public.business_date()),
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
