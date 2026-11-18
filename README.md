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
  Pick several items with Shift (a click adds one, a drag draws an area, Ctrl+A takes all), or
  with "Select several" on a touch screen, then move, duplicate or delete them together.
  Copy and paste them into this garden or another; "Paste into next year" puts the crops in the
  same place a year later, which is how next season is planned. Save a selection as a named
  template and insert it into any of your gardens, its crops moved to the year shown.
  Zoom with the wheel, a pinch or the buttons.
- **45 crops** common in Portugal, with search, spacing, frost tolerance, days to harvest and the
  months each one goes in the ground. One tick narrows the list to what can be sown or planted
  out this month.
- **Advice:** crop rotation (same family in the same place too soon), companion planting, crops
  planned outside their season, and warnings from a 5-day forecast for the planted crops: frost,
  heat, nights too cold for seedlings that have just been planted out, and soil too cold for a
  seed due to be sown in place. The forecast gives each day's soil temperature 6 cm down. The
  garden is located by searching for its town or from the device's position.
- **Time:** show the garden on any date, a yearly calendar per planting or per bed, where each bed
  shows when it stands empty and which crops there is still room for, and the jobs of the last
  and the next 30 days. A job is ticked off with the day it was really done, and the calendar
  follows that day; a job that slipped stays on the list as overdue.
- **Records:** the variety of a planting, in the gardener's own words, a harvest log per planting,
  in kilos or units, with what the crop gave in total, and free notes on a planting and on the
  garden for what went wrong and what to try next year.
- **Export:** save the plan as a PNG or print a sheet with the plan and a planting table, or
  save the garden as a JSON file to import again later. The jobs still to do go to a phone or
  desktop calendar as an `.ics` file, and each year has a list of the plants to get, added up
  from the plan.
- **Share:** a read-only link shows a garden's plan and calendar to anyone, with no account. The
  owner chooses whether it says where the garden is, and can turn it off at any time. Notes and
  harvest amounts never leave with the link.
- **An example to look around.** A first visit can start from a ready-made garden whose crops
  follow the seasons, with a rotation mistake and good and bad neighbours to show the advice.
- **Accounts without a sign-up wall.** A guest gets a real user straight away. Signing in with
  Google or an emailed link attaches to that same user, so the gardens made as a guest are kept.
- **A privacy page** at `/privacy`, linked from the account panel, says what is kept, who else
  handles it, for how long and how to take it away or delete it. Reading it makes nobody a guest.
- **A landing page** at `/`, in English at `/en/`, written as plain HTML when the app is built, so
  search engines and link previews read it whole. Someone who already used the app in that browser
  goes straight on to their gardens at `/gardens`.
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
except the weather panel. The local auth server asks for a captcha as production does, with
Cloudflare's test keys (already in the example file), and checks it with Cloudflare, so signing in
locally needs a network. Every email, the sign-in links and the Worker's own, lands in the local
stack's Mailpit at http://127.0.0.1:54324.

## Tests

| Command                 | What it covers                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`            | Lint, typecheck, unit tests and build. The database access rules run on an in-process Postgres, so no Docker.                                                                                                            |
| `pnpm test:integration` | The gardens API, share links, the Worker's token check, the captcha and the email sign-in flow against the local Supabase stack.                                                                                         |
| `pnpm test:e2e`         | Playwright: the landing page and who it sends on to the app, drawing, saving, the calendar, jobs done and harvests, export, sharing by link, signing in by emailed link, and that a visitor only sees their own gardens. |

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
- **Soil temperature comes from a second provider.** OpenWeather's free plan has none, so the
  Worker asks [Open-Meteo](https://open-meteo.com/) (no key, free for non-commercial use) in the
  same call as the forecast and caches the two together. When Open-Meteo fails, the forecast still
  comes back, without the soil. Its data are under CC BY 4.0, credited next to them.
- **Places are found by Open-Meteo too.** OpenWeather's geocoder names no municipality in
  Portugal, so a search for a village shared by several concelhos gave identical results. The
  Worker asks Open-Meteo's geocoder (GeoNames data, CC BY 4.0) in the app's language, keeps towns
  and villages only, and caches each search per language for 30 days. The results show each
  place's concelho and district.
- **A shared link is a key, not an account.** The link carries a random token, and one database
  function is the only thing a visitor with no session can call: it hands over the name and the
  plan, and the location only if the owner allowed it. Opening a link therefore creates no guest
  user, and the gardens table stays closed to everyone but its owners. The owner's notes and
  harvest amounts are cut out by that same function, not by the Worker in front of it: whoever
  holds a token can call the function directly.
- **Next year lives in the same garden.** A plan spans as many years as its crops' dates do, and
  the rotation check compares those years. So planning next season is a paste a year on into the
  same garden, not a new garden. The clipboard sits in the browser's storage, so it also reaches
  another garden or tab.
- **What happened lives in the plan.** Jobs done, harvests and notes are fields of the plan
  document, not tables of their own, so they are saved, undone and checked for conflicts the same
  way as a moved bed. The document has a version, and older ones are brought up to date as they
  are read.
- **One visitor cannot spend the weather quota, and running out of cache writes breaks nothing.**
  The Worker counts calls per address, an IPv6 one by its /64 block since a machine can take any
  address in it: 60 a minute to the weather and place routes, and 10 a minute of those the cache
  cannot answer, since only these reach OpenWeather and write to KV. Cloudflare's limiter counts
  by the minute at most, so one address can still use up the free plan's 1000 daily KV writes in
  about 100 minutes. That only stops new answers being cached until midnight UTC: the routes keep
  answering from OpenWeather. Two gaps are left open while the app has a handful of users. A daily
  budget for everyone together would need a Durable Object. And the free plan's 100,000 daily
  Worker requests, which a refused request spends too, can only be guarded by Cloudflare rules in
  front of the Worker, which need a domain of its own.
- **Usage is counted for the owner, not for advertisers.** Two sources, both free. Cloudflare Web
  Analytics counts visits, pages and where people come from, with no cookies; its beacon loads only
  where the Worker has a token, which is production. The database keeps one row per person for
  each day they opened the app, so "came back" includes someone who only read their calendar. The
  page `/stats` shows those numbers and the free plan limits to the admins listed in
  `private.admins`, whose own use is left out. It is there to say when paying for a domain or a
  bigger plan would be worth it.
- **The front door is a static page.** The landing page and the 404 pages are rendered from the
  app's own components and strings when it is built (`src/site`), and send no React to the
  browser. Search engines and link previews read them whole, serving them costs the Worker
  nothing, and arriving makes nobody a guest. Cloudflare's single-page fallback always serves the
  root `index.html`, so the app shell is `app.html` instead: the Worker hands it out for the app's
  paths, listed in `run_worker_first` (a test checks the router against that list), with
  `noindex` on all but the privacy page. Any other address gets a real 404.
- **Bots are stopped before they become guests.** Every visit to the app without a session signs in
  a new guest, and each one counts toward the 50,000 monthly active users of Supabase's free plan,
  which counts whoever signed in during the month. Deleting a guest later does not give that back.
  So the auth server asks for a Cloudflare Turnstile token (free) before it makes a guest or emails
  a link to an existing account. The challenge is invisible and shows a box only when Cloudflare is
  unsure. Google sign-in needs none.
- **Guests nobody will come back to are cleared.** Bots that got through, bounced visits and the
  fresh guest made after each sign-out stay in the database for good otherwise, and in `/stats`.
  A nightly `pg_cron` job deletes guests unseen for 30 days who kept nothing, and those who kept a
  garden or a template after a year: a guest's session never expires, but after that long the
  browser that held it is almost surely gone, and a guest has no email to warn. Seen means
  arriving, signing in, opening the app or saving a garden. Accounts and admins are never touched.
- **The privacy page only says what was checked, and the data keeps to it.** Each claim about a
  service (Supabase, Cloudflare, Google, OpenWeather, Open-Meteo) was checked against that
  service's own documentation on the date the page gives; change the date with the words. The
  export holds the sign-in methods, what Google sent and the sessions too. Supabase Auth's audit
  log keeps the email and has no foreign key to the user, so a trigger deletes a user's lines
  with them, and a nightly `pg_cron` sweep removes any line naming a user who no longer exists.
- **People can take their data and leave.** One database function hands over everything kept
  about the caller (account, profile, gardens with their links, activity days) as a JSON file with
  a format number. Another deletes the caller's user, and every table cascades from it. Both act
  only on whoever calls them, so there is nothing to check.
- **An account waits 30 days to go.** A guest is deleted at once, since a guest has no way back
  in. An account asks instead (`request_account_deletion`): the request goes in a private table,
  every session of the account is deleted (their refresh tokens go with them), and its share
  links show nothing. Opening the app signed in calls `resume_account`, which cancels the request
  only for a session that started after it, so a tab left open on another device, whose access
  token outlives its session by up to an hour, cannot undo it. A nightly `pg_cron` job deletes
  the accounts whose 30 days are up.
- **What was exported comes back in.** The gardens list imports the account's file or one
  garden's (the same shape, with only `gardens` in it). The whole file is read and checked first,
  each plan through `migratePlan`, so nothing it cannot read is written; then every garden and
  template is added as a new copy, notes and harvests included. Share links do not come back,
  since the server makes their tokens. There is no transaction around the saves, so a failure
  part way says how many came in.

## Repository layout

| Path                | What it is                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/web`          | The React app (`src`), its static pages (`src/site`) and the Worker that serves it and `/api` (`worker`). |
| `packages/core`     | The plan schema and the gardening logic.                                                                  |
| `packages/tsconfig` | Shared TypeScript settings.                                                                               |
| `supabase`          | Migrations, local stack settings and tests of the access rules.                                           |

## Deploying

The app is one Cloudflare Worker. It needs the eight required values from `.dev.vars.example` as
secrets,
and a Supabase project with anonymous sign-ins, manual linking and the Google provider enabled,
an SMTP server for the emailed links, and the app's address as its site URL.

The first deploy is by hand, because a new Worker takes its secrets from a file:

```bash
pnpm supabase link --project-ref <project-ref>
pnpm supabase db push --remote
pnpm --filter @leira/web build
pnpm --filter @leira/web exec wrangler deploy --secrets-file <file>
```

The secrets file holds `NAME=value` lines and stays out of git. After the first deploy, change a
secret with `wrangler secret put`.

From then on a push to `main` deploys by itself: once every test has passed, CI applies the new
migrations and then publishes the Worker. It needs three secrets in the GitHub repository:

| Secret                  | What it is                                                               |
| ----------------------- | ------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | A Cloudflare API token made from the "Edit Cloudflare Workers" template. |
| `CLOUDFLARE_ACCOUNT_ID` | The id of the Cloudflare account the Worker is in.                       |
| `SUPABASE_ACCESS_TOKEN` | A Supabase access token that may write to the project's database.        |

Five steps are by hand, once:

- **The Worker's email.** The Worker confirms a request to delete an account by email, sent
  through the project's Gmail account like the sign-in links. In that Google account, with
  2-Step Verification on, make an app password for the Worker alone, apart from the one Supabase
  uses, so either can be revoked by itself. Then set the four SMTP secrets with
  `pnpm --filter @leira/web exec wrangler secret put <NAME>`: `SMTP_HOST` is `smtp.gmail.com`,
  `SMTP_PORT` is `465` (TLS from the start), `SMTP_USER` is the Gmail address and
  `SMTP_PASSWORD` the app password. They are required, so a deploy fails until they are set;
  with any of them empty the Worker sends no email and the deletion still goes ahead.

- **The captcha.** Do these in this order, or nobody can sign in. In the Cloudflare dashboard,
  open Turnstile and add a widget for the Worker's hostname, in Managed mode. Set its site key
  with `pnpm --filter @leira/web exec wrangler secret put TURNSTILE_SITE_KEY` before deploying
  the code that needs it. Once the app is live, turn on Supabase's captcha protection (Auth,
  Attack Protection) with Turnstile and the widget's secret key: until then tokens are sent but
  not checked. Turning that switch off again is the way back.

- **Web Analytics.** In the Cloudflare dashboard, open Web Analytics, add a site with the Worker's
  hostname, and copy the token from its snippet. Then
  `pnpm --filter @leira/web exec wrangler secret put WEB_ANALYTICS_TOKEN`. Without it the app
  works the same, uncounted.
- **The stats page.** In the Supabase SQL editor, make your account an admin:
  `insert into private.admins (user_id) select id from auth.users where email = '<your email>';`
- **Search engines**, optional. In Google Search Console, add a URL-prefix property for the
  Worker's address (a domain property needs a domain of your own), verify it with the HTML file
  Google gives, saved in `apps/web/public`, and submit `/sitemap.xml`. Bing Webmaster Tools can
  import the site from there. The address the pages give as their own is `SITE_URL` in
  `apps/web/src/site/site.ts`.
