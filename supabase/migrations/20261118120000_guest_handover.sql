-- A guest who signs in to an account that already exists (an address or a
-- Google account used before, say on another device) becomes that account in
-- this browser. Their own user is left behind with their gardens, which
-- nobody could reach again. These functions hand those gardens over.
--
-- Before it leaves, the guest asks for a code, which the browser keeps. Once
-- signed in to the account, the browser hands the code back, and everything
-- the guest kept moves to the account, ids, share links and history
-- included. The code is the whole proof: only the browser that held the
-- guest's session has it.

-- One code per guest, the latest. It lives in `private`, out of the Data
-- API's reach: only the functions below read or write it.
create table private.guest_handovers (
  code uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table private.guest_handovers is 'Codes a guest left for the account they signed in to. Good for a day, used once.';

-- Asked by the guest just before it signs in to another user. Asking again
-- replaces the code, and codes nobody used within a day are cleared on the
-- way, so the table holds only what may still be taken.
create function public.offer_guest_handover()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  offered uuid;
begin
  if not exists (
    select 1 from auth.users as person where person.id = auth.uid() and person.is_anonymous
  ) then
    raise exception 'only a guest can hand over their gardens' using errcode = '42501';
  end if;

  delete from private.guest_handovers as handover
  where handover.guest_id = auth.uid()
    or handover.created_at < now() - interval '1 day';

  insert into private.guest_handovers (guest_id) values (auth.uid())
  returning code into offered;
  return offered;
end;
$$;

-- Asked by the account the guest signed in to. Moves the guest's gardens and
-- templates to the caller and deletes the guest, who has nothing left. A code
-- that is unknown, used or older than a day moves nothing, and nor does one
-- whose guest has become an account since: what is theirs stays theirs.
--
-- Moving a garden counts as saving it, so its version and its date move on
-- (see `bump_garden_version`), and a tab still open on it as the guest is
-- told to load it again. Templates are moved, not saved anew, so the account
-- may end up with more than fifty: it then only cannot save more.
create function public.claim_guest_handover(handover_code uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  guest uuid;
  moved_gardens integer;
  moved_templates integer;
begin
  if not exists (
    select 1 from auth.users as person where person.id = auth.uid() and not person.is_anonymous
  ) then
    raise exception 'only an account can take over a guest''s gardens' using errcode = '42501';
  end if;

  delete from private.guest_handovers as handover
  where handover.code = handover_code
    and handover.created_at >= now() - interval '1 day'
  returning handover.guest_id into guest;

  if guest is null or not exists (
    select 1 from auth.users as person where person.id = guest and person.is_anonymous
  ) then
    return jsonb_build_object('gardens', 0, 'templates', 0);
  end if;

  update public.gardens set owner_id = auth.uid() where owner_id = guest;
  get diagnostics moved_gardens = row_count;
  update public.templates set owner_id = auth.uid() where owner_id = guest;
  get diagnostics moved_templates = row_count;

  -- Every table that keeps something about a user cascades from it, and the
  -- audit log trigger takes the guest's lines.
  delete from auth.users where id = guest;

  return jsonb_build_object('gardens', moved_gardens, 'templates', moved_templates);
end;
$$;

revoke all on function public.offer_guest_handover() from public, anon;
grant execute on function public.offer_guest_handover() to authenticated;
revoke all on function public.claim_guest_handover(uuid) from public, anon;
grant execute on function public.claim_guest_handover(uuid) to authenticated;
