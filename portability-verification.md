# Portability Verification

## Result

The application now has one authoritative portable runtime: a standard Node.js process running Express, serving the React/Vite client, using PostgreSQL for durable state, an application-owned signed cookie session, a provider-neutral OpenAI-compatible AI adapter, and Socket.IO through a central event bus. No production path depends on Manus-specific services, credentials, URLs, database adapters, or deployment mechanisms.

## Executed Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Type safety | Passed | `pnpm run check` completed with no TypeScript errors. |
| Deterministic safety and authorization tests | Passed | `pnpm test` passed prompt-injection classification, normal-disagreement classification, knowledge fallback, escalation threshold behavior, state-transition rules, ownership isolation, and complexity escalation tests. |
| Optional PostgreSQL lifecycle test | Not run in this environment | `support.integration.test.ts` is intentionally skipped unless `INTEGRATION_DATABASE_URL` is provided. No local PostgreSQL service or container runtime was available in the sandbox. |
| Production build | Passed | `pnpm run build` emitted `dist/public` browser assets and `dist/index.js`. |
| Production startup | Passed | The bundled process listened successfully and served both `/api/health` and the built HTML shell. |
| Source portability audit | Passed | `pnpm run audit:portability` scanned the authoritative root runtime and found no prohibited platform-runtime identifiers. |
| Dependency reproducibility | Passed | `pnpm install --frozen-lockfile` completed without changing the declared dependency set. |
| Database migrations | Prepared and path-verified | `migrate.ts` now discovers `0001_initial.sql` and `0002_visitor_tracking_consent.sql` from the repository root and applies them transactionally. Execution requires a PostgreSQL `DATABASE_URL`. |
| Administrator bootstrap | Prepared and path-verified | `bootstrap-admin.ts` creates or refreshes the application-owned administrator account using `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Execution requires a migrated PostgreSQL database. |
| Browser-to-database workflow | Requires external PostgreSQL verification | The runtime routes, authorization checks, consent gates, persistence, and event emissions are wired; the full database-backed lifecycle should be run with a real PostgreSQL service before production release. |

## Reproduction Commands

```bash
pnpm install --frozen-lockfile
cp environment.example .env
pnpm run db:migrate
pnpm run bootstrap:admin
pnpm run check
pnpm test
pnpm run build
pnpm run start
```

For a container deployment, pass the variables from `environment.example` through the selected platform’s environment configuration and run:

```bash
docker build -t support-command .
docker run --rm -p 3000:3000 --env-file .env support-command
```

The application expects a PostgreSQL database reachable through `DATABASE_URL`. Configure an OpenAI-compatible provider and index approved business content before enabling production AI responses. Approximate geolocation remains disabled unless a provider URL and key are explicitly configured.

## Runtime Boundaries

Anonymous visitors receive a signed, HTTP-only cookie identifier. Conversation reads and writes are constrained to that visitor identifier, while staff routes require a separately signed staff session and enforce agent or administrator roles server-side. Visitor activity, presence, navigation context, and approximate location are stored only after explicit tracking consent. The customer assistant receives approved knowledge excerpts and its own permitted transcript, not internal configuration or other visitors’ records.
