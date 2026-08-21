# Wolv-AI Repair Summary

## Outcome

The attached archive was an incomplete flattened snapshot: its support domain modules existed, but the build, server, client, migration, and Docker configuration still targeted missing `client/`, `server/`, `scripts/`, and `migrations/` directories. The repaired project now has one authoritative portable runtime built around the existing declared Express, React/Vite, PostgreSQL, Socket.IO, bcrypt, jose, Cheerio, and Zod dependencies. No Manus-specific configuration, service, API, path, credential, or deployment mechanism was added.

## Implemented

| Area | Result |
| --- | --- |
| Runtime | Replaced the stale tRPC/OAuth entrypoint with one Express server and one Socket.IO event bus. |
| Client | Restored the React entrypoint, API helper, shared types, status component, realtime hook, staff login, customer shell, agent workspace, admin console, and responsive styles. |
| Authentication | Added signed HTTP-only anonymous visitor cookies and application-owned signed staff sessions with bcrypt password verification. |
| Authorization | Added server-side staff role enforcement, visitor ownership checks, customer isolation helpers, and protected visitor/admin/agent routes. |
| Support workflow | Reconnected persistent conversations, transcripts, AI handling, strict knowledge fallback, prompt-injection refusal, escalation, handoff summaries, agent claim/reply/resolve, notifications, and live events. |
| Visitor intelligence | Preserved consent-gated presence, activity, navigation, approximate location, session metadata, and staff monitoring. The visitor socket now supports consented arrival/presence updates before chat opens. |
| Knowledge | Repaired approved-source persistence/search and same-host website crawling, with malformed search failures failing closed into escalation rather than fabricated answers. |
| Migrations and operations | Repaired the initial SQL schema, consent migration discovery, admin bootstrap, ingestion, retention, portability audit, package scripts, Dockerfile, README, and environment template. |
| Legacy cleanup | Removed stale runtime imports from the production path, renamed the Vite helper to avoid shadowing the Vite package, and excluded unused legacy UI fragments from the authoritative build. |

## Verification performed

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed. |
| `pnpm run check` | Passed with no TypeScript errors. |
| `pnpm test` | Passed: 3 deterministic tests; the PostgreSQL integration test was skipped because no `INTEGRATION_DATABASE_URL` was available. |
| `pnpm run audit:portability` | Passed with no prohibited platform-runtime identifiers. |
| `pnpm run build` | Passed; emitted `dist/public` and `dist/index.js`. |
| Production startup smoke test | Passed; served `/api/health`, the HTML shell, and JSON 404 responses for unknown API routes. |
| PostgreSQL migration/lifecycle test | Prepared but not executed in this sandbox because no local PostgreSQL service or container runtime was available. Run it against a real PostgreSQL database before production release. |

## Deployment notes

Copy `environment.example` into the deployment system’s environment configuration, set strong `COOKIE_SECRET` and `SESSION_SECRET` values, provide `DATABASE_URL`, run `pnpm run db:migrate`, bootstrap the administrator with `pnpm run bootstrap:admin`, and configure the AI provider and approved knowledge source before enabling production AI responses. The application remains deployable as a regular Node process, Docker container, VPS service, or compatible cloud workload.
