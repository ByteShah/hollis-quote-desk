-- Price versions are only ever removed by undoing an import. Log that on the
-- item, so its history shows the price coming and going.

create or replace function public.audit_rate_price_removed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.audit_write(old.company_id, 'rate.price_removed', 'rate', old.rate_id,
    jsonb_build_object('price', old.price_ex_vat, 'effective_from', old.effective_from,
                       'reason', 'Import undone', 'import_batch_id', old.import_batch_id));
  return old;
end;
$$;

create trigger rate_prices_audit_delete after delete on public.rate_prices
for each row execute function public.audit_rate_price_removed();
