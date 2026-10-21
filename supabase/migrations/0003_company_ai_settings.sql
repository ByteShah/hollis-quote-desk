-- ---------------------------------------------------------------------------
-- Per-company AI settings (bring your own key)
-- The key is AES-256-GCM encrypted by the app server before it gets here.
-- No client role can read this table at all; the server reads it with the
-- service role only after checking membership.
-- ---------------------------------------------------------------------------

create table public.company_ai_settings (
  company_id     uuid primary key references public.companies(id) on delete cascade,
  provider       text not null check (provider in ('openai', 'anthropic')),
  model          text not null,
  key_ciphertext text not null,   -- base64(iv || tag || ciphertext)
  key_last4      text not null,
  updated_by     uuid references auth.users(id),
  updated_at     timestamptz not null default now()
);

-- Members can see which provider is configured and the last 4 chars, never the key.
create or replace function public.get_ai_settings_public(cid uuid)
returns table (provider text, model text, key_last4 text, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select s.provider, s.model, s.key_last4, s.updated_at
  from public.company_ai_settings s
  where s.company_id = cid and public.is_member(cid);
$$;
