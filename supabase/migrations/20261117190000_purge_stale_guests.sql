-- Removes the guests nobody will come back to: bots that ran the app once,
-- visits that bounced, and the fresh guest the app makes after every sign-out.
--
-- This does not lower the monthly active users the free plan allows: Supabase
-- counts whoever signed in or refreshed a token during the month, and a guest
-- who never returns stops counting the next month anyway. It keeps their rows
-- out of the database and their numbers out of the usage stats.

-- A guest is seen when they arrive, sign in, open the app (a day in
-- `activity_days`) or save a garden. One who left nothing goes after 30 days
-- unseen. One with a garden or a template goes only after a year: a guest's
-- session never expires, so they could still come back to it, but after that
-- long the browser that held it is almost surely gone, and a guest has no
-- email to ask.
--
-- Accounts are never removed here, nor admins. At most `batch` guests go per
-- run, so a wave of bots is cleared over several nights instead of in one
-- long delete. Every table that keeps something about a user references it
-- with `on delete cascade`, so their profile, gardens and the rest go too.
create function private.purge_stale_guests(batch integer default 10000)
returns integer
language sql
volatile
set search_path = ''
as $$
  with seen as (
    select
      person.id,
      greatest(
        person.created_at,
        person.last_sign_in_at,
        -- A day of activity lasts until the end of that day.
        (
          select max(activity.day) + 1
          from private.activity_days as activity
          where activity.user_id = person.id
        )::timestamp at time zone 'utc',
        (select max(garden.updated_at) from public.gardens as garden where garden.owner_id = person.id)
      ) as last_seen,
      exists (select 1 from public.gardens as garden where garden.owner_id = person.id)
        or exists (select 1 from public.templates as template where template.owner_id = person.id)
        as kept_something
    from auth.users as person
    where person.is_anonymous
      and not exists (select 1 from private.admins as admin where admin.user_id = person.id)
  ),
  removed as (
    delete from auth.users
    where id in (
      select seen.id
      from seen
      where seen.last_seen < now() - case
        when seen.kept_something then interval '1 year'
        else interval '30 days'
      end
      limit batch
    )
    returning 1
  )
  select count(*)::integer from removed;
$$;

comment on function private.purge_stale_guests is 'Deletes guests unseen for 30 days with nothing kept, or for a year. Run nightly by pg_cron.';

revoke all on function private.purge_stale_guests(integer) from public, anon, authenticated;

-- Nightly, at a quiet hour in Europe. The schedule lives in the database, so
-- it needs no secret and no call from outside. The test database (PGlite)
-- has no pg_cron, hence the check; Supabase has it, locally and in production.
-- Scheduling a job under a name already taken replaces it, so this can run again.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'purge-stale-guests',
      '17 3 * * *',
      'select private.purge_stale_guests()'
    );
  end if;
end;
$$;
