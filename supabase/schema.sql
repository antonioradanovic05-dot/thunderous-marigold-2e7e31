-- AR Studio / Investor Portal
-- Run this in the Supabase SQL editor.
-- Then add your creator email:
--   insert into public.studio_users (email) values ('you@yourstudio.com') on conflict do nothing;

create extension if not exists pgcrypto;

create table if not exists public.studio_users (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.client_workspaces (
  id text primary key,
  invite_token text not null unique,
  name text not null,
  email text not null,
  avatar text not null default 'AR',
  welcome text not null default 'Dobrodošli,',
  status text not null default 'active' check (status in ('active', 'review', 'completed')),
  location text,
  project jsonb not null default '{}'::jsonb,
  modules jsonb not null default '{}'::jsonb,
  offer jsonb not null default '{}'::jsonb,
  custom_note text not null default '',
  model jsonb not null default '{}'::jsonb,
  renders jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  portfolio jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.client_workspaces(id) on delete cascade,
  from_role text not null check (from_role in ('client', 'studio')),
  text text not null,
  attachment text,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.client_workspaces(id) on delete cascade,
  author text not null,
  role text not null default 'Employee',
  ratings jsonb not null default '{}'::jsonb,
  notes text not null default '',
  recommend boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_workspaces_set_updated_at on public.client_workspaces;
create trigger client_workspaces_set_updated_at
before update on public.client_workspaces
for each row
execute function public.set_updated_at();

create or replace function public.is_studio_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.studio_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.client_workspaces enable row level security;
alter table public.workspace_messages enable row level security;
alter table public.workspace_feedback enable row level security;

drop policy if exists "Studio users can read all workspaces" on public.client_workspaces;
create policy "Studio users can read all workspaces"
on public.client_workspaces
for select
using (public.is_studio_user());

drop policy if exists "Clients can read their own workspace" on public.client_workspaces;
create policy "Clients can read their own workspace"
on public.client_workspaces
for select
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "Studio users can insert workspaces" on public.client_workspaces;
create policy "Studio users can insert workspaces"
on public.client_workspaces
for insert
with check (public.is_studio_user());

drop policy if exists "Studio users can update workspaces" on public.client_workspaces;
create policy "Studio users can update workspaces"
on public.client_workspaces
for update
using (public.is_studio_user())
with check (public.is_studio_user());

drop policy if exists "Studio users can delete workspaces" on public.client_workspaces;
create policy "Studio users can delete workspaces"
on public.client_workspaces
for delete
using (public.is_studio_user());

drop policy if exists "Studio users can read all messages" on public.workspace_messages;
create policy "Studio users can read all messages"
on public.workspace_messages
for select
using (public.is_studio_user());

drop policy if exists "Clients can read their workspace messages" on public.workspace_messages;
create policy "Clients can read their workspace messages"
on public.workspace_messages
for select
using (
  exists (
    select 1
    from public.client_workspaces cw
    where cw.id = workspace_messages.workspace_id
      and lower(cw.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Studio users can insert messages" on public.workspace_messages;
create policy "Studio users can insert messages"
on public.workspace_messages
for insert
with check (public.is_studio_user());

drop policy if exists "Clients can insert messages to their workspace" on public.workspace_messages;
create policy "Clients can insert messages to their workspace"
on public.workspace_messages
for insert
with check (
  exists (
    select 1
    from public.client_workspaces cw
    where cw.id = workspace_messages.workspace_id
      and lower(cw.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Studio users can read all feedback" on public.workspace_feedback;
create policy "Studio users can read all feedback"
on public.workspace_feedback
for select
using (public.is_studio_user());

drop policy if exists "Studio users can insert feedback" on public.workspace_feedback;
create policy "Studio users can insert feedback"
on public.workspace_feedback
for insert
with check (public.is_studio_user());

drop policy if exists "Clients can insert feedback for their workspace" on public.workspace_feedback;
create policy "Clients can insert feedback for their workspace"
on public.workspace_feedback
for insert
with check (
  exists (
    select 1
    from public.client_workspaces cw
    where cw.id = workspace_feedback.workspace_id
      and lower(cw.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

create or replace function public.get_workspace_bundle_by_invite(invite_token_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row public.client_workspaces;
  message_rows jsonb;
begin
  select *
  into workspace_row
  from public.client_workspaces
  where invite_token = invite_token_input
  limit 1;

  if workspace_row is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', wm.id,
        'from', wm.from_role,
        'text', wm.text,
        'time', to_char(wm.created_at, 'HH24:MI'),
        'attachment', wm.attachment
      )
      order by wm.created_at asc
    ),
    '[]'::jsonb
  )
  into message_rows
  from public.workspace_messages wm
  where wm.workspace_id = workspace_row.id;

  return jsonb_build_object(
    'id', workspace_row.id,
    'inviteToken', workspace_row.invite_token,
    'name', workspace_row.name,
    'email', workspace_row.email,
    'avatar', workspace_row.avatar,
    'welcome', workspace_row.welcome,
    'status', workspace_row.status,
    'location', workspace_row.location,
    'project', workspace_row.project,
    'modules', workspace_row.modules,
    'offer', workspace_row.offer,
    'customNote', workspace_row.custom_note,
    'model', workspace_row.model,
    'renders', workspace_row.renders,
    'documents', workspace_row.documents,
    'portfolio', workspace_row.portfolio,
    'messages', message_rows
  );
end;
$$;

grant execute on function public.get_workspace_bundle_by_invite(text) to anon, authenticated;

create or replace function public.get_workspace_bundle_for_current_user()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row public.client_workspaces;
  message_rows jsonb;
begin
  select *
  into workspace_row
  from public.client_workspaces
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;

  if workspace_row is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', wm.id,
        'from', wm.from_role,
        'text', wm.text,
        'time', to_char(wm.created_at, 'HH24:MI'),
        'attachment', wm.attachment
      )
      order by wm.created_at asc
    ),
    '[]'::jsonb
  )
  into message_rows
  from public.workspace_messages wm
  where wm.workspace_id = workspace_row.id;

  return jsonb_build_object(
    'id', workspace_row.id,
    'inviteToken', workspace_row.invite_token,
    'name', workspace_row.name,
    'email', workspace_row.email,
    'avatar', workspace_row.avatar,
    'welcome', workspace_row.welcome,
    'status', workspace_row.status,
    'location', workspace_row.location,
    'project', workspace_row.project,
    'modules', workspace_row.modules,
    'offer', workspace_row.offer,
    'customNote', workspace_row.custom_note,
    'model', workspace_row.model,
    'renders', workspace_row.renders,
    'documents', workspace_row.documents,
    'portfolio', workspace_row.portfolio,
    'messages', message_rows
  );
end;
$$;

grant execute on function public.get_workspace_bundle_for_current_user() to authenticated;

create or replace function public.add_client_message_by_invite(
  invite_token_input text,
  message_text text,
  attachment_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row public.client_workspaces;
  inserted_row public.workspace_messages;
begin
  select *
  into workspace_row
  from public.client_workspaces
  where invite_token = invite_token_input
  limit 1;

  if workspace_row is null then
    return null;
  end if;

  insert into public.workspace_messages (workspace_id, from_role, text, attachment)
  values (workspace_row.id, 'client', message_text, attachment_input)
  returning * into inserted_row;

  return jsonb_build_object(
    'id', inserted_row.id,
    'from', inserted_row.from_role,
    'text', inserted_row.text,
    'time', to_char(inserted_row.created_at, 'HH24:MI'),
    'attachment', inserted_row.attachment
  );
end;
$$;

grant execute on function public.add_client_message_by_invite(text, text, text) to anon, authenticated;

create or replace function public.add_feedback_by_invite(
  invite_token_input text,
  author_input text,
  role_input text,
  ratings_input jsonb,
  notes_input text,
  recommend_input boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row public.client_workspaces;
  inserted_id uuid;
begin
  select *
  into workspace_row
  from public.client_workspaces
  where invite_token = invite_token_input
  limit 1;

  if workspace_row is null then
    return null;
  end if;

  insert into public.workspace_feedback (workspace_id, author, role, ratings, notes, recommend)
  values (workspace_row.id, author_input, role_input, ratings_input, notes_input, recommend_input)
  returning id into inserted_id;

  return inserted_id;
end;
$$;

grant execute on function public.add_feedback_by_invite(text, text, text, jsonb, text, boolean) to anon, authenticated;

insert into storage.buckets (id, name, public)
values
  ('renders', 'renders', true),
  ('documents', 'documents', true),
  ('models', 'models', true)
on conflict (id) do nothing;

drop policy if exists "Public can read render assets" on storage.objects;
create policy "Public can read render assets"
on storage.objects
for select
using (bucket_id in ('renders', 'documents', 'models'));

drop policy if exists "Studio users can upload assets" on storage.objects;
create policy "Studio users can upload assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('renders', 'documents', 'models')
  and public.is_studio_user()
);

drop policy if exists "Studio users can update assets" on storage.objects;
create policy "Studio users can update assets"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('renders', 'documents', 'models')
  and public.is_studio_user()
)
with check (
  bucket_id in ('renders', 'documents', 'models')
  and public.is_studio_user()
);

drop policy if exists "Studio users can delete assets" on storage.objects;
create policy "Studio users can delete assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('renders', 'documents', 'models')
  and public.is_studio_user()
);
