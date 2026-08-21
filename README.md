# Support Command

Support Command is a portable AI support, sales-assistance, knowledge-grounded, visitor-intelligence, and human-escalation application. It runs as one Node.js/Express process with a React/Vite client, PostgreSQL persistence, application-owned signed HTTP-only sessions, and Socket.IO live events.

## Requirements

Use Node.js 22 or newer, pnpm, and PostgreSQL. Configure an OpenAI-compatible provider through environment variables when AI replies are needed. Approximate IP geolocation is optional and disabled by default.

## Local setup

```bash
pnpm install --frozen-lockfile
cp environment.example .env
# Set DATABASE_URL, COOKIE_SECRET, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD,
# and the AI provider variables in .env.
pnpm run db:migrate
pnpm run bootstrap:admin
pnpm run dev
```

The customer experience is served at the configured `APP_ORIGIN`. Staff can use the protected **Staff access** entry point. Administrator controls include agent accounts, escalation settings, approved knowledge indexing, visitor monitoring, and retained conversation search.

## Production

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run audit:portability
pnpm run build
NODE_ENV=production pnpm run start
```

For a container deployment:

```bash
docker build -t support-command .
docker run --rm -p 3000:3000 --env-file .env support-command
```

TLS termination, secrets management, PostgreSQL hosting, and any optional geolocation provider remain deployment-specific. The application does not require a platform-specific service or credential.

## Data and privacy boundaries

Anonymous visitors receive a signed browser session identifier and can use support without an account. Visitor activity, presence, navigation context, and approximate location are stored only after explicit tracking consent. Precise browser GPS is never requested. Customer-facing support receives only the visitor’s permitted transcript and approved knowledge excerpts. Agent and administrator routes are protected by server-side role checks.

## Verification

The default test suite runs deterministic policy and authorization tests. The PostgreSQL lifecycle test is enabled when `INTEGRATION_DATABASE_URL` is set; it verifies persisted transcript behavior across AI handling, escalation, agent claim, agent reply, and resolution. See `portability-verification.md` for the latest verification record and known environment limitations.
