# Video Streaming Platform (MVP)

Express + TypeScript backend with Prisma/SQLite, JWT auth (access + refresh),
an authorization layer (roles → permissions + ownership gates), and local-disk
video uploads. Layered, modular architecture with manual dependency injection.

## Architecture

```
Request → authenticate → authorize(permission) → validate(zod)
        → controller → service → gate (ownership) → prisma/storage → envelope
```

- **Controllers** are the boundary to the frontend (HTTP).
- **Services** are the only boundary **between modules**.
- **Composition root** (`src/container.ts`) is the single place services are
  constructed and their dependencies injected. `app.ts` builds routers from the
  container's instances. `server.ts` bootstraps.

### Directory layout

```
src/
  config/         env loading + Zod validation
  db/             prisma client factory, seed            (Task 3)
  modules/
    auth/         auth + token services, routes          (Tasks 4-6)
    users/        users service                          (Task 4)
    videos/       videos + storage services, routes      (Tasks 8-10)
  authorization/  permissions, gate, policies            (Task 7)
  middleware/     authenticate, authorize, validate, error-handler, upload
  lib/            http envelope + AppError, async-handler
  container.ts    composition root (DI wiring)
  app.ts          express app factory (container) => app
  server.ts       bootstrap
prisma/           schema, migrations, seed
tests/            vitest unit + integration
```

## Module Boundary Contract

1. A module may import **only another module's service class** (and its public
   types), exposed via that module's `index.ts` barrel.
2. Never import another module's controller, routes, repository, or Prisma
   models from outside the module.
3. Cross-cutting concerns (response envelope, `AppError`, Prisma client,
   `Gate`/policies) live in `lib/` and `authorization/`, not inside a feature
   module.
4. Services receive dependencies via their **constructor**; the container wires
   the graph. This makes services unit-testable by passing fakes.

## Response Envelope

```jsonc
// success
{ "data": { /* payload */ }, "error": null }
// failure
{ "data": null, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

## API Endpoints

All responses use the `{ data, error }` envelope. Protected routes require an
`Authorization: Bearer <accessToken>` header.

### Auth
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | Create a user (default `user` role) |
| POST | `/auth/login` | — | Returns `{ user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | — | Rotate: revoke old refresh token, issue new pair |
| POST | `/auth/logout` | — | Revoke a refresh token |
| GET | `/auth/me` | access token | Current user + permissions |

### Videos
| Method | Path | Permission / Gate | Description |
| --- | --- | --- | --- |
| POST | `/videos` | `video.create` | Multipart upload (`video` file + `title`, optional `description`) |
| GET | `/videos` | `video.read` | List videos (newest first) |
| GET | `/videos/:id` | `video.read` | Get one video |
| PATCH | `/videos/:id` | Gate: owner (`update.own`) or `update.any` | Update title/description |
| DELETE | `/videos/:id` | Gate: owner (`delete.own`) or `delete.any` | Delete file + row |

Coarse permission checks run as route middleware (`authorize(...)`);
ownership-aware checks (update/delete) run in the service via the injected
`Gate`, which loads the resource and applies `VideoPolicy`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start dev server (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm test` | Run Vitest once |
| `npm run prisma:migrate` | Create/apply dev migration |
| `npm run prisma:seed` | Seed roles & permissions |
| `npm run prisma:studio` | Open Prisma Studio |
