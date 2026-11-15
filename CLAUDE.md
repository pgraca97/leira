# Leira

See `README.md` for the layout, setup and commands.

## Working here

- `pnpm check` (lint, typecheck, unit tests, build) must pass before a commit.
- `pnpm test:integration` and `pnpm test:e2e` need the local stack (`pnpm db:start`) and
  `apps/web/.dev.vars`. Run them after touching `src/lib`, `worker/auth.ts`, a migration or a page.
- Write the test first. Unit tests sit next to the code as `*.test.ts(x)`; a test that needs a DOM
  starts with `// @vitest-environment jsdom` and imports `src/test/setup`.

## Conventions

- Gardening logic and schemas go in `packages/core`: pure functions, no React, no I/O.
- Pages reach the server only through `Backend` (`apps/web/src/lib/backend.tsx`). Tests use
  `fakeBackend`; keep it following the same rules as the real one (version check, ownership).
- Every write to a garden goes through the editor's autosave, so it carries the loaded version.
  Do not call `gardens.save` from a component.
- The editor store (`apps/web/src/editor/store.ts`) is framework-free: React and the Phaser scene
  both subscribe to it and do not know about each other.
- Every string the user sees comes from `src/i18n/en.ts` and `pt.ts` (European Portuguese).
- Secrets never get a `VITE_` prefix. The browser reads its public settings from `/api/config`.
- A schema change is a new file in `supabase/migrations`, with its access rules tested in
  `supabase/tests/rls.test.ts`.
- Comments say why, in plain English. No em dashes anywhere.
