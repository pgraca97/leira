-- Supabase pauses a free project after a week with little database activity,
-- and the landing page is static, so it does not count. The Worker's cron
-- calls this every six hours, so a quiet week, such as a holiday, does not
-- leave the next visitor with an app that cannot reach its server.
-- https://supabase.com/docs/guides/platform/free-project-pausing
--
-- It reads nothing and changes nothing, so anyone may call it: the cron has
-- no session and uses the publishable key.
create function public.keep_awake()
returns boolean
language sql
stable
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.keep_awake() from public;
grant execute on function public.keep_awake() to anon, authenticated;
