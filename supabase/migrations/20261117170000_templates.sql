-- Groups of beds and crops a gardener saves to use again, in any of their
-- gardens: "tomatoes with basil", a three-bed rotation. `items` holds them in
-- the editor's clipboard format, which says its own version.
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  items jsonb not null check (
    jsonb_typeof(items) = 'object' and pg_column_size(items) <= 262144
  ),
  created_at timestamptz not null default now()
);

create index templates_owner_id_idx on public.templates (owner_id);

alter table public.templates enable row level security;

create policy "Owners can read their templates"
  on public.templates for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can save templates of their own"
  on public.templates for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their templates"
  on public.templates for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- A template is saved whole and never edited: to change one, save it again.
-- The owner comes from the session, so the client may not set it.
grant select, delete on public.templates to authenticated;
grant insert (name, items) on public.templates to authenticated;

-- Fifty a person is plenty for a garden, and keeps one account from filling
-- the free database.
create function private.limit_templates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.templates where owner_id = new.owner_id) >= 50 then
    raise exception 'at most 50 templates per user' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger templates_limit
  before insert on public.templates
  for each row execute function private.limit_templates();

-- The export takes the templates along. Same signature, so the grants stay.
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'format', 1,
    'exportedAt', now(),
    'account', (
      select jsonb_build_object('email', person.email, 'createdAt', person.created_at)
      from auth.users as person
      where person.id = auth.uid()
    ),
    'profile', (
      select jsonb_build_object('displayName', profile.display_name, 'locale', profile.locale)
      from public.profiles as profile
      where profile.id = auth.uid()
    ),
    'gardens', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', garden.name,
            'plan', garden.plan,
            'location', garden.location,
            'version', garden.version,
            'createdAt', garden.created_at,
            'updatedAt', garden.updated_at,
            'share', (
              select jsonb_build_object('token', share.token, 'showLocation', share.show_location)
              from public.garden_shares as share
              where share.garden_id = garden.id
            )
          )
          order by garden.created_at
        )
        from public.gardens as garden
        where garden.owner_id = auth.uid()
      ),
      '[]'::jsonb
    ),
    'templates', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', template.name,
            'items', template.items,
            'createdAt', template.created_at
          )
          order by template.created_at
        )
        from public.templates as template
        where template.owner_id = auth.uid()
      ),
      '[]'::jsonb
    ),
    'activityDays', coalesce(
      (
        select jsonb_agg(activity.day order by activity.day)
        from private.activity_days as activity
        where activity.user_id = auth.uid()
      ),
      '[]'::jsonb
    )
  );
$$;
