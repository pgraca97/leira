-- Everyone may take their data with them and delete their account. Both act
-- only on the user who calls them, so they need no argument to check.

-- Everything kept about the caller, in one document. `format` says how to
-- read it, so a later import can tell old files from new ones.
create function public.export_my_data()
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

-- Deletes the caller's user. Every table that keeps something about a user
-- references it with `on delete cascade`, so the gardens, their links, the
-- profile and the activity days go with it.
create function public.delete_account()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
