-- Additive control-plane migration ONLY. Not applied by deployment.
-- Durable per-installation authorization and server-side executor lease.
create table if not exists public.kairos_control_automation_jobs (
 installation_id uuid primary key references public.kairos_control_installations(id) on delete cascade,
 github_id bigint not null references public.kairos_control_users(github_id) on delete cascade,
 owner text not null,
 repository text not null,
 supabase_org_id text not null,
 vercel_team_id text not null,
 accept_billing boolean not null check(accept_billing),
 authorized_at timestamptz not null default now(),
 expires_at timestamptz not null,
 state text not null default 'queued' check(state in ('queued','running','waiting','paused','completed')),
 next_run_at timestamptz not null default now(),
 lease_until timestamptz,
 claim_id uuid,
 last_error text check(last_error ~ '^[A-Z0-9_]{2,40}$'),
 updated_at timestamptz not null default now(),
 check(expires_at > authorized_at and expires_at <= authorized_at + interval '7 days')
);
create index if not exists kairos_control_automation_due_idx
 on public.kairos_control_automation_jobs(next_run_at)
 where state in ('queued','waiting','running');
alter table public.kairos_control_automation_jobs enable row level security;
revoke all on public.kairos_control_automation_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.kairos_control_automation_jobs to service_role;

-- Enqueue exactly once: match all consented destinations against locked installation.
-- Never replace an existing authorization or silently restart a paused job.
create or replace function public.kairos_control_automation_enqueue(
 p_installation uuid,p_github_id bigint,p_owner text,p_repository text,
 p_supabase_org_id text,p_vercel_team_id text,p_accept_billing boolean,
 p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.kairos_control_installations%rowtype;
declare j public.kairos_control_automation_jobs%rowtype;
begin
 select * into r from public.kairos_control_installations
 where id=p_installation and github_id=p_github_id for update;
 if not found then return jsonb_build_object('accepted',false,'reason','NOT_FOUND'); end if;
 if r.phase_index<>0 or not p_accept_billing or
    r.owner<>p_owner or r.repository<>p_repository or
    r.supabase_org_id<>p_supabase_org_id or r.vercel_team_id<>p_vercel_team_id or
    lower(r.owner)='pullmawollf' or r.repository !~ '^kairos-hml-[a-z0-9-]{3,52}$' or
    r.cell_name !~* '^HML( |-)' or
    p_expires_at is null or p_expires_at<=now() or
    p_expires_at>now()+interval '7 days'
 then return jsonb_build_object('accepted',false,'reason','SCOPE_DENIED'); end if;
 if exists(select 1 from public.kairos_control_operations where installation_id=r.id)
 then return jsonb_build_object('accepted',false,'reason','ALREADY_STARTED'); end if;
 insert into public.kairos_control_automation_jobs
 (installation_id,github_id,owner,repository,supabase_org_id,vercel_team_id,accept_billing,expires_at)
 values(r.id,r.github_id,r.owner,r.repository,r.supabase_org_id,r.vercel_team_id,true,p_expires_at)
 on conflict(installation_id) do nothing;
 select * into j from public.kairos_control_automation_jobs where installation_id=r.id;
 return jsonb_build_object('accepted',true,'state',j.state,'installationId',r.id);
end; $$;

-- Concurrent scheduler calls cannot claim the same job.
-- Stale leases MAY be reclaimed, but the application must inspect operations
-- before issuing any provider mutation.
create or replace function public.kairos_control_automation_claim()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare j public.kairos_control_automation_jobs%rowtype;
declare v_claim uuid:=gen_random_uuid();
begin
 select * into j from public.kairos_control_automation_jobs
 where expires_at>now() and
  ((state in ('queued','waiting') and next_run_at<=now()) or
   (state='running' and lease_until<now()))
 order by next_run_at,authorized_at
 for update skip locked limit 1;
 if not found then return null; end if;
 update public.kairos_control_automation_jobs
 set state='running',claim_id=v_claim,lease_until=now()+interval '120 seconds',
  updated_at=now()
 where installation_id=j.installation_id;
 return jsonb_build_object(
  'installationId',j.installation_id,'userId',j.github_id,
  'owner',j.owner,'repository',j.repository,'supabaseOrgId',j.supabase_org_id,
  'vercelTeamId',j.vercel_team_id,'expiresAt',j.expires_at,
  'acceptBilling',j.accept_billing,'claimId',v_claim
 );
end; $$;

create or replace function public.kairos_control_automation_settle(
 p_installation uuid,p_claim uuid,p_state text,p_error text default null,
 p_delay_seconds integer default 0
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if p_state not in ('queued','waiting','paused','completed') or
   p_delay_seconds<0 or p_delay_seconds>3600 or
   (p_error is not null and p_error !~ '^[A-Z0-9_]{2,40}$') then return false; end if;
 update public.kairos_control_automation_jobs
 set state=p_state,claim_id=null,lease_until=null,
  last_error=p_error,updated_at=now(),
  next_run_at=now()+make_interval(secs=>p_delay_seconds)
 where installation_id=p_installation and claim_id=p_claim and state='running' and
  lease_until>now();
 return found;
end; $$;

revoke all on function public.kairos_control_automation_enqueue(uuid,bigint,text,text,text,text,boolean,timestamptz) from public,anon,authenticated;
revoke all on function public.kairos_control_automation_claim() from public,anon,authenticated;
revoke all on function public.kairos_control_automation_settle(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.kairos_control_automation_enqueue(uuid,bigint,text,text,text,text,boolean,timestamptz) to service_role;
grant execute on function public.kairos_control_automation_claim() to service_role;
grant execute on function public.kairos_control_automation_settle(uuid,uuid,text,text,integer) to service_role;
