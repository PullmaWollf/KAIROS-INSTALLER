-- KAIRÓS Installer: CONTROL PLANE ONLY. Never store members of a cell here.
-- Apply once to a dedicated Supabase project owned by the Installer operator.
create extension if not exists pgcrypto;

create table if not exists public.kairos_control_users (
 github_id bigint primary key check(github_id > 0),
 login text not null check(login ~ '^[a-zA-Z0-9-]{1,39}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.kairos_control_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 github_id bigint not null references public.kairos_control_users(github_id) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists kairos_control_sessions_exp_idx on public.kairos_control_sessions(expires_at);

create table if not exists public.kairos_control_connections (
 github_id bigint not null references public.kairos_control_users(github_id) on delete cascade,
 provider text not null check(provider in ('github','supabase','vercel')),
 envelope text not null check(length(envelope) between 40 and 16000),
 connected_at timestamptz not null default now(),
 primary key (github_id, provider)
);
create table if not exists public.kairos_control_installations (
 id uuid primary key default gen_random_uuid(),
 github_id bigint not null references public.kairos_control_users(github_id) on delete cascade,
 owner text not null check(owner ~ '^[a-zA-Z0-9-]{1,39}$' and lower(owner) <> 'pullmawollf'),
 repository text not null check(repository ~ '^[a-zA-Z0-9._-]{1,100}$'),
 cell_name text not null check(length(cell_name) between 3 and 70),
 supabase_org_id text not null check(length(supabase_org_id) between 4 and 64),
 vercel_team_id text not null check(length(vercel_team_id) between 4 and 64),
 region text not null,
 admin_login text not null check(admin_login ~ '^[a-z0-9._-]{3,40}$'),
 phase_index smallint not null default 0 check(phase_index between 0 and 8),
 supabase_ref text,
 vercel_project_id text,
 pwa_origin text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(github_id, owner, repository)
);
create index if not exists kairos_control_installs_user_idx on public.kairos_control_installations(github_id, created_at desc);

-- Server-side encrypted values; never selected by browser-facing endpoints.
create table if not exists public.kairos_control_install_secrets (
 installation_id uuid primary key references public.kairos_control_installations(id) on delete cascade,
 envelope text not null check(length(envelope) between 40 and 24000),
 admin_password_claimed_at timestamptz,
 updated_at timestamptz not null default now()
);

create table if not exists public.kairos_control_operations (
 id uuid primary key default gen_random_uuid(),
 installation_id uuid not null references public.kairos_control_installations(id) on delete cascade,
 phase text not null check(phase in ('github','supabase','migrate','vercel','env','bootstrap','deploy','smoke')),
 status text not null check(status in ('started','confirmed','needs_review')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 receipt jsonb not null default '{}'::jsonb check(jsonb_typeof(receipt)='object'),
 error_code text check(error_code ~ '^[A-Z0-9_]{2,40}$'),
 unique(installation_id, phase)
);
create index if not exists kairos_control_operations_by_install_idx on public.kairos_control_operations(installation_id, started_at);
create table if not exists public.kairos_control_audit (
 id bigint generated always as identity primary key,
 installation_id uuid not null references public.kairos_control_installations(id) on delete cascade,
 phase text not null,
 event text not null check(event in ('claimed','confirmed','needs_review')),
 occurred_at timestamptz not null default now()
);

do $$
declare t text;
begin
 foreach t in array array[
  'kairos_control_users','kairos_control_sessions','kairos_control_connections',
  'kairos_control_installations','kairos_control_install_secrets',
  'kairos_control_operations','kairos_control_audit'
 ] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
grant usage, select on sequence public.kairos_control_audit_id_seq to service_role;

-- Atomic intent-before-side-effect claim: no automatic retry of an already claimed phase.
create or replace function public.kairos_control_claim(
 p_installation uuid, p_github_id bigint, p_phase text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.kairos_control_installations%rowtype;
declare v_phase text;
declare v_id uuid;
begin
 select * into r from public.kairos_control_installations
 where id=p_installation and github_id=p_github_id for update;
 if not found then return jsonb_build_object('claimed',false,'reason','not_found'); end if;
 v_phase := (array['github','supabase','migrate','vercel','env','bootstrap','deploy','smoke'])[r.phase_index+1];
 if v_phase is null then return jsonb_build_object('claimed',false,'reason','complete'); end if;
 if v_phase<>p_phase then return jsonb_build_object('claimed',false,'reason','out_of_order'); end if;
 if exists(select 1 from public.kairos_control_operations where installation_id=p_installation and phase=p_phase)
 then return jsonb_build_object('claimed',false,'reason','review_existing_attempt'); end if;
 insert into public.kairos_control_operations(installation_id,phase,status)
 values(p_installation,p_phase,'started') returning id into v_id;
 insert into public.kairos_control_audit(installation_id,phase,event) values(p_installation,p_phase,'claimed');
 return jsonb_build_object('claimed',true,'attempt_id',v_id);
end; $$;

-- Finalize only the exact recorded attempt; progress and receipt update in one transaction.
create or replace function public.kairos_control_finish(
 p_installation uuid, p_github_id bigint, p_phase text, p_attempt uuid,
 p_receipt jsonb
) returns boolean language plpgsql security definer set search_path=''
as $$
declare r public.kairos_control_installations%rowtype;
declare v_allowed text[];
declare v_key text;
begin
 select * into r from public.kairos_control_installations
 where id=p_installation and github_id=p_github_id for update;
 if not found then return false; end if;
 if (array['github','supabase','migrate','vercel','env','bootstrap','deploy','smoke'])[r.phase_index+1]<>p_phase
 then return false; end if;
 if p_receipt is null or jsonb_typeof(p_receipt)<>'object' or length(p_receipt::text)>800
 then return false; end if;
 v_allowed := case p_phase
  when 'github' then array['repository']
  when 'supabase' then array['projectRef']
  when 'vercel' then array['projectId']
  when 'deploy' then array['url']
  else array[]::text[] end;
 for v_key in select jsonb_object_keys(p_receipt) loop
  if not v_key=any(v_allowed) or jsonb_typeof(p_receipt->v_key)<>'string' then return false; end if;
 end loop;
 if p_phase='supabase' and coalesce(p_receipt->>'projectRef','') !~ '^[a-z0-9]{10,30}$' then return false; end if;
 if p_phase='vercel' and coalesce(p_receipt->>'projectId','') !~ '^prj_[A-Za-z0-9_-]+$' then return false; end if;
 if p_phase='github' and p_receipt->>'repository' <> r.owner||'/'||r.repository then return false; end if;
 if p_phase='deploy' and coalesce(p_receipt->>'url','') !~ '^https://[a-z0-9-]+[.]vercel[.]app$' then return false; end if;
 update public.kairos_control_operations
 set status='confirmed',finished_at=now(),receipt=p_receipt
 where id=p_attempt and installation_id=p_installation and phase=p_phase
 and (status='started' or (status='needs_review' and p_phase in ('deploy','smoke')));
 if not found then return false; end if;
 update public.kairos_control_installations set
  phase_index=phase_index+1,updated_at=now(),
  supabase_ref=case when p_phase='supabase' then p_receipt->>'projectRef' else supabase_ref end,
  vercel_project_id=case when p_phase='vercel' then p_receipt->>'projectId' else vercel_project_id end,
  pwa_origin=case when p_phase='deploy' then p_receipt->>'url' else pwa_origin end
 where id=p_installation and github_id=p_github_id;
 insert into public.kairos_control_audit(installation_id,phase,event) values(p_installation,p_phase,'confirmed');
 return true;
end; $$;

create or replace function public.kairos_control_review(
 p_installation uuid,p_github_id bigint,p_phase text,p_attempt uuid,p_error_code text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare r uuid;
begin
 select id into r from public.kairos_control_installations
 where id=p_installation and github_id=p_github_id for update;
 if not found or p_error_code !~ '^[A-Z0-9_]{2,40}$' then return false; end if;
 update public.kairos_control_operations
 set status='needs_review',finished_at=now(),error_code=p_error_code
 where id=p_attempt and installation_id=p_installation and phase=p_phase and status='started';
 if not found then return false; end if;
 insert into public.kairos_control_audit(installation_id,phase,event) values(p_installation,p_phase,'needs_review');
 return true;
end; $$;

revoke all on function public.kairos_control_claim(uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.kairos_control_finish(uuid,bigint,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.kairos_control_review(uuid,bigint,text,uuid,text) from public,anon,authenticated;
grant execute on function public.kairos_control_claim(uuid,bigint,text) to service_role;
grant execute on function public.kairos_control_finish(uuid,bigint,text,uuid,jsonb) to service_role;
grant execute on function public.kairos_control_review(uuid,bigint,text,uuid,text) to service_role;

-- One-time delivery of the bootstrap password to the installation owner after success.
create or replace function public.kairos_control_take_admin_credentials(
 p_installation uuid,p_github_id bigint
) returns text language plpgsql security definer set search_path=''
as $$
declare v_phase smallint;
declare v_envelope text;
begin
 select phase_index into v_phase from public.kairos_control_installations
 where id=p_installation and github_id=p_github_id for update;
 if not found or v_phase<6 then return null; end if;
 update public.kairos_control_install_secrets
 set admin_password_claimed_at=now()
 where installation_id=p_installation and admin_password_claimed_at is null
 returning envelope into v_envelope;
 return v_envelope;
end; $$;
revoke all on function public.kairos_control_take_admin_credentials(uuid,bigint) from public,anon,authenticated;
grant execute on function public.kairos_control_take_admin_credentials(uuid,bigint) to service_role;
