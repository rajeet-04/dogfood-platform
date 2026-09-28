# Phase 1: Runtime, Identity & Sessions

## Goal

A seeded offline-capable application boots with PostgreSQL and supports secure local registration, login, logout, and session resolution.

## Database

### users
- id UUID PK
- email CITEXT UNIQUE NOT NULL
- password_hash TEXT NOT NULL
- display_name TEXT NOT NULL
- is_platform_admin BOOLEAN NOT NULL DEFAULT false
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

### sessions
- id UUID PK
- user_id UUID FK users ON DELETE CASCADE
- token_hash BYTEA UNIQUE NOT NULL
- expires_at TIMESTAMPTZ NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- last_seen_at TIMESTAMPTZ NULL

Indexes: `sessions(token_hash)`, `sessions(user_id)`, `sessions(expires_at)`.

## Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session`
- `GET /api/health`
- `GET /api/ready`

## Services

- `hashPassword(password)`
- `verifyPassword(password, encodedHash)`
- `createSession(userId)`
- `resolveSession(cookieToken)`
- `revokeSession(sessionId)`
- `requireActor(request)`

## Security

- Argon2id password hashing.
- Opaque random session token, only token hash stored.
- Secure HttpOnly SameSite=Lax cookie.
- Generic login failure message.
- Session expiration enforced server-side.
- CSRF strategy established before unsafe cookie-auth routes.

## Runtime

Compose services:
- `web`
- `db`

Seed process must create fixture users required by official suite.

## Tests

- duplicate email rejected;
- wrong password rejected without account enumeration;
- valid login creates session;
- revoked/expired session rejected;
- application readiness fails when DB unavailable;
- fresh Compose boot reaches ready state.

## UI

- register page;
- login page;
- logout action;
- session-aware top-level navigation.

## Exit gate

A clean offline Compose environment boots, seed completes, authentication works, and auth integration tests are green.
