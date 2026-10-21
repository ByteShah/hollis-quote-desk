-- Hollis quoting tool: initial schema.
-- Tenancy model: every tenant-owned row carries company_id, and RLS restricts
-- access to companies the signed-in user is a member of. Composite foreign keys
-- (id, company_id) stop a row in one company pointing at a row in another.

create extension if not exists pgcrypto;
