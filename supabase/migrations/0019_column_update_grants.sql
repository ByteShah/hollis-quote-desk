-- Security review: limit client UPDATEs to the columns the app actually edits,
-- so an owner can't, say, move a membership to another user or rewrite an
-- invitation's token. RLS still decides which rows; this decides which columns.

revoke update on public.memberships from authenticated;
grant update (role, active) on public.memberships to authenticated;

revoke update on public.invitations from authenticated;
grant update (revoked_at) on public.invitations to authenticated;

revoke update on public.companies from authenticated;
grant update (name, min_charge, vat_rate, auto_quote_max_m2, price_review_months, quoting_rules) on public.companies to authenticated;

-- Defence in depth for memberships: identity columns never change.
create or replace function public.memberships_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id or new.company_id <> old.company_id then
    raise exception 'Membership identity can''t be changed.';
  end if;
  return new;
end;
$$;

create trigger memberships_identity_immutable before update on public.memberships
for each row execute function public.memberships_identity_immutable();
