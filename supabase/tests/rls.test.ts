import { readdirSync, readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

/**
 * Runs the migrations on an in-process Postgres (PGlite) and checks who can do
 * what. It needs no Docker, so it runs on every push.
 *
 * The roles, the `auth` schema and `auth.uid()` come from the Supabase
 * platform; the stand-ins below mimic them. Sign-in, the Data API and the real
 * auth schema are covered by the integration test in apps/web.
 */
const PLATFORM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    is_anonymous boolean not null default false,
    created_at timestamptz not null default now(),
    last_sign_in_at timestamptz,
    raw_user_meta_data jsonb
  );
  create table auth.identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    provider text not null,
    created_at timestamptz
  );
  create table auth.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz,
    updated_at timestamptz,
    refreshed_at timestamp,
    user_agent text,
    ip inet
  );
  create table auth.audit_log_entries (
    instance_id uuid,
    id uuid primary key,
    payload json,
    created_at timestamptz,
    ip_address varchar(64) not null default ''
  );
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
`

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url)
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(new URL(file, MIGRATIONS_DIR), "utf8"))

const PLAN = JSON.stringify({
  schemaVersion: 1,
  widthCm: 600,
  heightCm: 400,
  cellCm: 10,
  beds: [],
  plantings: [],
})

let db: PGlite
let alice: string
let bob: string
let gardenId: string

/**
 * Acts as a signed-in user, the way the Data API does for each request. The
 * token's claims name the session it was issued for, when there is one.
 */
async function signInAs(userId: string, sessionId?: string): Promise<void> {
  await db.exec("reset role")
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: userId, role: "authenticated", session_id: sessionId }),
  ])
  await db.exec("set role authenticated")
}

async function signOut(): Promise<void> {
  await db.exec("reset role")
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
  await db.query("select set_config('request.jwt.claims', '', false)")
  await db.exec("set role anon")
}

/** Makes a user a guest: only a guest deletes their user at once, an account waits 30 days. */
async function makeGuest(userId: string): Promise<void> {
  await db.exec("reset role")
  await db.query("update auth.users set is_anonymous = true where id = $1", [userId])
}

async function createUser(): Promise<string> {
  const result = await db.query<{ id: string }>(
    "insert into auth.users default values returning id"
  )
  return result.rows[0]!.id
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(PLATFORM)
  for (const migration of MIGRATIONS) await db.exec(migration)
})

// Each test runs in a transaction that is rolled back, so tests cannot see
// each other's rows, roles or settings.
beforeEach(async () => {
  await db.exec("begin")

  alice = await createUser()
  bob = await createUser()

  await signInAs(alice)
  const created = await db.query<{ id: string }>(
    "insert into public.gardens (name, plan) values ('Alice''s garden', $1) returning id",
    [PLAN]
  )
  gardenId = created.rows[0]!.id
})

afterEach(async () => {
  await db.exec("rollback")
})

describe("gardens", () => {
  it("belong to the user who created them, starting at version 1", async () => {
    const result = await db.query<{ owner_id: string; version: number }>(
      "select owner_id, version from public.gardens where id = $1",
      [gardenId]
    )
    expect(result.rows).toEqual([{ owner_id: alice, version: 1 }])
  })

  it("are invisible to other users", async () => {
    await signInAs(bob)
    const result = await db.query("select id from public.gardens")
    expect(result.rows).toEqual([])
  })

  it("cannot be updated or deleted by other users", async () => {
    await signInAs(bob)
    const updated = await db.query(
      "update public.gardens set name = 'Taken' where id = $1 returning id",
      [gardenId]
    )
    const deleted = await db.query("delete from public.gardens where id = $1 returning id", [
      gardenId,
    ])
    expect(updated.rows).toEqual([])
    expect(deleted.rows).toEqual([])

    await signInAs(alice)
    const kept = await db.query<{ name: string }>("select name from public.gardens")
    expect(kept.rows).toEqual([{ name: "Alice's garden" }])
  })

  it("cannot be created on behalf of someone else", async () => {
    await signInAs(bob)
    await expect(
      db.query("insert into public.gardens (name, plan, owner_id) values ('Planted', $1, $2)", [
        PLAN,
        alice,
      ])
    ).rejects.toThrow(/permission denied/)
  })

  it("cannot be handed to another user", async () => {
    await expect(
      db.query("update public.gardens set owner_id = $1 where id = $2", [bob, gardenId])
    ).rejects.toThrow(/permission denied/)
  })

  it("are closed to visitors who are not signed in", async () => {
    await signOut()
    await expect(db.query("select id from public.gardens")).rejects.toThrow(/permission denied/)
  })

  it("are removed together with their owner", async () => {
    await db.exec("reset role")
    await db.query("delete from auth.users where id = $1", [alice])
    const left = await db.query("select id from public.gardens")
    expect(left.rows).toEqual([])
  })
})

describe("garden versions", () => {
  it("go up by one on every save", async () => {
    const saved = await db.query<{ version: number }>(
      "update public.gardens set plan = $1 where id = $2 and version = 1 returning version",
      [PLAN, gardenId]
    )
    expect(saved.rows).toEqual([{ version: 2 }])
  })

  it("make a save from a stale copy match nothing", async () => {
    await db.query("update public.gardens set plan = $1 where id = $2 and version = 1", [
      PLAN,
      gardenId,
    ])
    const stale = await db.query(
      "update public.gardens set plan = $1 where id = $2 and version = 1 returning version",
      [PLAN, gardenId]
    )
    expect(stale.rows).toEqual([])
  })

  it("cannot be set by the client", async () => {
    await expect(
      db.query("update public.gardens set version = 99 where id = $1", [gardenId])
    ).rejects.toThrow(/permission denied/)
  })
})

describe("garden data checks", () => {
  it("reject a plan that is not a JSON object", async () => {
    await expect(
      db.query("insert into public.gardens (name, plan) values ('List', '[]')")
    ).rejects.toThrow(/gardens_plan_check/)
  })

  it("reject a plan over 512 KB", async () => {
    await expect(
      db.query(
        "insert into public.gardens (name, plan) values ('Huge', jsonb_build_object('pad', repeat('x', 600000)))"
      )
    ).rejects.toThrow(/gardens_plan_check/)
  })

  it("reject an empty name", async () => {
    await expect(
      db.query("insert into public.gardens (name, plan) values ('', $1)", [PLAN])
    ).rejects.toThrow(/gardens_name_check/)
  })

  it("accept a location on the globe", async () => {
    const saved = await db.query<{ location: unknown }>(
      "update public.gardens set location = $1 where id = $2 returning location",
      [JSON.stringify({ lat: 38.72, lon: -9.14, name: "Lisboa" }), gardenId]
    )
    expect(saved.rows[0]?.location).toEqual({ lat: 38.72, lon: -9.14, name: "Lisboa" })
  })

  it.each([
    ["a latitude off the globe", { lat: 123, lon: 0 }],
    ["a longitude off the globe", { lat: 0, lon: -200 }],
    ["a coordinate that is not a number", { lat: "north", lon: 0 }],
    ["a missing longitude", { lat: 38.72 }],
  ])("reject %s", async (_case, location) => {
    await expect(
      db.query("update public.gardens set location = $1 where id = $2", [
        JSON.stringify(location),
        gardenId,
      ])
    ).rejects.toThrow(/gardens_location_check/)
  })
})

describe("garden shares", () => {
  async function share(showLocation = false): Promise<string> {
    const created = await db.query<{ token: string }>(
      "insert into public.garden_shares (garden_id, show_location) values ($1, $2) returning token",
      [gardenId, showLocation]
    )
    return created.rows[0]!.token
  }

  it("give a garden a link token that nobody could guess, hiding the location at first", async () => {
    const created = await db.query<{ token: string; show_location: boolean }>(
      "insert into public.garden_shares (garden_id) values ($1) returning token, show_location",
      [gardenId]
    )
    expect(created.rows[0]?.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/)
    expect(created.rows[0]?.show_location).toBe(false)
  })

  // A failed statement ends the test's transaction, so each refusal has its own test.
  it("cannot have their token chosen by the client", async () => {
    await expect(
      db.query(
        "insert into public.garden_shares (garden_id, token) values ($1, gen_random_uuid())",
        [gardenId]
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("cannot have their token changed by the client", async () => {
    await share()
    await expect(
      db.query("update public.garden_shares set token = gen_random_uuid()")
    ).rejects.toThrow(/permission denied/)
  })

  it("cannot be moved to another garden", async () => {
    await share()
    await expect(
      db.query("update public.garden_shares set garden_id = gen_random_uuid()")
    ).rejects.toThrow(/permission denied/)
  })

  it("are one to a garden", async () => {
    await share()
    await expect(share()).rejects.toThrow(/garden_shares_pkey/)
  })

  it("let the owner show the location, and stop sharing", async () => {
    await share()
    const shown = await db.query<{ show_location: boolean }>(
      "update public.garden_shares set show_location = true where garden_id = $1 returning show_location",
      [gardenId]
    )
    expect(shown.rows).toEqual([{ show_location: true }])

    await db.query("delete from public.garden_shares where garden_id = $1", [gardenId])
    const left = await db.query("select token from public.garden_shares")
    expect(left.rows).toEqual([])
  })

  it("cannot be created for someone else's garden", async () => {
    await signInAs(bob)
    await expect(
      db.query("insert into public.garden_shares (garden_id) values ($1)", [gardenId])
    ).rejects.toThrow(/row-level security/)
  })

  it("cannot be read, changed or removed by other users", async () => {
    await share()
    await signInAs(bob)
    const read = await db.query("select token from public.garden_shares")
    const changed = await db.query(
      "update public.garden_shares set show_location = true returning token"
    )
    const removed = await db.query("delete from public.garden_shares returning token")
    expect(read.rows).toEqual([])
    expect(changed.rows).toEqual([])
    expect(removed.rows).toEqual([])

    await signInAs(alice)
    const kept = await db.query<{ show_location: boolean }>(
      "select show_location from public.garden_shares"
    )
    expect(kept.rows).toEqual([{ show_location: false }])
  })

  it("are closed to visitors who are not signed in", async () => {
    await share()
    await signOut()
    await expect(db.query("select token from public.garden_shares")).rejects.toThrow(
      /permission denied/
    )
  })

  it("are removed together with their garden", async () => {
    await share()
    await db.query("delete from public.gardens where id = $1", [gardenId])
    await db.exec("reset role")
    const left = await db.query("select token from public.garden_shares")
    expect(left.rows).toEqual([])
  })
})

describe("a shared garden", () => {
  const LOCATION = { lat: 41.55, lon: -8.43, name: "Braga" }

  async function share(showLocation: boolean): Promise<string> {
    await db.query("update public.gardens set location = $1 where id = $2", [
      JSON.stringify(LOCATION),
      gardenId,
    ])
    const created = await db.query<{ token: string }>(
      "insert into public.garden_shares (garden_id, show_location) values ($1, $2) returning token",
      [gardenId, showLocation]
    )
    return created.rows[0]!.token
  }

  const open = (token: string) =>
    db.query<Record<string, unknown>>("select * from public.shared_garden($1)", [token])

  it("opens with its link for a visitor who is not signed in, without its location", async () => {
    const token = await share(false)
    await signOut()
    const shared = await open(token)
    expect(shared.rows).toEqual([
      {
        name: "Alice's garden",
        plan: JSON.parse(PLAN),
        location: null,
        updated_at: expect.any(Date),
      },
    ])
  })

  it("says where it is only when its owner chose to show that", async () => {
    const token = await share(true)
    await signOut()
    const shared = await open(token)
    expect(shared.rows[0]?.location).toEqual(LOCATION)
  })

  it("shows the garden as it is now, not as it was when shared", async () => {
    const token = await share(false)
    await db.query("update public.gardens set name = 'Renamed' where id = $1", [gardenId])
    await signOut()
    expect((await open(token)).rows[0]?.name).toBe("Renamed")
  })

  /** Gives Alice's garden a plan of any shape: the database only asks for an object. */
  async function setPlan(plan: unknown): Promise<void> {
    await signInAs(alice)
    await db.query("update public.gardens set plan = $1 where id = $2", [
      JSON.stringify(plan),
      gardenId,
    ])
  }

  it("keeps the owner's notes and harvest amounts to the owner", async () => {
    const token = await share(false)
    const planned = {
      id: "b",
      plantId: "onion",
      inGround: { from: "2026-01-29", to: "2026-07-15" },
    }
    await setPlan({
      ...JSON.parse(PLAN),
      notes: "The well ran dry in July.",
      plantings: [
        {
          id: "a",
          plantId: "tomato",
          planted: true,
          notes: "Blight in August.",
          harvests: [{ date: "2026-07-12", quantity: 1.2, unit: "kg" }, { date: "2026-07-20" }],
        },
        planned,
      ],
    })
    await signOut()
    const shared = await open(token)
    expect(shared.rows[0]?.plan).toEqual({
      ...JSON.parse(PLAN),
      plantings: [
        {
          id: "a",
          plantId: "tomato",
          planted: true,
          harvests: [{ date: "2026-07-12" }, { date: "2026-07-20" }],
        },
        planned,
      ],
    })
  })

  it.each([
    ["no plantings", {}, {}],
    ["plantings that are not a list", { plantings: "none", notes: "n" }, { plantings: "none" }],
    [
      "plantings and harvests of the wrong kind",
      { plantings: [7, { notes: "n", harvests: "x" }, { harvests: [7, { quantity: 1 }] }] },
      { plantings: [7, { harvests: "x" }, { harvests: [7, {}] }] },
    ],
  ])("still opens a garden whose plan has %s", async (_case, plan, expected) => {
    const token = await share(false)
    await setPlan(plan)
    await signOut()
    const shared = await open(token)
    expect(shared.rows.map((row) => row.plan)).toEqual([expected])
  })

  it("does not open with a link nobody made", async () => {
    await share(false)
    await signOut()
    const shared = await open("11111111-1111-4111-8111-111111111111")
    expect(shared.rows).toEqual([])
  })

  it("stops opening once its owner stops sharing, and a new link is a different one", async () => {
    const token = await share(false)
    await db.query("delete from public.garden_shares where garden_id = $1", [gardenId])
    const again = await db.query<{ token: string }>(
      "insert into public.garden_shares (garden_id) values ($1) returning token",
      [gardenId]
    )
    expect(again.rows[0]?.token).not.toBe(token)

    await signOut()
    expect((await open(token)).rows).toEqual([])
  })

  it("leaves the gardens themselves closed to the visitor", async () => {
    await share(true)
    await signOut()
    await expect(db.query("select id from public.gardens")).rejects.toThrow(/permission denied/)
  })

  it("is opened through the Worker only, not by signed-in users directly", async () => {
    const token = await share(false)
    await signInAs(bob)
    await expect(open(token)).rejects.toThrow(/permission denied/)
  })
})

describe("garden calendars", () => {
  async function turnOn(garden = gardenId): Promise<string> {
    const created = await db.query<{ token: string }>(
      "insert into public.garden_calendars (garden_id) values ($1) returning token",
      [garden]
    )
    return created.rows[0]!.token
  }

  const read = (token: string) =>
    db.query<Record<string, unknown>>("select * from public.garden_calendar($1)", [token])

  it("give a garden a link token that nobody could guess", async () => {
    expect(await turnOn()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/)
  })

  // A failed statement ends the test's transaction, so each refusal has its own test.
  it("cannot have their token chosen by the client", async () => {
    await expect(
      db.query(
        "insert into public.garden_calendars (garden_id, token) values ($1, gen_random_uuid())",
        [gardenId]
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("cannot be changed once made", async () => {
    await turnOn()
    await expect(
      db.query("update public.garden_calendars set token = gen_random_uuid()")
    ).rejects.toThrow(/permission denied/)
  })

  it("are one to a garden", async () => {
    await turnOn()
    await expect(turnOn()).rejects.toThrow(/garden_calendars_pkey/)
  })

  it("cannot be made for someone else's garden", async () => {
    await signInAs(bob)
    await expect(turnOn()).rejects.toThrow(/row-level security/)
  })

  it("cannot be read or turned off by other users", async () => {
    await turnOn()
    await signInAs(bob)
    expect((await db.query("select token from public.garden_calendars")).rows).toEqual([])
    expect((await db.query("delete from public.garden_calendars returning token")).rows).toEqual([])

    await signInAs(alice)
    expect((await db.query("select token from public.garden_calendars")).rows).toHaveLength(1)
  })

  it("are closed to visitors who are not signed in", async () => {
    await turnOn()
    await signOut()
    await expect(db.query("select token from public.garden_calendars")).rejects.toThrow(
      /permission denied/
    )
  })

  it("read the garden's name and plan for a caller with no session", async () => {
    const token = await turnOn()
    await signOut()
    expect((await read(token)).rows).toEqual([{ name: "Alice's garden", plan: JSON.parse(PLAN) }])
  })

  it("keep the owner's notes and harvest amounts out", async () => {
    const token = await turnOn()
    await db.query("update public.gardens set plan = $1 where id = $2", [
      JSON.stringify({
        ...JSON.parse(PLAN),
        notes: "The well ran dry in July.",
        plantings: [
          {
            id: "a",
            plantId: "tomato",
            notes: "Blight in August.",
            harvests: [{ date: "2026-07-12", quantity: 1.2, unit: "kg" }],
          },
        ],
      }),
      gardenId,
    ])
    await signOut()
    expect((await read(token)).rows[0]?.plan).toEqual({
      ...JSON.parse(PLAN),
      plantings: [{ id: "a", plantId: "tomato", harvests: [{ date: "2026-07-12" }] }],
    })
  })

  it("read nothing with a token nobody made", async () => {
    await turnOn()
    await signOut()
    expect((await read("11111111-1111-4111-8111-111111111111")).rows).toEqual([])
  })

  it("read nothing once turned off, and a new link is a different one", async () => {
    const token = await turnOn()
    await db.query("delete from public.garden_calendars where garden_id = $1", [gardenId])
    expect(await turnOn()).not.toBe(token)
    await signOut()
    expect((await read(token)).rows).toEqual([])
  })

  it("are read through the Worker only, not by signed-in users directly", async () => {
    const token = await turnOn()
    await signInAs(bob)
    await expect(read(token)).rejects.toThrow(/permission denied/)
  })

  it("are removed together with their garden", async () => {
    await turnOn()
    await db.query("delete from public.gardens where id = $1", [gardenId])
    await db.exec("reset role")
    expect((await db.query("select token from public.garden_calendars")).rows).toEqual([])
  })

  it("do not move the garden's version on", async () => {
    await turnOn()
    const garden = await db.query<{ version: number }>(
      "select version from public.gardens where id = $1",
      [gardenId]
    )
    expect(garden.rows).toEqual([{ version: 1 }])
  })
})

describe("profiles", () => {
  it("are created for every new user", async () => {
    await db.exec("reset role")
    const result = await db.query<{ id: string }>("select id from public.profiles order by id")
    expect(result.rows.map((row) => row.id)).toEqual([alice, bob].sort())
  })

  it("are readable only by their user", async () => {
    const result = await db.query<{ id: string }>("select id from public.profiles")
    expect(result.rows).toEqual([{ id: alice }])
  })

  it("let users change their own language, and only theirs", async () => {
    const updated = await db.query<{ id: string; locale: string }>(
      "update public.profiles set locale = 'pt' returning id, locale"
    )
    expect(updated.rows).toEqual([{ id: alice, locale: "pt" }])
  })

  it("reject a language the app does not have", async () => {
    await expect(db.query("update public.profiles set locale = 'xx'")).rejects.toThrow(
      /profiles_locale_check/
    )
  })

  it("cannot be moved to another user", async () => {
    await expect(db.query("update public.profiles set id = $1", [bob])).rejects.toThrow(
      /permission denied/
    )
  })
})

/** Lets a user read the usage stats. Done by hand in production, as the database owner. */
async function makeAdmin(userId: string): Promise<void> {
  await db.exec("reset role")
  await db.query("insert into private.admins (user_id) values ($1)", [userId])
}

/** Gives a user a day of activity, `daysAgo` days before today (UTC). */
async function wasActive(userId: string, daysAgo: number): Promise<void> {
  await db.exec("reset role")
  await db.query(
    "insert into private.activity_days (user_id, day) values ($1, (now() at time zone 'utc')::date - $2::int)",
    [userId, daysAgo]
  )
}

/** A line in the auth server's audit log about something `userId` did, with their email in it. */
async function audited(userId: string): Promise<void> {
  await db.exec("reset role")
  await db.query(
    `insert into auth.audit_log_entries (id, payload, created_at, ip_address)
     values (gen_random_uuid(), json_build_object('actor_id', $1::text, 'actor_username', 'someone@example.com', 'action', 'login'), now(), '203.0.113.7')`,
    [userId]
  )
}

/** Whose lines are left in the audit log, one entry per line. */
async function auditedUsers(): Promise<string[]> {
  await db.exec("reset role")
  const result = await db.query<{ id: string }>(
    "select payload ->> 'actor_id' as id from auth.audit_log_entries order by id"
  )
  return result.rows.map((row) => row.id)
}

describe("visits", () => {
  it("are recorded once a day for the signed-in user", async () => {
    await db.query("select public.record_visit()")
    await db.query("select public.record_visit()")
    await db.exec("reset role")
    const days = await db.query<{ user_id: string; today: boolean }>(
      "select user_id, day = (now() at time zone 'utc')::date as today from private.activity_days"
    )
    expect(days.rows).toEqual([{ user_id: alice, today: true }])
  })

  it("cannot be recorded by visitors who are not signed in", async () => {
    await signOut()
    await expect(db.query("select public.record_visit()")).rejects.toThrow(/permission denied/)
  })

  it("cannot be read by users", async () => {
    await db.query("select public.record_visit()")
    await expect(db.query("select * from private.activity_days")).rejects.toThrow(
      /permission denied/
    )
  })

  it("are removed together with their user", async () => {
    await db.query("select public.record_visit()")
    await db.exec("reset role")
    await db.query("delete from auth.users where id = $1", [alice])
    const left = await db.query("select user_id from private.activity_days")
    expect(left.rows).toEqual([])
  })
})

describe("usage stats", () => {
  interface Week {
    weekStart: string
    newPeople: number
    active: number
    returning: number
  }
  interface UsageStats {
    generatedAt: string
    people: { guests: number; accounts: number; withGarden: number; accountsWithGarden: number }
    gardens: {
      total: number
      editedLast7Days: number
      editedLast30Days: number
      shared: number
      withCalendar: number
      withLocation: number
      withPlantings: number
      withRecords: number
      recordedLast7Days: number
      severalYears: number
    }
    weeks: Week[]
    limits: { databaseBytes: number; monthlyUsers: number }
  }

  async function usageStats(): Promise<UsageStats> {
    const result = await db.query<{ stats: UsageStats }>("select public.usage_stats() as stats")
    return result.rows[0]!.stats
  }

  /** Monday of the current week and the ones before it, as the stats name them. */
  async function weekStart(weeksAgo: number): Promise<string> {
    const result = await db.query<{ day: string }>(
      "select to_char(date_trunc('week', (now() at time zone 'utc')::date) - make_interval(weeks => $1::int), 'YYYY-MM-DD') as day",
      [weeksAgo]
    )
    return result.rows[0]!.day
  }

  it("are refused to users who are not admins", async () => {
    await expect(usageStats()).rejects.toThrow(/admins only/)
  })

  it("are refused to visitors who are not signed in", async () => {
    await signOut()
    await expect(usageStats()).rejects.toThrow(/permission denied/)
  })

  it("count people and gardens, leaving the admins out", async () => {
    await makeAdmin(alice)
    await db.query("insert into auth.users (is_anonymous) values (true)")
    await db.query("insert into auth.users default values")
    // Bob's gardens: one edited today, shared, with a location; one 10 days
    // ago; one 40 days ago. The stats see dates the client cannot set.
    const bobs = await db.query<{ id: string }>(
      `insert into public.gardens (owner_id, name, plan, location, updated_at) values
         ($1, 'Today', $2, '{"lat": 41.55, "lon": -8.43}', now()),
         ($1, 'Ten days ago', $2, null, now() - interval '10 days'),
         ($1, 'Forty days ago', $2, null, now() - interval '40 days')
       returning id`,
      [bob, PLAN]
    )
    await db.query("insert into public.garden_shares (garden_id) values ($1)", [bobs.rows[0]!.id])
    await db.query("insert into public.garden_calendars (garden_id) values ($1)", [
      bobs.rows[1]!.id,
    ])

    await signInAs(alice)
    const stats = await usageStats()
    expect(stats.people).toEqual({ guests: 1, accounts: 2, withGarden: 1, accountsWithGarden: 1 })
    expect(stats.gardens).toMatchObject({
      total: 3,
      editedLast7Days: 1,
      editedLast30Days: 2,
      shared: 1,
      withCalendar: 1,
      withLocation: 1,
    })
  })

  it("count the people with a garden who have an account, guests apart", async () => {
    await makeAdmin(alice)
    const guest = await createUser()
    await makeGuest(guest)
    await db.query("insert into public.gardens (owner_id, name, plan) values ($1, 'Guest', $2)", [
      guest,
      PLAN,
    ])
    await db.query("insert into public.gardens (owner_id, name, plan) values ($1, 'Bob', $2)", [
      bob,
      PLAN,
    ])

    await signInAs(alice)
    const people = (await usageStats()).people
    expect(people.withGarden).toBe(2)
    expect(people.accountsWithGarden).toBe(1)
  })

  describe("of what is planted and recorded", () => {
    /** The day `daysAgo` days before today in UTC, as the plan writes it. */
    function dayAgo(daysAgo: number): string {
      return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
    }

    /** A crop that is only planned, in the ground on the day `from`. */
    function crop(from: string, fields: Record<string, unknown> = {}) {
      return {
        id: crypto.randomUUID(),
        plantId: "lettuce",
        rect: { x: 0, y: 0, w: 30, h: 30 },
        layout: "single",
        inGround: { from, to: from },
        ...fields,
      }
    }

    /** Gives Bob a garden with these plantings, as the stored plan holds them. */
    async function bobsGarden(plantings: unknown): Promise<void> {
      await db.exec("reset role")
      await db.query("insert into public.gardens (owner_id, name, plan) values ($1, 'Bob', $2)", [
        bob,
        JSON.stringify({ ...JSON.parse(PLAN), plantings }),
      ])
    }

    async function gardens(): Promise<UsageStats["gardens"]> {
      await signInAs(alice)
      return (await usageStats()).gardens
    }

    beforeEach(async () => {
      await makeAdmin(alice)
    })

    it("count gardens with crops, recorded or not", async () => {
      await bobsGarden([])
      await bobsGarden([crop("2027-03-01")])
      expect(await gardens()).toMatchObject({ total: 2, withPlantings: 1, withRecords: 0 })
    })

    it.each([
      ["in the ground", { planted: true }],
      ["out of the ground", { cleared: true }],
      ["sown under cover", { sowDate: "2025-02-01" }],
      ["harvested", { harvests: [{ date: "2025-06-01" }] }],
    ])("count a garden with a crop marked %s as recorded", async (_, marks) => {
      await bobsGarden([crop("2025-03-01", marks)])
      await bobsGarden([crop("2025-03-01", { harvests: [] })])
      expect(await gardens()).toMatchObject({ withRecords: 1, recordedLast7Days: 0 })
    })

    it.each([
      ["put in the ground", (day: string) => crop(day, { planted: true })],
      [
        "taken out",
        (day: string) => ({
          ...crop("2025-03-01"),
          inGround: { from: "2025-03-01", to: day },
          cleared: true,
        }),
      ],
      ["sown under cover", (day: string) => crop("2027-03-01", { sowDate: day })],
      [
        "harvested",
        (day: string) => crop("2025-03-01", { harvests: [{ date: "2025-04-01" }, { date: day }] }),
      ],
    ])("count a crop %s in the last 7 days by the day it names", async (_, recordedOn) => {
      await bobsGarden([recordedOn(dayAgo(0))])
      await bobsGarden([recordedOn(dayAgo(6))])
      await bobsGarden([recordedOn(dayAgo(7))])
      expect(await gardens()).toMatchObject({ withRecords: 3, recordedLast7Days: 2 })
    })

    it("do not count a planned crop as recorded because its days are recent", async () => {
      await bobsGarden([crop(dayAgo(1))])
      expect(await gardens()).toMatchObject({ withRecords: 0, recordedLast7Days: 0 })
    })

    it("count gardens whose crops go into the ground in more than one year", async () => {
      await bobsGarden([crop("2026-03-01"), crop("2026-09-01")])
      await bobsGarden([crop("2026-03-01"), crop("2027-03-01")])
      // Garlic planted in the autumn and lifted next summer is one season.
      await bobsGarden([
        { ...crop("2026-11-01"), inGround: { from: "2026-11-01", to: "2027-06-30" } },
      ])
      expect(await gardens()).toMatchObject({ severalYears: 1 })
    })

    it("are not stopped by a plan whose crops have an unexpected shape", async () => {
      // The database stores any object as a plan: only the app checks its shape.
      await bobsGarden("lots")
      await bobsGarden([42, crop("2025-03-01", { harvests: "many", sowDate: 7 })])
      await bobsGarden([crop("not a date", { planted: true })])
      expect(await gardens()).toMatchObject({ total: 3, withPlantings: 2, withRecords: 2 })
    })
  })

  it("give twelve weeks, oldest first, ending with this one", async () => {
    await makeAdmin(alice)
    await signInAs(alice)
    const weeks = (await usageStats()).weeks
    expect(weeks).toHaveLength(12)
    expect(weeks[0]?.weekStart).toBe(await weekStart(11))
    expect(weeks[11]?.weekStart).toBe(await weekStart(0))
  })

  it("count who was active each week and who came back", async () => {
    await makeAdmin(alice)
    const carol = await createUser()
    await wasActive(alice, 0)
    await wasActive(bob, 0)
    await wasActive(carol, 0)
    // Bob was also here two weeks ago, so this week he came back.
    await db.query(
      "insert into private.activity_days (user_id, day) values ($1, date_trunc('week', (now() at time zone 'utc')::date)::date - 14)",
      [bob]
    )

    await signInAs(alice)
    const weeks = (await usageStats()).weeks
    expect(weeks[11]).toEqual({
      weekStart: await weekStart(0),
      newPeople: 2,
      active: 2,
      returning: 1,
    })
    expect(weeks[9]).toEqual({
      weekStart: await weekStart(2),
      newPeople: 0,
      active: 1,
      returning: 0,
    })
  })

  it("estimate the monthly users with everyone in, admins too", async () => {
    await makeAdmin(alice)
    const carol = await createUser()
    await wasActive(alice, 0)
    await wasActive(bob, 20)
    await wasActive(carol, 40)

    await signInAs(alice)
    const limits = (await usageStats()).limits
    expect(limits.monthlyUsers).toBe(2)
    expect(limits.databaseBytes).toBeGreaterThan(0)
  })

  it("keep the list of admins out of the users' reach", async () => {
    await expect(db.query("select * from private.admins")).rejects.toThrow(/permission denied/)
  })
})

describe("a user's own data", () => {
  interface Export {
    format: number
    exportedAt: string
    account: {
      email: string | null
      createdAt: string
      signInMethods: { provider: string; addedAt: string }[]
      fromSignIn: Record<string, unknown> | null
      sessions: {
        createdAt: string
        lastActiveAt: string | null
        userAgent: string | null
        ip: string | null
      }[]
    }
    profile: { displayName: string | null; locale: string }
    gardens: {
      name: string
      plan: unknown
      location: unknown
      version: number
      createdAt: string
      updatedAt: string
      share: { token: string; showLocation: boolean } | null
      calendar: { token: string } | null
    }[]
    activityDays: string[]
  }

  async function exportMine(): Promise<Export> {
    const result = await db.query<{ data: Export }>("select public.export_my_data() as data")
    return result.rows[0]!.data
  }

  it("is handed over whole, gardens, links and days included", async () => {
    await db.exec("reset role")
    await db.query("update auth.users set email = 'alice@example.com' where id = $1", [alice])
    await signInAs(alice)
    await db.query("update public.gardens set location = $1 where id = $2", [
      JSON.stringify({ lat: 41.55, lon: -8.43, name: "Braga" }),
      gardenId,
    ])
    const shared = await db.query<{ token: string }>(
      "insert into public.garden_shares (garden_id) values ($1) returning token",
      [gardenId]
    )
    const feed = await db.query<{ token: string }>(
      "insert into public.garden_calendars (garden_id) values ($1) returning token",
      [gardenId]
    )
    await db.query("select public.record_visit()")

    const data = await exportMine()
    expect(data.format).toBe(1)
    expect(data.account.email).toBe("alice@example.com")
    expect(data.profile).toEqual({ displayName: null, locale: "en" })
    expect(data.gardens).toEqual([
      {
        name: "Alice's garden",
        plan: JSON.parse(PLAN),
        location: { lat: 41.55, lon: -8.43, name: "Braga" },
        version: 2,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        share: { token: shared.rows[0]!.token, showLocation: false },
        calendar: { token: feed.rows[0]!.token },
      },
    ])
    expect(data.activityDays).toHaveLength(1)
  })

  it("says how the user signs in, what the sign-in sent and where they are signed in", async () => {
    await db.exec("reset role")
    await db.query("update auth.users set raw_user_meta_data = $1 where id = $2", [
      JSON.stringify({ name: "Alice", picture: "https://example.com/alice.png" }),
      alice,
    ])
    await db.query("update auth.users set raw_user_meta_data = $1 where id = $2", [
      JSON.stringify({ name: "Bob" }),
      bob,
    ])
    await db.query(
      `insert into auth.identities (user_id, provider, created_at) values
         ($1, 'google', '2026-11-02T09:00:00Z'),
         ($1, 'email', '2026-11-01T09:00:00Z'),
         ($2, 'github', '2026-11-01T08:00:00Z')`,
      [alice, bob]
    )
    // `refreshed_at` has no time zone on the real stack: the auth server writes it in UTC.
    await db.query(
      `insert into auth.sessions (user_id, created_at, updated_at, refreshed_at, user_agent, ip) values
         ($1, '2026-11-05T10:00:00Z', '2026-11-06T10:00:00Z', null, 'Safari', null),
         ($1, '2026-11-01T10:00:00Z', '2026-11-02T10:00:00Z', '2026-11-03 10:00:00', 'Firefox', '203.0.113.7'),
         ($2, '2026-11-01T10:00:00Z', '2026-11-01T10:00:00Z', null, 'Bob''s browser', '198.51.100.1')`,
      [alice, bob]
    )

    await signInAs(alice)
    const { account } = await exportMine()
    expect(account.fromSignIn).toEqual({ name: "Alice", picture: "https://example.com/alice.png" })
    expect(account.signInMethods.map((method) => method.provider)).toEqual(["email", "google"])
    expect(new Date(account.signInMethods[0]!.addedAt).toISOString()).toBe(
      "2026-11-01T09:00:00.000Z"
    )
    expect(account.sessions.map((session) => [session.userAgent, session.ip])).toEqual([
      ["Firefox", "203.0.113.7"],
      ["Safari", null],
    ])
    expect(new Date(account.sessions[0]!.createdAt).toISOString()).toBe("2026-11-01T10:00:00.000Z")
    // The later of the two marks the auth server keeps.
    expect(new Date(account.sessions[0]!.lastActiveAt!).toISOString()).toBe(
      "2026-11-03T10:00:00.000Z"
    )
    expect(new Date(account.sessions[1]!.lastActiveAt!).toISOString()).toBe(
      "2026-11-06T10:00:00.000Z"
    )
  })

  it("holds nothing of anyone else", async () => {
    await signInAs(bob)
    const data = await exportMine()
    expect(data.gardens).toEqual([])
    expect(data.activityDays).toEqual([])
    expect(data.account.email).toBeNull()
  })

  it("is whole for someone with no sign-in method, details or sessions, like a guest", async () => {
    await signInAs(bob)
    const { account } = await exportMine()
    expect(account.signInMethods).toEqual([])
    expect(account.fromSignIn).toBeNull()
    expect(account.sessions).toEqual([])
  })

  it("cannot be exported by visitors who are not signed in", async () => {
    await signOut()
    await expect(exportMine()).rejects.toThrow(/permission denied/)
  })

  it("is deleted with its user, and nobody else's goes with it", async () => {
    await db.query("select public.record_visit()")
    await db.query("insert into public.garden_shares (garden_id) values ($1)", [gardenId])
    await signInAs(bob)
    await db.query("insert into public.gardens (name, plan) values ('Bob''s garden', $1)", [PLAN])

    await makeGuest(alice)
    await signInAs(alice)
    await db.query("select public.delete_account()")

    await db.exec("reset role")
    const users = await db.query<{ id: string }>("select id from auth.users")
    expect(users.rows).toEqual([{ id: bob }])
    const gardens = await db.query<{ name: string }>("select name from public.gardens")
    expect(gardens.rows).toEqual([{ name: "Bob's garden" }])
    expect((await db.query("select * from public.garden_shares")).rows).toEqual([])
    expect((await db.query("select * from private.activity_days")).rows).toEqual([])
    expect((await db.query("select id from public.profiles")).rows).toEqual([{ id: bob }])
  })

  it("leaves nothing of the user in the auth audit log, and keeps everyone else's", async () => {
    await audited(alice)
    await audited(alice)
    await audited(bob)

    await makeGuest(alice)
    await signInAs(alice)
    await db.query("select public.delete_account()")

    expect(await auditedUsers()).toEqual([bob])
  })

  it("is forgotten in the audit log too when users are deleted by hand, as from the dashboard", async () => {
    await db.exec("reset role")
    const carol = await createUser()
    await audited(alice)
    await audited(bob)
    await audited(carol)

    await db.query("delete from auth.users where id = any($1)", [[alice, carol]])

    expect(await auditedUsers()).toEqual([bob])
  })

  it("cannot be deleted by visitors who are not signed in", async () => {
    await signOut()
    await expect(db.query("select public.delete_account()")).rejects.toThrow(/permission denied/)
  })
})

describe("helper functions", () => {
  it("are not reachable by signed-in users", async () => {
    await expect(db.query("select private.set_updated_at()")).rejects.toThrow(/permission denied/)
  })
})

describe("templates", () => {
  const ITEMS = JSON.stringify({ format: 1, beds: [], plantings: [] })

  async function saveTemplate(name = "Tomatoes and basil", items = ITEMS) {
    const saved = await db.query<{ id: string; owner_id: string }>(
      "insert into public.templates (name, items) values ($1, $2) returning id, owner_id",
      [name, items]
    )
    return saved.rows[0]!
  }

  it("belong to the user who saved them", async () => {
    const saved = await saveTemplate()
    expect(saved.owner_id).toBe(alice)
    const mine = await db.query<{ name: string }>("select name from public.templates")
    expect(mine.rows).toEqual([{ name: "Tomatoes and basil" }])
  })

  it("are invisible to other users, who cannot delete them either", async () => {
    await saveTemplate()
    await signInAs(bob)
    expect((await db.query("select id from public.templates")).rows).toEqual([])
    expect((await db.query("delete from public.templates returning id")).rows).toEqual([])
  })

  it("can be deleted by their owner", async () => {
    const saved = await saveTemplate()
    await db.query("delete from public.templates where id = $1", [saved.id])
    expect((await db.query("select id from public.templates")).rows).toEqual([])
  })

  it("cannot be saved on behalf of someone else", async () => {
    await expect(
      db.query("insert into public.templates (name, items, owner_id) values ('x', $1, $2)", [
        ITEMS,
        bob,
      ])
    ).rejects.toThrow(/permission denied/)
  })

  it("cannot be changed once saved", async () => {
    await saveTemplate()
    await expect(db.query("update public.templates set name = 'Renamed'")).rejects.toThrow(
      /permission denied/
    )
  })

  it("need a name", async () => {
    await expect(saveTemplate("")).rejects.toThrow(/templates_name_check/)
  })

  it("hold an object of at most 256 KB", async () => {
    await expect(saveTemplate("List", "[]")).rejects.toThrow(/templates_items_check/)
  })

  it("stop at fifty a user", async () => {
    for (let index = 0; index < 50; index++) await saveTemplate(`Template ${index}`)
    await expect(saveTemplate("One too many")).rejects.toThrow(/at most 50 templates/)
  })

  it("are closed to visitors who are not signed in", async () => {
    await signOut()
    await expect(db.query("select id from public.templates")).rejects.toThrow(/permission denied/)
  })

  it("go with their user, and come along in the export", async () => {
    await saveTemplate()
    const exported = await db.query<{ data: { templates: { name: string }[] } }>(
      "select public.export_my_data() as data"
    )
    expect(exported.rows[0]?.data.templates.map((template) => template.name)).toEqual([
      "Tomatoes and basil",
    ])
    await makeGuest(alice)
    await signInAs(alice)
    await db.query("select public.delete_account()")
    await db.exec("reset role")
    expect((await db.query("select id from public.templates")).rows).toEqual([])
  })
})

describe("purge of stale guests", () => {
  /** A guest who arrived `daysAgo` days ago, and signed in again `signedInDaysAgo` days ago. */
  async function createGuest(daysAgo: number, signedInDaysAgo?: number): Promise<string> {
    await db.exec("reset role")
    const result = await db.query<{ id: string }>(
      `insert into auth.users (is_anonymous, created_at, last_sign_in_at)
       values (true, now() - make_interval(days => $1), now() - make_interval(days => $2))
       returning id`,
      [daysAgo, signedInDaysAgo ?? daysAgo]
    )
    return result.rows[0]!.id
  }

  /** A garden of `ownerId`'s, last saved `daysAgo` days ago. */
  async function gardenOf(ownerId: string, daysAgo: number): Promise<string> {
    await db.exec("reset role")
    const result = await db.query<{ id: string }>(
      `insert into public.gardens (name, plan, owner_id, created_at, updated_at)
       values ('Old garden', $1, $2, now() - make_interval(days => $3), now() - make_interval(days => $3))
       returning id`,
      [PLAN, ownerId, daysAgo]
    )
    return result.rows[0]!.id
  }

  async function purge(batch?: number): Promise<number> {
    await db.exec("reset role")
    const result = await db.query<{ purged: number }>(
      batch === undefined
        ? "select private.purge_stale_guests() as purged"
        : "select private.purge_stale_guests($1) as purged",
      batch === undefined ? [] : [batch]
    )
    return result.rows[0]!.purged
  }

  async function users(): Promise<string[]> {
    await db.exec("reset role")
    const result = await db.query<{ id: string }>("select id from auth.users")
    return result.rows.map((row) => row.id)
  }

  it("removes guests who left nothing and have not been seen for 30 days", async () => {
    const gone = await createGuest(31)
    await wasActive(gone, 31)
    const fresh = await createGuest(29)
    expect(await purge()).toBe(1)
    const left = await users()
    expect(left).not.toContain(gone)
    expect(left).toContain(fresh)
    expect((await db.query("select id from public.profiles where id = $1", [gone])).rows).toEqual(
      []
    )
  })

  it("forgets the removed guests in the auth audit log, and only them", async () => {
    const gone = await createGuest(31)
    const alsoGone = await createGuest(40)
    const fresh = await createGuest(29)
    await audited(gone)
    await audited(alsoGone)
    await audited(alsoGone)
    await audited(fresh)

    expect(await purge()).toBe(2)
    expect(await auditedUsers()).toEqual([fresh])
  })

  it("keeps a guest who came back or signed in within 30 days", async () => {
    const visited = await createGuest(31)
    await wasActive(visited, 5)
    const signedIn = await createGuest(31, 5)
    expect(await purge()).toBe(0)
    expect(await users()).toEqual(expect.arrayContaining([visited, signedIn]))
  })

  it("keeps a guest with a garden for a year, and removes them after it", async () => {
    const recent = await createGuest(31)
    await gardenOf(recent, 31)
    const old = await createGuest(400)
    const oldGarden = await gardenOf(old, 400)
    await db.query("insert into public.garden_shares (garden_id) values ($1)", [oldGarden])

    expect(await purge()).toBe(1)
    const left = await users()
    expect(left).toContain(recent)
    expect(left).not.toContain(old)
    expect(
      (await db.query("select id from public.gardens where id = $1", [oldGarden])).rows
    ).toEqual([])
    expect((await db.query("select * from public.garden_shares")).rows).toEqual([])
  })

  it("keeps a guest whose only belonging is a template", async () => {
    const guest = await createGuest(31)
    await db.query(
      "insert into public.templates (name, items, owner_id) values ('Rotation', $1, $2)",
      [JSON.stringify({ format: 1, beds: [], plantings: [] }), guest]
    )
    expect(await purge()).toBe(0)
    expect(await users()).toContain(guest)
  })

  it("counts saving a garden as being seen", async () => {
    const guest = await createGuest(400)
    await gardenOf(guest, 2)
    expect(await purge()).toBe(0)
    expect(await users()).toContain(guest)
  })

  it("never removes an account or an admin", async () => {
    await db.exec("reset role")
    const account = await db.query<{ id: string }>(
      "insert into auth.users (created_at) values (now() - interval '800 days') returning id"
    )
    const admin = await createGuest(800)
    await makeAdmin(admin)
    expect(await purge()).toBe(0)
    expect(await users()).toEqual(expect.arrayContaining([account.rows[0]!.id, admin]))
  })

  it("removes at most a batch at a time", async () => {
    await createGuest(31)
    await createGuest(31)
    expect(await purge(1)).toBe(1)
    expect(await purge(1)).toBe(1)
    expect(await purge(1)).toBe(0)
  })

  it("cannot be run by users", async () => {
    await expect(db.query("select private.purge_stale_guests()")).rejects.toThrow(
      /permission denied/
    )
  })
})

describe("sweep of the auth audit log", () => {
  const NOBODY = "00000000-0000-0000-0000-000000000000"

  /** A line written by the dashboard or the admin API about `userId`, as when it deletes them. */
  async function auditedByAdmin(userId: string | null): Promise<void> {
    await db.exec("reset role")
    await db.query(
      `insert into auth.audit_log_entries (id, payload, created_at, ip_address)
       values (
         gen_random_uuid(),
         json_build_object(
           'actor_id', $1::text,
           'action', 'user_deleted',
           'traits', case when $2::text is null then null
             else json_build_object('user_id', $2::text, 'user_email', 'gone@example.com') end
         ),
         now(),
         ''
       )`,
      [NOBODY, userId]
    )
  }

  async function sweep(): Promise<number> {
    await db.exec("reset role")
    const result = await db.query<{ swept: number }>(
      "select private.forget_departed_in_audit_log() as swept"
    )
    return result.rows[0]!.swept
  }

  async function lines(): Promise<number> {
    await db.exec("reset role")
    const result = await db.query<{ count: number }>(
      "select count(*)::int as count from auth.audit_log_entries"
    )
    return result.rows[0]!.count
  }

  // The trigger leaves the line the admin API writes about the user it deleted,
  // and the lines of users deleted before the trigger existed.
  it("removes the lines about users who no longer exist", async () => {
    const departed = crypto.randomUUID()
    await audited(departed)
    await auditedByAdmin(crypto.randomUUID())
    expect(await sweep()).toBe(2)
    expect(await lines()).toBe(0)
  })

  it("keeps the lines about users who are still here, and admin lines about nobody", async () => {
    await audited(bob)
    await auditedByAdmin(alice)
    await auditedByAdmin(null)
    expect(await sweep()).toBe(0)
    expect(await lines()).toBe(3)
  })

  it("cannot be run by users", async () => {
    await expect(db.query("select private.forget_departed_in_audit_log()")).rejects.toThrow(
      /permission denied/
    )
  })
})

describe("a deletion that waits 30 days", () => {
  /** A session of `userId`'s, started `minutes` minutes from now: before it when negative. */
  async function sessionOf(userId: string, minutes: number): Promise<string> {
    await db.exec("reset role")
    const result = await db.query<{ id: string }>(
      "insert into auth.sessions (user_id, created_at) values ($1, now() + make_interval(mins => $2)) returning id",
      [userId, minutes]
    )
    return result.rows[0]!.id
  }

  /** Alice signed in on a session of her own, started a minute ago. */
  async function aliceOnSession(): Promise<string> {
    const session = await sessionOf(alice, -1)
    await signInAs(alice, session)
    return session
  }

  /** `userId` asked for their deletion `days` days ago. */
  async function askedDaysAgo(userId: string, days: number): Promise<void> {
    await db.exec("reset role")
    await db.query(
      "insert into private.deletion_requests (user_id, requested_at) values ($1, now() - make_interval(days => $2))",
      [userId, days]
    )
  }

  /** The moment `days` days from now, as the database sees it. */
  async function inDays(days: number): Promise<Date> {
    const result = await db.query<{ at: Date }>("select now() + make_interval(days => $1) as at", [
      days,
    ])
    return result.rows[0]!.at
  }

  async function requestDeletion(): Promise<Date> {
    const result = await db.query<{ due: Date }>("select public.request_account_deletion() as due")
    return result.rows[0]!.due
  }

  async function resume(): Promise<Date | null> {
    const result = await db.query<{ due: Date | null }>("select public.resume_account() as due")
    return result.rows[0]!.due
  }

  async function waiting(): Promise<string[]> {
    await db.exec("reset role")
    const result = await db.query<{ user_id: string }>(
      "select user_id from private.deletion_requests order by requested_at"
    )
    return result.rows.map((row) => row.user_id)
  }

  async function sessionsLeft(): Promise<string[]> {
    await db.exec("reset role")
    const result = await db.query<{ id: string }>("select id from auth.sessions order by id")
    return result.rows.map((row) => row.id)
  }

  async function users(): Promise<string[]> {
    await db.exec("reset role")
    const result = await db.query<{ id: string }>("select id from auth.users")
    return result.rows.map((row) => row.id)
  }

  it("is asked for by the account itself, and ends its sessions everywhere, nobody else's", async () => {
    const older = await sessionOf(alice, -60 * 24 * 3)
    await sessionOf(alice, -5)
    const bobs = await sessionOf(bob, -5)
    await signInAs(alice, older)

    expect(await requestDeletion()).toEqual(await inDays(30))
    expect(await waiting()).toEqual([alice])
    expect(await sessionsLeft()).toEqual([bobs])
    // Nothing is deleted yet.
    expect(await users()).toEqual(expect.arrayContaining([alice, bob]))
    const gardens = await db.query<{ id: string }>("select id from public.gardens")
    expect(gardens.rows).toEqual([{ id: gardenId }])
  })

  it("keeps the date of the first request when asked again", async () => {
    await askedDaysAgo(alice, 3)
    await aliceOnSession()
    expect(await requestDeletion()).toEqual(await inDays(27))
    expect(await waiting()).toEqual([alice])
  })

  it("is refused to a guest, who deletes theirs at once instead", async () => {
    await db.exec("reset role")
    const guest = await db.query<{ id: string }>(
      "insert into auth.users (is_anonymous) values (true) returning id"
    )
    await signInAs(guest.rows[0]!.id)
    await expect(requestDeletion()).rejects.toThrow(/only an account/)
  })

  it("is refused to visitors who are not signed in", async () => {
    await signOut()
    await expect(requestDeletion()).rejects.toThrow(/permission denied/)
  })

  it("cannot be cancelled by visitors who are not signed in", async () => {
    await signOut()
    await expect(resume()).rejects.toThrow(/permission denied/)
  })

  it("keeps the list of requests out of the users' reach", async () => {
    await aliceOnSession()
    await requestDeletion()
    await signInAs(alice)
    await expect(db.query("select * from private.deletion_requests")).rejects.toThrow(
      /permission denied/
    )
  })

  it("is cancelled by signing in again, which says when the account would have gone", async () => {
    await aliceOnSession()
    const due = await requestDeletion()
    const signedInAgain = await sessionOf(alice, 1)
    await signInAs(alice, signedInAgain)

    expect(await resume()).toEqual(due)
    expect(await waiting()).toEqual([])
    expect(await resume()).toBeNull()
  })

  it("is not cancelled by an ended session, an older one or someone else's", async () => {
    const ended = await aliceOnSession()
    await requestDeletion()
    expect(await resume()).toBeNull()

    await signInAs(alice, await sessionOf(alice, -10))
    expect(await resume()).toBeNull()

    await signInAs(alice, await sessionOf(bob, 1))
    expect(await resume()).toBeNull()

    await signInAs(alice)
    expect(await resume()).toBeNull()

    expect(await waiting()).toEqual([alice])
    expect(await sessionsLeft()).not.toContain(ended)
  })

  it("leaves nothing to cancel for an account that asked for nothing", async () => {
    await signInAs(alice, await sessionOf(alice, 1))
    expect(await resume()).toBeNull()
  })

  it("hides the account's share links while it waits, and shows them again once kept", async () => {
    const shared = await db.query<{ token: string }>(
      "insert into public.garden_shares (garden_id) values ($1) returning token",
      [gardenId]
    )
    const token = shared.rows[0]!.token
    const open = () => db.query("select * from public.shared_garden($1)", [token])

    await aliceOnSession()
    await requestDeletion()
    await signOut()
    expect((await open()).rows).toEqual([])

    await signInAs(alice, await sessionOf(alice, 1))
    await resume()
    await signOut()
    expect((await open()).rows).toHaveLength(1)
  })

  it("hides the account's calendar links while it waits, and shows them again once kept", async () => {
    const created = await db.query<{ token: string }>(
      "insert into public.garden_calendars (garden_id) values ($1) returning token",
      [gardenId]
    )
    const token = created.rows[0]!.token
    const read = () => db.query("select * from public.garden_calendar($1)", [token])

    await aliceOnSession()
    await requestDeletion()
    await signOut()
    expect((await read()).rows).toEqual([])

    await signInAs(alice, await sessionOf(alice, 1))
    await resume()
    await signOut()
    expect((await read()).rows).toHaveLength(1)
  })

  it("is in the account's data, with the day it was asked for", async () => {
    const exported = async () => {
      const result = await db.query<{ data: { account: { deletionRequestedAt: string | null } } }>(
        "select public.export_my_data() as data"
      )
      return result.rows[0]!.data.account.deletionRequestedAt
    }
    expect(await exported()).toBeNull()

    await askedDaysAgo(alice, 3)
    await signInAs(alice)
    expect(new Date((await exported())!)).toEqual(await inDays(-3))
  })

  it("goes with the account when it is deleted by hand, as from the dashboard", async () => {
    await askedDaysAgo(alice, 3)
    await db.query("delete from auth.users where id = $1", [alice])
    expect(await waiting()).toEqual([])
  })

  it("cannot be skipped: an account is never deleted at once", async () => {
    await aliceOnSession()
    await expect(db.query("select public.delete_account()")).rejects.toThrow(/only a guest/)
  })

  describe("carried out", () => {
    async function purge(batch?: number): Promise<number> {
      await db.exec("reset role")
      const result = await db.query<{ purged: number }>(
        batch === undefined
          ? "select private.purge_deletion_requests() as purged"
          : "select private.purge_deletion_requests($1) as purged",
        batch === undefined ? [] : [batch]
      )
      return result.rows[0]!.purged
    }

    it("deletes the accounts asked for more than 30 days ago, with everything of theirs", async () => {
      await db.query("insert into public.garden_shares (garden_id) values ($1)", [gardenId])
      await db.query("insert into public.templates (name, items) values ('Rotation', $1)", [
        JSON.stringify({ format: 1, beds: [], plantings: [] }),
      ])
      await db.query("select public.record_visit()")
      await audited(alice)
      await audited(bob)
      await askedDaysAgo(alice, 31)
      await askedDaysAgo(bob, 29)

      expect(await purge()).toBe(1)
      expect(await users()).toEqual([bob])
      expect(await waiting()).toEqual([bob])
      for (const table of [
        "public.gardens",
        "public.garden_shares",
        "public.templates",
        "private.activity_days",
      ]) {
        expect((await db.query(`select * from ${table}`)).rows).toEqual([])
      }
      expect((await db.query("select id from public.profiles")).rows).toEqual([{ id: bob }])
      expect(await auditedUsers()).toEqual([bob])
    })

    it("deletes at most a batch at a time, the oldest request first", async () => {
      await db.exec("reset role")
      const carol = await createUser()
      await askedDaysAgo(alice, 40)
      await askedDaysAgo(bob, 31)
      await askedDaysAgo(carol, 35)

      expect(await purge(1)).toBe(1)
      expect(await users()).not.toContain(alice)
      expect(await purge(1)).toBe(1)
      expect(await users()).toEqual([bob])
      expect(await purge(1)).toBe(1)
      expect(await purge(1)).toBe(0)
    })

    it("cannot be run by users", async () => {
      await expect(db.query("select private.purge_deletion_requests()")).rejects.toThrow(
        /permission denied/
      )
    })
  })
})

describe("a guest's gardens handed over to an account", () => {
  /** A new guest, signed in, with a garden and a template of their own. */
  async function guestWithThings(): Promise<{ guest: string; garden: string }> {
    await db.exec("reset role")
    const created = await db.query<{ id: string }>(
      "insert into auth.users (is_anonymous) values (true) returning id"
    )
    const guest = created.rows[0]!.id
    await signInAs(guest)
    const garden = await db.query<{ id: string }>(
      "insert into public.gardens (name, plan) values ('On the phone', $1) returning id",
      [PLAN]
    )
    await db.query("insert into public.templates (name, items) values ('Salads', $1)", [
      JSON.stringify({ format: 1, beds: [], plantings: [] }),
    ])
    return { guest, garden: garden.rows[0]!.id }
  }

  async function offer(): Promise<string> {
    const result = await db.query<{ code: string }>("select public.offer_guest_handover() as code")
    return result.rows[0]!.code
  }

  async function claim(code: string): Promise<{ gardens: number; templates: number }> {
    const result = await db.query<{ taken: { gardens: number; templates: number } }>(
      "select public.claim_guest_handover($1) as taken",
      [code]
    )
    return result.rows[0]!.taken
  }

  async function ownerOf(table: "gardens" | "templates"): Promise<Record<string, string>> {
    await db.exec("reset role")
    const result = await db.query<{ name: string; owner_id: string }>(
      `select name, owner_id from public.${table}`
    )
    return Object.fromEntries(result.rows.map((row) => [row.name, row.owner_id]))
  }

  async function users(): Promise<string[]> {
    await db.exec("reset role")
    const result = await db.query<{ id: string }>("select id from auth.users")
    return result.rows.map((row) => row.id)
  }

  it("moves them, their links and templates to the account that takes them, and forgets the guest", async () => {
    const { guest, garden } = await guestWithThings()
    const shared = await db.query<{ token: string }>(
      "insert into public.garden_shares (garden_id) values ($1) returning token",
      [garden]
    )
    const feed = await db.query<{ token: string }>(
      "insert into public.garden_calendars (garden_id) values ($1) returning token",
      [garden]
    )
    const code = await offer()

    await signInAs(alice)
    expect(await claim(code)).toEqual({ gardens: 1, templates: 1 })
    expect(await ownerOf("gardens")).toEqual({ "Alice's garden": alice, "On the phone": alice })
    expect(await ownerOf("templates")).toEqual({ Salads: alice })
    expect(await users()).not.toContain(guest)

    // The link goes on opening the same garden.
    await signOut()
    const opened = await db.query<{ name: string }>("select name from public.shared_garden($1)", [
      shared.rows[0]!.token,
    ])
    expect(opened.rows).toEqual([{ name: "On the phone" }])
    const read = await db.query<{ name: string }>("select name from public.garden_calendar($1)", [
      feed.rows[0]!.token,
    ])
    expect(read.rows).toEqual([{ name: "On the phone" }])
  })

  it("works once: the code is spent", async () => {
    await guestWithThings()
    const code = await offer()
    await signInAs(alice)
    await claim(code)
    await signInAs(bob)
    expect(await claim(code)).toEqual({ gardens: 0, templates: 0 })
    expect(await ownerOf("gardens")).toEqual({ "Alice's garden": alice, "On the phone": alice })
  })

  it("keeps only the latest code of a guest", async () => {
    const { guest } = await guestWithThings()
    const first = await offer()
    const second = await offer()
    await signInAs(alice)
    expect(await claim(first)).toEqual({ gardens: 0, templates: 0 })
    expect(await claim(second)).toEqual({ gardens: 1, templates: 1 })
    expect(await users()).not.toContain(guest)
  })

  it("moves nothing for a code older than a day, or one nobody made", async () => {
    const { guest } = await guestWithThings()
    const code = await offer()
    await db.exec("reset role")
    await db.query(
      "update private.guest_handovers set created_at = now() - interval '25 hours' where code = $1",
      [code]
    )
    await signInAs(alice)
    expect(await claim(code)).toEqual({ gardens: 0, templates: 0 })
    expect(await claim("00000000-0000-4000-8000-000000000000")).toEqual({
      gardens: 0,
      templates: 0,
    })
    expect((await ownerOf("gardens"))["On the phone"]).toBe(guest)
  })

  it("leaves a guest who has since become an account with what is theirs", async () => {
    const { guest } = await guestWithThings()
    const code = await offer()
    await db.exec("reset role")
    await db.query("update auth.users set is_anonymous = false where id = $1", [guest])
    await signInAs(alice)
    expect(await claim(code)).toEqual({ gardens: 0, templates: 0 })
    expect((await ownerOf("gardens"))["On the phone"]).toBe(guest)
  })

  // A refused call ends the test's transaction, so each test makes only one.
  it("is offered by guests only", async () => {
    await expect(offer()).rejects.toThrow(/only a guest/)
  })

  it("cannot be offered by visitors who are not signed in", async () => {
    await signOut()
    await expect(offer()).rejects.toThrow(/permission denied/)
  })

  it("is never taken by another guest", async () => {
    await guestWithThings()
    const code = await offer()
    await db.exec("reset role")
    const other = await db.query<{ id: string }>(
      "insert into auth.users (is_anonymous) values (true) returning id"
    )
    await signInAs(other.rows[0]!.id)
    await expect(claim(code)).rejects.toThrow(/only an account/)
  })

  it("is never taken by visitors who are not signed in", async () => {
    await guestWithThings()
    const code = await offer()
    await signOut()
    await expect(claim(code)).rejects.toThrow(/permission denied/)
  })

  it("keeps the codes out of the users' reach", async () => {
    await guestWithThings()
    await offer()
    await expect(db.query("select * from private.guest_handovers")).rejects.toThrow(
      /permission denied/
    )
  })
})

describe("keeping the project awake", () => {
  it("can be asked for by a visitor with no session, as the Worker's cron does", async () => {
    await signOut()
    const result = await db.query<{ awake: boolean }>("select public.keep_awake() as awake")
    expect(result.rows).toEqual([{ awake: true }])
  })
})
