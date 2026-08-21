# Portable Architecture

## Design Principle

The application owns its own identity, authorization, persistence, AI-provider selection, knowledge ingestion, visitor tracking, and real-time events. Deployment is configuration-led: a PostgreSQL database, AI credentials, browser origin, and optional integration endpoints are supplied as environment variables rather than source-code constants. No support workflow relies on a platform login, proprietary database, proprietary storage, proprietary event bus, or internal API.

## Runtime Components

| Component | Portable implementation | Replacement boundary |
| --- | --- | --- |
| Web application | Node.js, Express, React, and TypeScript | Runs as a regular Node process or container. |
| Database | PostgreSQL with committed SQL migrations | Any managed or self-hosted PostgreSQL service. |
| Authentication | Application-issued, signed HTTP-only session cookie with server-side role enforcement | A future enterprise identity provider may be added behind the session adapter. |
| AI | `AIProvider` interface selected through `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` | An OpenAI-compatible provider adapter is included; support logic is independent of model vendor. |
| Knowledge | PostgreSQL documents, chunks, metadata, optional embedding JSON, and full-text search | Portable object storage can be added through a storage interface only if uploads become part of the approved scope. |
| Live events | Application `EventBus` abstraction with a Socket.IO transport | A hosted pub/sub service or PostgreSQL-backed broadcaster can replace the transport without changing domain services. |
| Location | A configurable IP-geolocation adapter | Disabled by default when no provider is configured; no precise browser location is requested. |

## Real-Time Strategy

The default self-hosted deployment uses Socket.IO over standard WebSocket transport. Browser clients connect only to this application’s own event endpoint. The server publishes messages, presence changes, escalation events, navigation events, assignments, and notifications through a central event bus. Durable domain state is always committed to PostgreSQL before an event is emitted, so reconnecting clients can recover from the API even if they missed an event.

For horizontally scaled deployments, the Socket.IO adapter may be replaced with a shared pub/sub transport and the event bus may use PostgreSQL notifications or another documented provider. This prevents in-memory process state from becoming a correctness dependency. Vercel also documents WebSocket support, but connections are bound to individual function instances and durable coordination must stay in external storage; the same application-owned event contract therefore remains valid there. [1]

## Security and Privacy Boundaries

Anonymous visitors receive a random, signed, HTTP-only browser cookie. All visitor-scoped data reads and writes are authorized against that server-validated identifier. Staff authentication uses application account credentials hashed with a portable password library; server handlers enforce `customer`, `agent`, and `administrator` permissions without trusting frontend state.

The customer-facing assistant receives approved knowledge excerpts and the visitor’s own permitted thread only. It never receives secrets, system configuration, other visitors’ records, or agent-only annotations. It applies a strict verified-information boundary and refuses prompt-injection or data-exfiltration attempts without classifying normal disagreement as hostile.

## Portable Operations

The repository includes `environment.example`, committed PostgreSQL SQL migrations, self-hosted startup commands, a Docker configuration, an architecture reference, and a portability audit. Production secrets are never committed. The target host chooses its own secrets manager, PostgreSQL host, AI provider, and TLS termination.

## Hosting Notes

The application is self-hostable on a VPS or a container platform as one Node process plus PostgreSQL. A multi-instance deployment must configure a shared event-bus adapter. Current Vercel documentation states that WebSocket connections are tied to the accepting function instance and should not store durable coordination in memory; this is why the design persists all conversation and visitor state in PostgreSQL and places live delivery behind an adapter. [1]

## References

[1] [Vercel, “WebSockets”](https://vercel.com/docs/functions/websockets)
