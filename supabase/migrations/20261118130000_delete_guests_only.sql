-- Only a guest is deleted at once. An account waits 30 days after asking
-- (`request_account_deletion`), so a request made by mistake, or by someone
-- else on an unlocked device, can still be undone by signing in again.
--
-- `delete_account` kept deleting accounts too while the app that asks for
-- the 30 days was being deployed. That app is live, and it calls this for
-- guests only, so anyone calling it for an account was skipping the wait.
-- Same signature, so the grants made when the function was created still hold.
create or replace function public.delete_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.users as person where person.id = auth.uid() and person.is_anonymous
  ) then
    raise exception 'only a guest is deleted at once: an account asks with request_account_deletion'
      using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
