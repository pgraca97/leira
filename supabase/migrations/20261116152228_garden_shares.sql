-- A read-only link to a garden, for people who are not signed in.
--
-- The link carries a token nobody could guess. A share is its own row, not a
-- column of the garden, so making or dropping a link does not move the
-- garden's version on under an open editor.

create table public.garden_shares (
  garden_id uuid primary key references public.gardens (id) on delete cascade,
  -- Always from the default: a client that could choose it could choose a weak one.
  token uuid not null unique default gen_random_uuid(),
  -- A garden's location is private unless its owner says otherwise.
  show_location boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.garden_shares is 'The read-only link to a garden, if it has one. Owner-only.';

alter table public.garden_shares enable row level security;

-- The gardens these policies look into are already limited to their owner,
-- but the owner is checked here as well, so this table does not lean on that.

create policy "Owners can read their gardens' shares"
  on public.garden_shares for select
  to authenticated
  using (
    exists (
      select 1 from public.gardens
      where gardens.id = garden_id and gardens.owner_id = (select auth.uid())
    )
  );

create policy "Owners can share their gardens"
  on public.garden_shares for insert
  to authenticated
  with check (
    exists (
      select 1 from public.gardens
      where gardens.id = garden_id and gardens.owner_id = (select auth.uid())
    )
  );

create policy "Owners can change their gardens' shares"
  on public.garden_shares for update
  to authenticated
  using (
    exists (
      select 1 from public.gardens
      where gardens.id = garden_id and gardens.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.gardens
      where gardens.id = garden_id and gardens.owner_id = (select auth.uid())
    )
  );

create policy "Owners can stop sharing their gardens"
  on public.garden_shares for delete
  to authenticated
  using (
    exists (
      select 1 from public.gardens
      where gardens.id = garden_id and gardens.owner_id = (select auth.uid())
    )
  );

-- The owner picks the garden and whether its location shows. The token and
-- the date always come from defaults, and a share never moves to another garden.
grant select, delete on public.garden_shares to authenticated;
grant insert (garden_id, show_location) on public.garden_shares to authenticated;
grant update (show_location) on public.garden_shares to authenticated;

-- What a link opens: the garden's name and plan as they are now, and its
-- location only when the owner allowed it. Never its id or its owner.
--
-- Runs as the function owner, because the visitor has no access to either
-- table: the token is the whole permission, and this is the one way in.
create function public.shared_garden(share_token uuid)
returns table (name text, plan jsonb, location jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gardens.name,
    gardens.plan,
    case when garden_shares.show_location then gardens.location end,
    gardens.updated_at
  from public.garden_shares
  join public.gardens on gardens.id = garden_shares.garden_id
  where garden_shares.token = share_token;
$$;

comment on function public.shared_garden is 'The garden behind a share link. Called by the Worker for visitors with no session.';

-- Only the Worker calls it, with no session, so only `anon` may.
revoke all on function public.shared_garden(uuid) from public;
grant execute on function public.shared_garden(uuid) to anon;
