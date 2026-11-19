-- A calendar link for a garden: its jobs as a feed that phone and desktop
-- calendars subscribe to, read again on their own and so kept up to date.
--
-- Like a share link, it is a row of its own with a token nobody could guess,
-- so turning it on or off does not move the garden's version on. It is apart
-- from the share link because it shows less (the jobs, not the plan drawn)
-- and an owner may want reminders without making the garden public.

create table public.garden_calendars (
  garden_id uuid primary key references public.gardens (id) on delete cascade,
  -- Always from the default: a client that could choose it could choose a weak one.
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

comment on table public.garden_calendars is 'The calendar feed link of a garden, if it has one. Owner-only.';

alter table public.garden_calendars enable row level security;

-- The gardens these policies look into are already limited to their owner,
-- but the owner is checked here as well, so this table does not lean on that.

create policy "Owners can read their gardens' calendar links"
  on public.garden_calendars for select
  to authenticated
  using (
    exists (
      select 1 from public.gardens
      where gardens.id = garden_id and gardens.owner_id = (select auth.uid())
    )
  );

create policy "Owners can turn on their gardens' calendar links"
  on public.garden_calendars for insert
  to authenticated
  with check (
    exists (
      select 1 from public.gardens
      where gardens.id = garden_id and gardens.owner_id = (select auth.uid())
    )
  );

create policy "Owners can turn off their gardens' calendar links"
  on public.garden_calendars for delete
  to authenticated
  using (
    exists (
      select 1 from public.gardens
      where gardens.id = garden_id and gardens.owner_id = (select auth.uid())
    )
  );

-- The owner picks only the garden. The token and the date always come from
-- defaults, and there is nothing to change afterwards: a new link is the old
-- one turned off and a new one turned on.
grant select, delete on public.garden_calendars to authenticated;
grant insert (garden_id) on public.garden_calendars to authenticated;

-- What a calendar link reads: the garden's name and plan, with what the plan
-- keeps private taken out, as for a share link. The Worker turns the plan
-- into jobs. Nothing while the account waits to be deleted, as with share links.
--
-- Runs as the function owner, because the calendar app that calls has no
-- session: the token is the whole permission, and this is the one way in.
create function public.garden_calendar(feed_token uuid)
returns table (name text, plan jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select gardens.name, private.public_plan(gardens.plan)
  from public.garden_calendars
  join public.gardens on gardens.id = garden_calendars.garden_id
  where garden_calendars.token = feed_token
    and not exists (
      select 1 from private.deletion_requests as request where request.user_id = gardens.owner_id
    );
$$;

comment on function public.garden_calendar is 'The garden behind a calendar link. Called by the Worker for calendar apps with no session.';

-- Only the Worker calls it, with no session, so only `anon` may.
revoke all on function public.garden_calendar(uuid) from public;
grant execute on function public.garden_calendar(uuid) to anon;

-- The export says, under each garden, its calendar link (null when it has
-- none). Only a field is added, so `format` stays 1. Same signature, so the
-- grants stay.
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
      select jsonb_build_object(
        'email', person.email,
        'createdAt', person.created_at,
        'signInMethods', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('provider', method.provider, 'addedAt', method.created_at)
              order by method.created_at
            )
            from auth.identities as method
            where method.user_id = person.id
          ),
          '[]'::jsonb
        ),
        'fromSignIn', person.raw_user_meta_data,
        'sessions', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'createdAt', signed_in.created_at,
                -- The auth server moves `refreshed_at` on each token refresh
                -- and `updated_at` on other changes, so the later of the two
                -- is when the session was last used. `refreshed_at` carries
                -- no time zone; the auth server writes it in UTC.
                'lastActiveAt', greatest(
                  signed_in.refreshed_at at time zone 'utc',
                  signed_in.updated_at
                ),
                'userAgent', signed_in.user_agent,
                -- `host` drops the "/32" a plain cast to text would add.
                'ip', host(signed_in.ip)
              )
              order by signed_in.created_at
            )
            from auth.sessions as signed_in
            where signed_in.user_id = person.id
          ),
          '[]'::jsonb
        ),
        'deletionRequestedAt', (
          select request.requested_at
          from private.deletion_requests as request
          where request.user_id = person.id
        )
      )
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
            ),
            'calendar', (
              select jsonb_build_object('token', feed.token)
              from public.garden_calendars as feed
              where feed.garden_id = garden.id
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

-- The usage stats count the gardens with a calendar link. Replacing the
-- function keeps who may call it: admins only, checked inside.
create or replace function public.usage_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  this_week date := date_trunc('week', today)::date;
  -- Plan dates are ISO text, and ISO dates sort as text, so a date that is
  -- not one cannot stop the count the way a cast would.
  last_day text := to_char(today, 'YYYY-MM-DD');
  first_day text := to_char(today - 6, 'YYYY-MM-DD');
begin
  if not exists (select 1 from private.admins where user_id = auth.uid()) then
    raise exception 'usage stats are for admins only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'people', (
      select jsonb_build_object(
        'guests', count(*) filter (where person.is_anonymous),
        'accounts', count(*) filter (where not person.is_anonymous),
        'withGarden', count(*) filter (
          where exists (select 1 from public.gardens where owner_id = person.id)
        ),
        'accountsWithGarden', count(*) filter (
          where not person.is_anonymous
            and exists (select 1 from public.gardens where owner_id = person.id)
        )
      )
      from auth.users as person
      where not exists (select 1 from private.admins where user_id = person.id)
    ),
    'gardens', (
      select jsonb_build_object(
        'total', count(*),
        'editedLast7Days', count(*) filter (where garden.updated_at > now() - interval '7 days'),
        'editedLast30Days', count(*) filter (where garden.updated_at > now() - interval '30 days'),
        'shared', count(*) filter (
          where exists (select 1 from public.garden_shares where garden_id = garden.id)
        ),
        'withCalendar', count(*) filter (
          where exists (select 1 from public.garden_calendars where garden_id = garden.id)
        ),
        'withLocation', count(*) filter (where garden.location is not null),
        'withPlantings', count(*) filter (where crops.plantings > 0),
        'withRecords', count(*) filter (where crops.recorded),
        'recordedLast7Days', count(*) filter (where crops.recent),
        'severalYears', count(*) filter (where crops.years > 1)
      )
      from public.gardens as garden
      cross join lateral (
        -- A record is a crop marked in the ground, out of it, sown under
        -- cover or harvested. Its day is the one the gardener gave, which is
        -- the only date the plan keeps: a harvest from last week typed in
        -- today counts as last week's.
        select
          count(*) as plantings,
          coalesce(bool_or(
            planting ? 'planted'
            or planting ? 'cleared'
            or planting ? 'sowDate'
            or jsonb_array_length(private.json_list(planting -> 'harvests')) > 0
          ), false) as recorded,
          coalesce(bool_or(
            (planting ? 'planted'
              and planting #>> '{inGround,from}' between first_day and last_day)
            or (planting ? 'cleared'
              and planting #>> '{inGround,to}' between first_day and last_day)
            or planting ->> 'sowDate' between first_day and last_day
            or exists (
              select 1
              from jsonb_array_elements(private.json_list(planting -> 'harvests')) as harvest
              where harvest ->> 'date' between first_day and last_day
            )
          ), false) as recent,
          -- The years crops go in, so a crop that stays over the winter is
          -- one season and not two.
          count(distinct substring(planting #>> '{inGround,from}' from '^(\d{4})-')) as years
        from jsonb_array_elements(private.json_list(garden.plan -> 'plantings')) as planting
      ) as crops
      where not exists (select 1 from private.admins where user_id = garden.owner_id)
    ),
    'weeks', (
      select jsonb_agg(
        jsonb_build_object(
          'weekStart', week.starts,
          'newPeople', joined.people,
          'active', present.active,
          'returning', present.came_back
        )
        order by week.starts
      )
      from (
        select starts::date as starts
        from generate_series(
          (this_week - 11 * 7)::timestamp, this_week::timestamp, interval '1 week'
        ) as starts
      ) as week
      cross join lateral (
        select count(*) as people
        from auth.users as person
        where (person.created_at at time zone 'utc')::date >= week.starts
          and (person.created_at at time zone 'utc')::date < week.starts + 7
          and not exists (select 1 from private.admins where user_id = person.id)
      ) as joined
      cross join lateral (
        -- Someone came back when they had been active in some earlier week.
        select
          count(*) as active,
          count(*) filter (
            where exists (
              select 1 from private.activity_days as earlier
              where earlier.user_id = visitor.user_id and earlier.day < week.starts
            )
          ) as came_back
        from (
          select distinct activity.user_id
          from private.activity_days as activity
          where activity.day >= week.starts
            and activity.day < week.starts + 7
            and not exists (select 1 from private.admins where user_id = activity.user_id)
        ) as visitor
      ) as present
    ),
    'limits', jsonb_build_object(
      'databaseBytes', pg_database_size(current_database()),
      'monthlyUsers', (
        select count(distinct user_id) from private.activity_days where day > today - 30
      )
    )
  );
end;
$$;
