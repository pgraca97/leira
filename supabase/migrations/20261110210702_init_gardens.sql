-- Profiles and gardens, readable and writable only by their owner.
--
-- Access is closed twice over: row level security limits rows to their owner,
-- and column-level grants limit which columns a client may write. Nothing is
-- granted to `anon`: guests sign in anonymously and act as `authenticated`.

-- Helper functions live outside the schemas exposed through the Data API.
create schema private;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  locale text not null default 'en' check (locale in ('pt', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Per-user settings. One row per auth user, created by trigger.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Runs as the function owner because the signing-up user cannot insert yet.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select on public.profiles to authenticated;
grant update (display_name, locale) on public.profiles to authenticated;

-- Gardens -------------------------------------------------------------------

create table public.gardens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- { "lat": number, "lon": number, "name"?: string }, rounded by the client.
  -- A CASE, not a chain of ANDs: a missing key makes a comparison NULL, and a
  -- CHECK lets NULL through. CASE also guarantees the casts run only on numbers.
  location jsonb check (
    location is null
    or case
      when jsonb_typeof(location -> 'lat') = 'number'
        and jsonb_typeof(location -> 'lon') = 'number'
      then (location ->> 'lat')::numeric between -90 and 90
        and (location ->> 'lon')::numeric between -180 and 180
      else false
    end
  ),
  -- The whole plan as one document; its shape is validated by the client (Zod).
  plan jsonb not null check (
    jsonb_typeof(plan) = 'object'
    and octet_length(plan::text) <= 524288
  ),
  -- Bumped on every update. Clients send the version they loaded, so a stale
  -- tab cannot overwrite a newer save.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.gardens is 'A garden and its plan document. Owner-only.';

create index gardens_owner_id_idx on public.gardens (owner_id);

create function private.bump_garden_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger gardens_bump_version
  before update on public.gardens
  for each row execute function private.bump_garden_version();

alter table public.gardens enable row level security;

create policy "Owners can read their gardens"
  on public.gardens for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can create gardens"
  on public.gardens for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update their gardens"
  on public.gardens for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their gardens"
  on public.gardens for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- Clients choose the name, location and plan. The id, owner, version and
-- timestamps always come from defaults and triggers.
grant select, delete on public.gardens to authenticated;
grant insert (name, location, plan) on public.gardens to authenticated;
grant update (name, location, plan) on public.gardens to authenticated;
