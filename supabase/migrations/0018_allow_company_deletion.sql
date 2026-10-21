-- The last-owner rule protects a company that carries on. When the company
-- itself is deleted (offboarding), its memberships go with it.

create or replace function public.memberships_keep_an_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  losing_owner boolean;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.companies where id = old.company_id) then
      return old; -- the whole company is being deleted
    end if;
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
