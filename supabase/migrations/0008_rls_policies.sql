-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.companies           enable row level security;
alter table public.memberships         enable row level security;
alter table public.company_ai_settings enable row level security;
alter table public.rates               enable row level security;
alter table public.customers           enable row level security;
alter table public.quotes              enable row level security;
alter table public.quote_lines         enable row level security;
alter table public.audit_log           enable row level security;

-- Belt and braces: no client role touches the key table, even by accident.
revoke all on public.company_ai_settings from anon, authenticated;

create policy companies_select on public.companies
  for select to authenticated using (public.is_member(id));

create policy memberships_select on public.memberships
  for select to authenticated using (user_id = auth.uid());

-- Rates and customers are read-only from the app; they arrive via the import scripts.
create policy rates_select on public.rates
  for select to authenticated using (public.is_member(company_id));

create policy customers_select on public.customers
  for select to authenticated using (public.is_member(company_id));

create policy quotes_select on public.quotes
  for select to authenticated using (public.is_member(company_id));
create policy quotes_insert on public.quotes
  for insert to authenticated with check (public.is_member(company_id) and created_by = auth.uid());
create policy quotes_update on public.quotes
  for update to authenticated using (public.is_member(company_id)) with check (public.is_member(company_id));

create policy quote_lines_select on public.quote_lines
  for select to authenticated using (public.is_member(company_id));
create policy quote_lines_insert on public.quote_lines
  for insert to authenticated with check (public.is_member(company_id));
create policy quote_lines_update on public.quote_lines
  for update to authenticated using (public.is_member(company_id)) with check (public.is_member(company_id));
create policy quote_lines_delete on public.quote_lines
  for delete to authenticated using (public.is_member(company_id));

create policy audit_select on public.audit_log
  for select to authenticated using (public.is_member(company_id));
create policy audit_insert on public.audit_log
  for insert to authenticated with check (public.is_member(company_id) and user_id = auth.uid());

-- Nothing deletes quotes or rewrites history from the client.
revoke delete on public.quotes from anon, authenticated;
revoke update, delete on public.audit_log from anon, authenticated;
revoke all on all tables in schema public from anon;
