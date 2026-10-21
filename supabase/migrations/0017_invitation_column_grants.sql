-- 0014 tried to hide invitations.token_hash with a column-level REVOKE, but a
-- table-level SELECT grant overrides that in Postgres. Replace the table grant
-- with an explicit column list that leaves the hash out.

revoke select on public.invitations from authenticated;
grant select (id, company_id, email, role, expires_at, accepted_at, accepted_by, revoked_at,
              created_by, created_by_email, created_at)
  on public.invitations to authenticated;
