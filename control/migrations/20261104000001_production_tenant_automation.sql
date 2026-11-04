-- KAIRÓS control plane only. Additive: does not modify tenant databases.
-- Existing homologation enqueue RPC remains unchanged and HML-only.
alter table public.kairos_control_automation_jobs
 add column if not exists mode text not null default 'homologation';
alter table public.kairos_control_automation_jobs
 drop constraint if exists kairos_control_automation_jobs_mode_check;
alter table public.kairos_control_automation_jobs
 add constraint kairos_control_automation_jobs_mode_check
 check (mode in ('homologation','production'));

-- A dedicated production enqueue function avoids weakening the HML-only RPC.
-- Service-role only. It snapshots the SAME immutable user/targets already
-- validated on the browser-authenticated API and applies per-owner concurrency.
create or replace function public.kairos_control_automation_enqueue_production(
 p_installation uuid,p_github_id bigint,p_owner text,p_repository text,
 p_supabase_org_id text,p_vercel_team_id text,p_accept_billing boolean,
 p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.kairos_control_installations%rowtype;
declare j public.kairos_control_automation_jobs%rowtype;
declare owner_login text;
begin
 if p_github_id is null or p_github_id<=0 then
  return jsonb_build_object('accepted',false,'reason','SCOPE_DENIED'); end if;
 -- Serializes enqueue among concurrent user requests to enforce one active job.
 perform pg_advisory_xact_lock(p_github_id);
 select * into r from public.kairos_control_installations
 where id=p_installation and github_id=p_github_id for update;
 if not found then return jsonb_build_object('accepted',false,'reason','NOT_FOUND'); end if;
 select login into owner_login from public.kairos_control_users
 where github_id=p_github_id;
 if r.phase_index<>0 or not p_accept_billing or
   lower(owner_login)<>lower(r.owner) or lower(r.owner)='pullmawollf' or
   r.owner<>p_owner or r.repository<>p_repository or
   r.supabase_org_id<>p_supabase_org_id or
   r.vercel_team_id<>p_vercel_team_id or
   r.repository !~ '^kairos-[a-z0-9][a-z0-9-]{2,55}$' or
   r.repository ~ '^kairos-hml-' or
   r.cell_name ~* '^HML( |-)' or
   p_expires_at is null or p_expires_at<=now() or
   p_expires_at>now()+interval '7 days'
 then return jsonb_build_object('accepted',false,'reason','SCOPE_DENIED'); end if;
 if exists(select 1 from public.kairos_control_operations where installation_id=r.id)
 then return jsonb_build_object('accepted',false,'reason','ALREADY_STARTED'); end if;
 if exists(select 1 from public.kairos_control_automation_jobs
   where installation_id=r.id)
 then return jsonb_build_object('accepted',false,'reason','ALREADY_QUEUED'); end if;
 if exists(select 1 from public.kairos_control_automation_jobs
   where github_id=r.github_id and installation_id<>r.id
    and expires_at>now() and state in ('queued','running','waiting'))
 then return jsonb_build_object('accepted',false,'reason','ACTIVE_INSTALLATION_EXISTS'); end if;
 insert into public.kairos_control_automation_jobs
 (installation_id,github_id,owner,repository,supabase_org_id,vercel_team_id,
  accept_billing,expires_at,mode)
 values(r.id,r.github_id,r.owner,r.repository,r.supabase_org_id,r.vercel_team_id,
  true,p_expires_at,'production')
 returning * into j;
 return jsonb_build_object('accepted',true,'state',j.state,
  'installationId',j.installation_id);
end; $$;

revoke all on function public.kairos_control_automation_enqueue_production(
 uuid,bigint,text,text,text,text,boolean,timestamptz)
 from public,anon,authenticated;
grant execute on function public.kairos_control_automation_enqueue_production(
 uuid,bigint,text,text,text,text,boolean,timestamptz)
 to service_role;
