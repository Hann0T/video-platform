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
| GET | `/feed` | `video.read` | Every **public** video, newest first |
| GET | `/studio/channels/:userId/videos` | Channel owner only | All of the owner's videos, any visibility |
| POST | `/studio/channels/:userId/videos` | Channel owner only + `video.create` | Multipart upload (`video` file + `title`, optional `description`, optional `visibility`) |
| GET | `/videos/:id` | Gate: view | Get one video |
| POST | `/videos/:id/playback` | Gate: view | Returns `{ url, expiresAt }`, a short-lived signed stream URL |
| GET/HEAD | `/videos/:id/stream?token=…` | Playback token + Gate: view | Video bytes with HTTP Range support (200 / 206 / 416) |
| PATCH | `/videos/:id` | Gate: view + owner (`update.own`) or `update.any` | Update title/description/visibility |
| DELETE | `/videos/:id` | Gate: view + owner (`delete.own`) or `delete.any` | Delete file + row |

### Visibility rules

Each video is `private` (default), `public` or `unlisted`.

- **View:** the owner can always view. Moderators (`update.any` or
  `delete.any`) can view any video. Everyone else needs `video.read` and the
  video must be `public`. `unlisted` behaves like `private` until link-based
  access exists.
- **Not viewable means 404.** `GET`, `PATCH` and `DELETE /videos/:id` answer
  404 for a video the user can't view, the same as for a missing id, so private
  videos can't be discovered by guessing ids.
- **Channels are owner-only.** `/studio/channels/:userId/*` answers 403 unless
  `:userId` is the authenticated user. No role overrides this. The check runs
  before multer, so a rejected upload never writes a file.

Coarse permission checks run as route middleware (`authorize(...)`);
ownership- and visibility-aware checks run in the service via the injected
`Gate`, which loads the resource and applies `VideoPolicy`.

### Streaming

A `<video>` element can't send an `Authorization` header, so playback is a
two-step flow:

1. The client calls `POST /videos/:id/playback` with its Bearer token. If the
   user can view the video, the server returns a URL like
   `/videos/:id/stream?token=…`.
2. The client sets that URL as the `<video>` `src`. The browser then makes
   `Range` requests to it for playback and seeking.

The playback token is a JWT bound to one user and one video, with
`aud: "playback"`. It is signed with its own key (`STREAM_TOKEN_SECRET`, or an
HMAC derived from `JWT_ACCESS_SECRET` when unset), so it can't be used as an
access token, and the reverse doesn't work either. It expires after
`STREAM_TOKEN_EXPIRES_IN` (default `2h`). The stream endpoint loads the user and
re-checks the view rule on every request, so making a video private stops
playback immediately, even for URLs already handed out.

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
