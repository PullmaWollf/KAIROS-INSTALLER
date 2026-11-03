-- KAIRÓS: instalar SOMENTE em um projeto Supabase novo e exclusivo da célula.
create extension if not exists pgcrypto;

create table if not exists public.app_users (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 2 and 120),
 login text not null unique check(login ~ '^[a-z0-9._-]{3,40}$'),
 password_hash text not null,
 role text not null default 'membro' check(role in ('admin','lider','membro','frequentador')),
 phone text, active boolean not null default true,
 session_version integer not null default 1,
 created_at timestamptz not null default now()
);
create table if not exists public.app_settings (
 key text primary key,
 value jsonb not null,
 updated_at timestamptz not null default now()
);
insert into public.app_settings(key,value) values
 ('branding','{"name":"KAIRÓS","eyebrow":"COMUNIDADE","subtitle":"Um lugar para pertencer","description":"Crescendo juntos em comunhão e fé.","logo_url":"","hero_url":"","primary":"#8f375c","background":"#fff9f8","hero_background":"#37212f","button_one":"Ver mural","button_two":"Nossos encontros","show_decorations":true}'::jsonb)
on conflict(key) do nothing;
create table if not exists public.posts (
 id uuid primary key default gen_random_uuid(),
 author_id uuid references public.app_users(id) on delete set null,
 title text not null check(char_length(title) between 1 and 140),
 body text not null check(char_length(body) between 1 and 5000),
 created_at timestamptz not null default now()
);
create table if not exists public.meetings (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(title) between 2 and 120),
 category text not null default 'celula' check(category in ('celula','culto','outro')),
 starts_at timestamptz not null,
 location text not null default '',
 notes text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.attendance (
 id uuid primary key default gen_random_uuid(),
 meeting_id uuid not null references public.meetings(id) on delete cascade,
 user_id uuid not null references public.app_users(id) on delete cascade,
 present boolean not null,
 updated_at timestamptz not null default now(),
 unique(meeting_id,user_id)
);
create table if not exists public.schedule_items (
 id uuid primary key default gen_random_uuid(),
 meeting_id uuid not null references public.meetings(id) on delete cascade,
 user_id uuid references public.app_users(id) on delete set null,
 function_name text not null check(char_length(function_name) between 2 and 100),
 notes text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.study_material (
 id boolean primary key default true check(id=true),
 title text not null default 'Palavra da Célula',
 file_url text not null default '',
 updated_at timestamptz not null default now()
);
insert into public.study_material(id) values(true) on conflict(id) do nothing;

create index if not exists posts_created_idx on public.posts(created_at desc);
create index if not exists meetings_date_idx on public.meetings(starts_at desc);
create index if not exists attendance_meeting_idx on public.attendance(meeting_id);
create index if not exists attendance_user_idx on public.attendance(user_id);
create index if not exists schedule_meeting_idx on public.schedule_items(meeting_id);

-- Sessões próprias do KAIRÓS; frontend sem acesso direto a tabelas.
alter table public.app_users enable row level security;
alter table public.app_settings enable row level security;
alter table public.posts enable row level security;
alter table public.meetings enable row level security;
alter table public.attendance enable row level security;
alter table public.schedule_items enable row level security;
alter table public.study_material enable row level security;
revoke all on public.app_users,public.app_settings,public.posts,public.meetings,
  public.attendance,public.schedule_items,public.study_material from anon,authenticated,public;
-- O servidor usa chave service_role, nunca exposta ao navegador.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kairos-public','kairos-public',true,5242880,array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict(id) do nothing;
