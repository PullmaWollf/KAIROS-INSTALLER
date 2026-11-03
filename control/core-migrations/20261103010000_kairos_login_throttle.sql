-- Rate limit per installation, backed by Postgres, not ephemeral serverless memory.
-- Stores only a keyed SHA256 hash, never IP, login, passwords or tokens.
create table if not exists public.kairos_login_attempts(
 key_hash text primary key check(key_hash ~ '^[a-f0-9]{64}$'),
 failures integer not null default 0,
 window_started timestamptz not null default now(),
 blocked_until timestamptz
);
create index if not exists kairos_login_attempts_blocked_idx on public.kairos_login_attempts(blocked_until);
alter table public.kairos_login_attempts enable row level security;
revoke all on public.kairos_login_attempts from anon,authenticated,public;
grant select,insert,update,delete on public.kairos_login_attempts to service_role;

create or replace function public.kairos_login_guard(p_key text,p_action text)
returns boolean language plpgsql security definer
set search_path = ''
as $$
declare v_now timestamptz := now();
declare v_blocked timestamptz;
begin
 if p_key !~ '^[a-f0-9]{64}$' or p_action not in ('check','failure','success') then
  raise exception 'invalid login throttle request';
 end if;
 if p_action = 'check' then
  select blocked_until into v_blocked from public.kairos_login_attempts where key_hash=p_key;
  return v_blocked is null or v_blocked <= v_now;
 end if;
 if p_action = 'success' then
  delete from public.kairos_login_attempts where key_hash=p_key;
  return true;
 end if;
 insert into public.kairos_login_attempts as a(key_hash,failures,window_started,blocked_until)
 values(p_key,1,v_now,null)
 on conflict(key_hash) do update set
  failures = case when a.window_started < v_now - interval '15 minutes' then 1 else least(a.failures+1,1000) end,
  window_started = case when a.window_started < v_now - interval '15 minutes' then v_now else a.window_started end,
  blocked_until = case
    when a.window_started < v_now - interval '15 minutes' then null
    when a.failures+1 >= 8 then v_now + interval '15 minutes'
    else a.blocked_until end;
 select blocked_until into v_blocked from public.kairos_login_attempts where key_hash=p_key;
 return v_blocked is null or v_blocked <= v_now;
end;
$$;
revoke all on function public.kairos_login_guard(text,text) from public,anon,authenticated;
grant execute on function public.kairos_login_guard(text,text) to service_role;

-- Remove stale non-blocked entries manually through maintenance; no account data is stored.
