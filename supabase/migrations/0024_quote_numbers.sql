-- Quote numbers people can read out on the phone: Q-0001, Q-0002… counted per
-- company (Chase's first quote is its own Q-0001). Assigned by the database on
-- insert, never by the client, and can't be changed afterwards.

alter table public.quotes add column number int;

update public.quotes q set number = s.n
from (select id, row_number() over (partition by company_id order by created_at, id) as n from public.quotes) s
where s.id = q.id;

alter table public.quotes alter column number set not null;
alter table public.quotes add constraint quotes_company_number_key unique (company_id, number);

create or replace function public.quotes_assign_number()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Serialise numbering per company so two drafts at once can't share a number.
  perform pg_advisory_xact_lock(hashtextextended('quote-number:' || new.company_id::text, 0));
  select coalesce(max(number), 0) + 1 into new.number from public.quotes where company_id = new.company_id;
  return new;
end;
$$;

create trigger quotes_assign_number before insert on public.quotes
for each row execute function public.quotes_assign_number();

create or replace function public.quotes_number_immutable()
returns trigger
language plpgsql
as $$
begin
  new.number := old.number;
  return new;
end;
$$;

create trigger quotes_number_immutable before update on public.quotes
for each row execute function public.quotes_number_immutable();
