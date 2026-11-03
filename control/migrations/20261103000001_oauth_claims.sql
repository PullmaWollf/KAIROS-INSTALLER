-- One-time OAuth callback claim. Apply ONLY to the Installer control database.
create table if not exists public.kairos_control_oauth_claims (
 cookie_hash text primary key check (cookie_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.kairos_control_oauth_claims enable row level security;
revoke all on public.kairos_control_oauth_claims from public, anon, authenticated;
grant select,insert,delete on public.kairos_control_oauth_claims to service_role;
create index if not exists kairos_control_oauth_claims_exp_idx on public.kairos_control_oauth_claims(expires_at);

create or replace function public.kairos_control_claim_oauth(p_cookie_hash text)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if p_cookie_hash is null or p_cookie_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 insert into public.kairos_control_oauth_claims(cookie_hash,expires_at)
 values (p_cookie_hash,now()+interval '11 minutes')
 on conflict (cookie_hash) do nothing;
 return found;
end; $$;
revoke all on function public.kairos_control_claim_oauth(text) from public,anon,authenticated;
grant execute on function public.kairos_control_claim_oauth(text) to service_role;
-- Expired claims may be deleted by a scheduled maintenance task, not during callback.
