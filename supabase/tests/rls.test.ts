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
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
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

/** Acts as a signed-in user, the way the Data API does for each request. */
async function signInAs(userId: string): Promise<void> {
  await db.exec("reset role")
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
  await db.exec("set role authenticated")
}

async function signOut(): Promise<void> {
  await db.exec("reset role")
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
  await db.exec("set role anon")
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

describe("helper functions", () => {
  it("are not reachable by signed-in users", async () => {
    await expect(db.query("select private.set_updated_at()")).rejects.toThrow(/permission denied/)
  })
})
