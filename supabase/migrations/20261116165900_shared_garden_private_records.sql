-- A share link shows what was done in a garden and when, but not the owner's
-- notes or how much the garden gave.
--
-- The plan is trimmed here and not in the Worker: `shared_garden` is open to
-- `anon`, so anyone holding a token can call it without going through the
-- Worker, and would read whatever it returns.

-- A plan as a visitor may see it: no notes on the garden or on a planting, and
-- harvests with their day only. The app's `publicPlan` does the same; keep the
-- two alike.
--
-- The database does not check a plan's shape beyond its being an object, so
-- every part that is not shaped as expected is handed back as it is: a plan
-- the app would not read should still not make the link fail here.
create function private.public_plan(plan jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(plan -> 'plantings') is distinct from 'array' then plan - 'notes'
    else (plan - 'notes') || jsonb_build_object('plantings', coalesce((
      select jsonb_agg(
        case
          when jsonb_typeof(planting.value) is distinct from 'object' then planting.value
          when jsonb_typeof(planting.value -> 'harvests') is distinct from 'array'
            then planting.value - 'notes'
          else (planting.value - 'notes') || jsonb_build_object('harvests', coalesce((
            select jsonb_agg(
              case
                when jsonb_typeof(harvest.value) = 'object'
                  then harvest.value - 'quantity' - 'unit'
                else harvest.value
              end
              order by harvest.ordinality
            )
            from jsonb_array_elements(planting.value -> 'harvests') with ordinality as harvest
          ), '[]'::jsonb))
        end
        order by planting.ordinality
      )
      from jsonb_array_elements(plan -> 'plantings') with ordinality as planting
    ), '[]'::jsonb))
  end
$$;

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
  where garden_shares.token = share_token;
$$;
