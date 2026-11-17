-- Usage stats for whoever runs the app: how many people use it, whether they
-- come back, and how close the free tiers are. They say when paying for a
-- domain or a bigger plan would be worth it.

-- One row per user for each day they opened the app. The visit is recorded
-- when a session starts, not when a garden is saved, so someone who comes back
-- only to read their calendar still counts as coming back.
create table private.activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

-- Who may read the stats. Rows are added by hand in the SQL editor: user ids
-- differ in every environment, so a migration cannot know them.
create table private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- The days gardens were made or last saved, so the history does not start empty.
insert into private.activity_days (user_id, day)
select owner_id, (created_at at time zone 'utc')::date from public.gardens
union
select owner_id, (updated_at at time zone 'utc')::date from public.gardens
on conflict do nothing;

-- Called by the app once a session is ready. Calling it again on the same day
-- does nothing, so a reload costs no more than a lookup.
create function public.record_visit()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.activity_days (user_id, day)
  select auth.uid(), (now() at time zone 'utc')::date
  where auth.uid() is not null
  on conflict do nothing;
$$;

-- Everything the stats page shows, in one call. Days and weeks are in UTC, and
-- weeks start on Monday. The admins are left out of the people and garden
-- counts, which answer "is anyone else using it", but not out of the monthly
-- users, which estimate a quota that counts everyone.
create function public.usage_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  this_week date := date_trunc('week', today)::date;
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
        'withLocation', count(*) filter (where garden.location is not null)
      )
      from public.gardens as garden
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

-- Guests sign in anonymously and act as `authenticated`, so both functions are
-- for that role only. `anon` is named as well as `public`, in case the
-- platform granted it execute on new functions.
revoke all on function public.record_visit() from public, anon;
grant execute on function public.record_visit() to authenticated;
revoke all on function public.usage_stats() from public, anon;
grant execute on function public.usage_stats() to authenticated;
