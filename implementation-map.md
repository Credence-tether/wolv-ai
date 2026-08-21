# Implementation Map

## Current repository state

The archive is a flattened, incomplete snapshot of a larger intended project. The product-specific domain modules are present at the repository root, but the build and deployment configuration still target a `client/`, `server/`, `scripts/`, and `migrations/` directory layout that is absent from the archive.

## Authoritative architecture to preserve

The coherent target is a portable Node.js/Express application serving a React/Vite client, backed by PostgreSQL, with application-owned signed HTTP-only sessions, a provider-neutral OpenAI-compatible AI adapter, PostgreSQL knowledge search, and Socket.IO events behind an application-owned event bus.

## Evidence of working domain logic

The repository already contains support workflow logic for visitor sessions and consent, persistent conversations and messages, knowledge-grounded AI replies, escalation, agent claim/reply/resolve transitions, notification records, activity tracking, approximate geolocation, intent classification, and a Socket.IO event layer.

## Blocking inconsistencies

| Area | Finding | Required repair |
| --- | --- | --- |
| TypeScript inputs | `tsconfig.json` includes missing `client/src`, `server`, and `scripts` paths, so the baseline check reports no inputs. | Retarget the compiler to the actual portable source layout, or restore a single coherent layout without duplicate runtimes. |
| Package scripts | `dev`, `build`, database, ingestion, retention, and admin scripts point at missing `server/` and `scripts/` files. | Point scripts at the actual root entrypoints or create a coherent directory structure using existing files only. |
| Server entrypoint | `index.ts` is stale and imports missing tRPC, OAuth, storage, context, and legacy Vite modules. | Replace it with one Express/Socket.IO runtime that exposes the existing REST contracts and serves the built React app. |
| Frontend build | `vite.config.ts` expects missing `client/` sources; existing React components import missing `@/lib`, hooks, and UI modules. | Restore the minimal client entry/lib modules and make Vite build the actual source tree. |
| Missing server modules | Core domain files import missing `env`, `session`, and `ai` modules. | Implement provider-neutral environment parsing, signed cookie sessions, and the AI adapter using declared dependencies. |
| Database migrations | `0001_initial.sql` starts in the middle of `app_users` creation and migration discovery expects an absent directory. | Repair the SQL migration and make the migration runner use the committed root SQL files. |
| Dependencies | Existing code references undeclared `@trpc/server` and `nanoid`. | Remove stale references and use existing declared dependencies; do not add dependency churn. |
| Runtime tests | The integration test assumes missing `server/` paths and only runs when an integration database is configured. | Retarget it to the authoritative root modules and add deterministic unit/API coverage where possible. |

## Baseline verification

`pnpm install --no-frozen-lockfile` completed using the already declared dependency set. The baseline `pnpm run check` fails with `TS18003: No inputs were found` because the configured source paths do not exist.

## Repair strategy

1. Retain the existing domain modules and UI where they express the required product behavior.
2. Remove stale framework remnants from the production path rather than introducing a second runtime.
3. Add only small application-owned adapters that are required to connect the existing code: environment, sessions, AI provider, realtime event server, API routes, client entry, API helper, types, and hook.
4. Keep all deployment-specific values in environment variables and preserve PostgreSQL, Docker, and standard Node hosting.
5. Verify the browser-to-API-to-database-to-event path when a PostgreSQL service is available, while still ensuring build and static checks work without provider credentials.
