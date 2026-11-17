-- The privacy page promises that "Download my data" holds everything kept
-- about the user, and that deleting the account deletes it. Two things fell
-- outside that: what the auth server keeps about how and where the user signs
-- in, and its audit log, which outlived the account.

-- The export adds, under `account`, the ways the user signs in, what the
-- sign-in handed over (for Google: name, picture, email) and the sessions the
-- auth server keeps, with the browser and address they came from. Fields are
-- only added, never renamed or removed, so `format` stays 1: whatever reads
-- the older files reads these too. Same signature, so the grants stay.
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

-- The auth server's audit log keeps the user's email (`actor_username`) and
-- sometimes their IP address, but has no foreign key to `auth.users`, so
-- nothing cascades to it. This trigger deletes a user's lines with the user,
-- however they go: their own `delete_account`, the nightly purge of guests or
-- the Supabase dashboard.
--
-- It runs once per statement, with every deleted user at hand, so a purge of
-- ten thousand guests reads the audit log once instead of once per guest.
create function private.forget_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.audit_log_entries as entry
  where entry.payload ->> 'actor_id' in (select gone.id::text from deleted_users as gone);
  return null;
end;
$$;

revoke all on function private.forget_audit_log() from public, anon, authenticated;

create trigger on_auth_users_deleted
  after delete on auth.users
  referencing old table as deleted_users
  for each statement execute function private.forget_audit_log();

-- The trigger does not take every line. Deleting a user through the dashboard
-- or the admin API leaves a `user_deleted` line about them (their id and email
-- under `traits`, the actor being nobody), and lines about users deleted
-- before this migration are still there. So once a night, the
-- lines that name a user who no longer exists, as actor or under `traits`,
-- go too. Admin lines that name no user stay.
create function private.forget_departed_in_audit_log()
returns integer
language sql
volatile
set search_path = ''
as $$
  with swept as (
    delete from auth.audit_log_entries
    where id in (
      select entry.id
      from auth.audit_log_entries as entry
      cross join lateral (
        values (entry.payload ->> 'actor_id'), (entry.payload -> 'traits' ->> 'user_id')
      ) as named (user_id)
      where named.user_id is not null
        and named.user_id <> '00000000-0000-0000-0000-000000000000'
        and not exists (
          select 1 from auth.users as person where person.id::text = named.user_id
        )
    )
    returning 1
  )
  select count(*)::integer from swept;
$$;

revoke all on function private.forget_departed_in_audit_log() from public, anon, authenticated;

-- Ten minutes after the purge of stale guests, though the trigger already
-- took those. The test database (PGlite) has no pg_cron, hence the check.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule(
      'forget-departed-in-audit-log',
      '27 3 * * *',
      'select private.forget_departed_in_audit_log()'
    );
  end if;
end;
$$;
