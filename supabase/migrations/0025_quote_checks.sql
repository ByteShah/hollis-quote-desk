-- Reviewers tick off "check before approving" notes one by one. The ticked
-- notes are stored with the quote (by their text), so the list remembers
-- what's been looked at. Approved quotes stay frozen by quotes_guard.

alter table public.quotes
  add column checked_flags text[] not null default '{}' check (cardinality(checked_flags) <= 100);
