-- Deleting an account waits 30 days. Asking for it signs the account out
-- everywhere; signing in again before the 30 days are up keeps it, in case
-- the request was a mistake or was made by someone else on an unlocked
-- device. Guests still delete at once with `delete_account`, which stays as
-- it was: a guest has no way to sign in again, and a client from before this
-- migration keeps working while the new one is deployed.

-- One row per account waiting to be deleted. It lives in `private`, out of
-- the Data API's reach: only the functions below read or write it.
create table private.deletion_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now()
);

comment on table private.deletion_requests is 'Accounts that asked to be deleted, and when. Deleted 30 days later by pg_cron.';

-- When an account asked for at `requested_at` goes. Every function below
-- uses this, so the 30 days the user is told are the 30 days they get.
create function private.deletion_due(requested_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select requested_at + interval '30 days';
$$;

revoke all on function private.deletion_due(timestamptz) from public, anon, authenticated;

-- Marks the caller's account for deletion and ends every session it has, so
-- no device stays signed in to it. Ending the sessions also ends their
-- refresh tokens, which the auth server deletes with them; an access token
-- already handed out still works until it expires, within the hour.
--
-- Asking again keeps the first date, so the account cannot be kept alive by
-- asking over and over. Returns when the account will be deleted.
create function public.request_account_deletion()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  requested timestamptz;
begin
  -- A guest has no email and no other way back in, so a deletion that waits
  -- for them to sign in again would only wait.
  if not exists (
    select 1 from auth.users as person where person.id = auth.uid() and not person.is_anonymous
  ) then
    raise exception 'only an account can ask to be deleted later: a guest is deleted at once'
      using errcode = '42501';
  end if;

  insert into private.deletion_requests (user_id) values (auth.uid())
  on conflict (user_id) do nothing;

  select request.requested_at into requested
  from private.deletion_requests as request
  where request.user_id = auth.uid();

  delete from auth.sessions where user_id = auth.uid();

  return private.deletion_due(requested);
end;
$$;

-- Keeps an account whose deletion is waiting, once its user signs in again.
-- Only a session that started after the request counts: the request ended
-- every older one, but their access tokens can outlive them by up to an
-- hour, and a tab left open on another device must not undo the request.
--
-- Returns when the account would have been deleted, or null when nothing
-- was cancelled.
create function public.resume_account()
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  with cancelled as (
    delete from private.deletion_requests as request
    where request.user_id = auth.uid()
      and exists (
        select 1
        from auth.sessions as signed_in
        where signed_in.user_id = request.user_id
          -- Compared as text, so a claim that is not a uuid matches nothing
          -- instead of failing the call.
          and signed_in.id::text = auth.jwt() ->> 'session_id'
          and signed_in.created_at > request.requested_at
      )
    returning request.requested_at
  )
  select private.deletion_due(cancelled.requested_at) from cancelled;
$$;

revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
revoke all on function public.resume_account() from public, anon;
grant execute on function public.resume_account() to authenticated;

-- While an account waits to be deleted, its share links open nothing, as if
-- they were gone already. Signing in again brings them back as they were.
-- Same signature, so the grants made when the function was created still hold.
create or replace function public.shared_garden(share_token uuid)
returns table (name text, plan jsonb, location jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gardens.name,
    private.public_plan(gardens.plan),
    case when garden_shares.show_location then gardens.location end,
    gardens.updated_at
  from public.garden_shares
  join public.gardens on gardens.id = garden_shares.garden_id
  where garden_shares.token = share_token
    and not exists (
      select 1 from private.deletion_requests as request where request.user_id = gardens.owner_id
    );
$$;

-- The export says, under `account`, when the user asked for their deletion
-- (null when they did not). Only a field is added, so `format` stays 1.
-- Same signature, so the grants stay.
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

-- Deletes the accounts whose 30 days are up. Every table that keeps
-- something about a user references it with `on delete cascade`, and the
-- audit log trigger takes their lines there, so nothing of them is left.
-- At most `batch` go per run, oldest request first, so a backlog is cleared
-- over several nights instead of in one long delete.
create function private.purge_deletion_requests(batch integer default 1000)
returns integer
language sql
volatile
set search_path = ''
as $$
  with removed as (
    delete from auth.users
    where id in (
      select request.user_id
      from private.deletion_requests as request
      where private.deletion_due(request.requested_at) < now()
      order by request.requested_at
      limit batch
    )
    returning 1
  )
  select count(*)::integer from removed;
$$;

comment on function private.purge_deletion_requests is 'Deletes the accounts that asked to be deleted more than 30 days ago. Run nightly by pg_cron.';

revoke all on function private.purge_deletion_requests(integer) from public, anon, authenticated;

-- Nightly, twenty minutes after the purge of stale guests. The test database
-- (PGlite) has no pg_cron, hence the check. Scheduling a job under a name
-- already taken replaces it, so this can run again.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'purge-deletion-requests',
      '37 3 * * *',
      'select private.purge_deletion_requests()'
    );
  end if;
end;
$$;
