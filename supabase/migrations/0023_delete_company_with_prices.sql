-- Deleting a company cascades to its price versions, and the "price removed"
-- history trigger then tried to log against a company that no longer exists,
-- so any company with a price list couldn't be deleted. Skip the log when the
-- whole company is going (its history goes with it), as 0018 does for owners.

create or replace function public.audit_rate_price_removed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.companies where id = old.company_id) then
    return old; -- the whole company is being deleted
  end if;
  perform public.audit_write(old.company_id, 'rate.price_removed', 'rate', old.rate_id,
    jsonb_build_object('price', old.price_ex_vat, 'effective_from', old.effective_from,
                       'reason', 'Import undone', 'import_batch_id', old.import_batch_id));
  return old;
end;
$$;
