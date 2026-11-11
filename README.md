# Garden Planner

Plan a vegetable garden on a grid: draw beds, place crops with the right spacing, check crop
rotation, and see the weather where the garden is. The interface is in Portuguese and English.

## What is in the repository

| Path                | What it is                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web`          | The React app (`src`) and the Cloudflare Worker that serves it and the `/api` routes (`worker`).    |
| `packages/core`     | The plan schema and the gardening logic: geometry, spacing, rotation, plants. No framework, no I/O. |
| `packages/tsconfig` | Shared TypeScript settings.                                                                         |
| `supabase`          | The database: migrations, local stack settings, and tests of the access rules.                      |

Gardens live in Supabase (Postgres with row level security). Visitors are signed in anonymously,
so each one gets a real user id and can only see their own gardens. The Worker proxies the weather
provider, so its API key never reaches the browser, and caches each reading per zone in KV.

## Requirements

- Node 24 or later, and pnpm (the version is pinned in `package.json`)
- Docker, for the local Supabase stack
- An [OpenWeather API key](https://home.openweathermap.org/api_keys), only for the weather panel

## Running it locally

```sh
pnpm install
pnpm db:start                                   # local Supabase, in Docker
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm supabase status                            # copy the publishable key into .dev.vars
pnpm dev                                        # http://localhost:5173
```

Without `OPENWEATHER_API_KEY` everything works except the weather panel, which says the weather
is unavailable.

## Commands

| Command                 | What it does                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`              | Runs the app and the Worker with hot reload.                                       |
| `pnpm check`            | Lint, typecheck, unit tests and build: what must pass before a commit.             |
| `pnpm test`             | Unit tests. They need no Docker: the database rules run on an in-process Postgres. |
| `pnpm test:integration` | The gardens API and the token check against the local Supabase stack.              |
| `pnpm test:e2e`         | Playwright tests in a real browser. Needs the local stack and `.dev.vars`.         |
| `pnpm format`           | Formats and applies safe lint fixes (Biome).                                       |
| `pnpm db:reset`         | Recreates the local database from the migrations.                                  |

## How saving works

The editor keeps the plan in a small store and saves the whole garden a moment after it stops
changing. Every save carries the version it was loaded at; the database bumps the version on each
update, so a tab that fell behind is refused instead of overwriting newer work, and the editor
offers to reload.

## Deploying

The app is one Cloudflare Worker. It needs a Supabase project (with anonymous sign-ins enabled and
the migrations applied) and three secrets, set with `wrangler secret put`:
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `OPENWEATHER_API_KEY`.

```sh
pnpm supabase link && pnpm supabase db push
pnpm --filter @garden/web build
pnpm --filter @garden/web exec wrangler deploy
```
