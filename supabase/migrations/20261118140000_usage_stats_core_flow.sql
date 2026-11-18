-- The usage stats also say whether people plant and record, and whether a
-- garden reaches a second year: the numbers the next changes to the app are
-- measured by. They are counts over every garden, never one garden's content.

-- The database keeps any object as a plan, since only the app checks its
-- shape, so a field that should hold a list may hold anything. This reads it
-- as an empty list then, and the stats never fail on one odd plan.
create function private.json_list(value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(value) = 'array' then value else '[]'::jsonb end;
$$;

revoke all on function private.json_list(jsonb) from public, anon, authenticated;

-- Replacing the function keeps who may call it: admins only, checked inside.
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
