# Leira

[![CI](https://github.com/pgraca97/leira/actions/workflows/ci.yml/badge.svg)](https://github.com/pgraca97/leira/actions/workflows/ci.yml)

Plan a vegetable garden on a grid: draw beds, fill them with crops at the right spacing, and get
warned about crop rotation, bad neighbours and frost where the garden is.

A _leira_ is what a plot of cultivated land is called in Minho, in the north of Portugal.

> Work in progress. You start as a guest, with no sign-up, and can keep your gardens later with
> Google or a link sent by email.

**[Live demo](https://leira.paulodcgraca.workers.dev)**

![The editor with two beds, one with 3 tomatoes and one with 12 potatoes, the crop list on the left, and the selected planting's details and the local weather on the right](docs/editor.png)

## Features

- **Beds and plantings on a grid.** Drag to draw a bed or fill an area with a crop; the number of
  plants follows from the crop's spacing, as one plant, rows, a block or square-foot squares.
  Move and resize with handles, nudge with the arrow keys, duplicate with Ctrl+D, undo and redo.
- **45 crops** common in Portugal, with search, spacing, frost tolerance and days to harvest.
- **Advice:** crop rotation (same family in the same place too soon), companion planting, and
  warnings from a 5-day forecast for the planted crops: frost, heat, and nights too cold for
  seedlings that have just been planted out. The garden is located by searching for its town or
  from the device's position.
- **Time:** show the garden on any date, a yearly calendar per planting, and the jobs coming up in
  the next 30 days. Seedlings follow the day they were actually sown, once it is recorded.
- **Export:** save the plan as a PNG or print a sheet with the plan and a planting table.
- **An example to look around.** A first visit can start from a ready-made garden whose crops
  follow the seasons, with a rotation mistake and good and bad neighbours to show the advice.
- **Accounts without a sign-up wall.** A guest gets a real user straight away. Signing in with
  Google or an emailed link attaches to that same user, so the gardens made as a guest are kept.
- **Portuguese and English** interface.

## Tech stack

| Layer    | Tools                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Frontend | React 19, TanStack Router and Query, Tailwind CSS, Phaser for the canvas |
| State    | Zustand with zundo (undo history)                                        |
| Backend  | Cloudflare Worker with Hono, KV for the weather cache                    |
| Data     | Supabase (Postgres with row level security, anonymous and Google auth)   |
| Shared   | Zod schemas and the gardening logic in `packages/core`                   |
| Tooling  | pnpm workspaces, Turborepo, Biome, Vitest, Playwright                    |

## How to run

You need Node 24, pnpm, and Docker for the local Supabase stack.

```bash
pnpm install
pnpm db:start
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm supabase status
pnpm dev
```

Copy the API URL and publishable key printed by `pnpm supabase status` into
`apps/web/.dev.vars`. The app runs at http://localhost:5173. Without an
[OpenWeather API key](https://home.openweathermap.org/api_keys) in the same file, everything works
except the weather panel.

## Tests

| Command                 | What it covers                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`            | Lint, typecheck, unit tests and build. The database access rules run on an in-process Postgres, so no Docker.                  |
| `pnpm test:integration` | The Worker's API and the email sign-in flow against the local Supabase stack.                                                  |
| `pnpm test:e2e`         | Playwright: drawing, saving, the calendar, export, signing in by emailed link, and that a visitor only sees their own gardens. |

The last two need `pnpm db:start` and a filled-in `.dev.vars`.

## Decisions

- **Gardening logic is pure.** Geometry, spacing, rotation, companions and schedules live in
  `packages/core` with no framework and no I/O, so they are tested without a browser.
- **One store, two views.** The editor state is a framework-free store. React and the Phaser
  scene both subscribe to it and never talk to each other.
- **Saves cannot overwrite newer work.** Each save carries the version the plan was loaded at,
  and the database refuses a stale one. The editor then offers to reload instead of losing an
  edit made in another tab.
- **The weather key stays on the server.** The Worker calls OpenWeather and caches each answer in
  KV per zone of about 11 km, so nearby gardens share one call. The garden itself only keeps its
  position rounded to about 1 km.

## Repository layout

| Path                | What it is                                                                 |
| ------------------- | -------------------------------------------------------------------------- |
| `apps/web`          | The React app (`src`) and the Worker that serves it and `/api` (`worker`). |
| `packages/core`     | The plan schema and the gardening logic.                                   |
| `packages/tsconfig` | Shared TypeScript settings.                                                |
| `supabase`          | Migrations, local stack settings and tests of the access rules.            |

## Deploying

The app is one Cloudflare Worker. It needs the three values from `.dev.vars.example` as secrets,
and a Supabase project with anonymous sign-ins, manual linking and the Google provider enabled,
an SMTP server for the emailed links, and the app's address as its site URL.

```bash
pnpm supabase link --project-ref <project-ref>
pnpm supabase db push --remote
pnpm --filter @leira/web build
pnpm --filter @leira/web exec wrangler deploy --secrets-file <file>
```

The secrets file holds `NAME=value` lines and stays out of git. After the first deploy, change a
secret with `wrangler secret put`.
