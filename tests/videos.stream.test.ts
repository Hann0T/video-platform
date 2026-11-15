import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import request from "supertest";
import type { Express } from "express";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { createContainer, type Container } from "../src/container.js";
import { seedRolesAndPermissions } from "../src/db/seed.js";
import { setupTestDb, type TestDb } from "./helpers/test-db.js";

type Actor = { id: string; token: string };

// 256 distinct-ish bytes so range slices are easy to check.
const FILE = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

/** supertest helper: collect a binary body as a Buffer. */
function binary(res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
}

describe("playback URLs + /videos/:id/stream (integration)", () => {
  let db: TestDb;
  let container: Container;
  let app: Express;
  let uploadDir: string;

  beforeAll(() => {
    db = setupTestDb();
    uploadDir = mkdtempSync(join(tmpdir(), "vps-stream-"));
    container = createContainer({
      config: {
        port: 3000,
        nodeEnv: "test" as const,
        jwt: {
          accessSecret: "access-secret",
          refreshSecret: "refresh-secret",
          accessExpiresIn: "15m",
          refreshExpiresIn: "7d",
        },
        databaseUrl: "file:./unused.db",
        uploadDir,
        maxFileSize: 1024 * 1024,
        corsOrigin: "http://localhost:3000",
      },
      prisma: db.prisma,
    });
    app = createApp(container);
  });

  afterAll(async () => {
    await db.teardown();
    rmSync(uploadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await db.reset();
    await seedRolesAndPermissions(db.prisma);
  });

  async function actor(email: string): Promise<Actor> {
    const user = await container.usersService.create({ email, password: "password123" });
    const { tokens } = await container.authService.login({ email, password: "password123" });
    return { id: user.id, token: tokens.accessToken };
  }
  const auth = (a: Actor) => ({ Authorization: `Bearer ${a.token}` });

  async function upload(a: Actor, visibility: "private" | "public" | "unlisted" = "public") {
    const res = await request(app)
      .post(`/studio/channels/${a.id}/videos`)
      .set(auth(a))
      .field("title", "Clip")
      .field("visibility", visibility)
      .attach("video", FILE, { filename: "clip.mp4", contentType: "video/mp4" });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; filename: string };
  }

  async function playbackUrl(a: Actor, videoId: string): Promise<string> {
    const res = await request(app).post(`/videos/${videoId}/playback`).set(auth(a));
    expect(res.status).toBe(200);
    return res.body.data.url;
  }

  describe("POST /videos/:id/playback", () => {
    it("returns a stream URL and expiry for a viewable video", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      const res = await request(app).post(`/videos/${v.id}/playback`).set(auth(a));
      expect(res.status).toBe(200);
      expect(res.body.data.url).toMatch(new RegExp(`^/videos/${v.id}/stream\\?token=`));
      expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("returns 404 for another user's private video", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      const v = await upload(a, "private");
      const res = await request(app).post(`/videos/${v.id}/playback`).set(auth(b));
      expect(res.status).toBe(404);
    });

    it("requires authentication (401)", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      expect((await request(app).post(`/videos/${v.id}/playback`)).status).toBe(401);
    });
  });

  describe("GET /videos/:id/stream", () => {
    it("serves the whole file with 200 when no Range is sent", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      const res = await request(app)
        .get(await playbackUrl(a, v.id))
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("video/mp4");
      expect(res.headers["accept-ranges"]).toBe("bytes");
      expect(res.headers["content-length"]).toBe(String(FILE.length));
      expect(Buffer.compare(res.body, FILE)).toBe(0);
    });

    it("serves a byte range with 206 and Content-Range", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      const res = await request(app)
        .get(await playbackUrl(a, v.id))
        .set("Range", "bytes=10-19")
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(206);
      expect(res.headers["content-range"]).toBe(`bytes 10-19/${FILE.length}`);
      expect(res.headers["content-length"]).toBe("10");
      expect(Buffer.compare(res.body, FILE.subarray(10, 20))).toBe(0);
    });

    it("serves an open-ended range to the end of the file", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      const res = await request(app)
        .get(await playbackUrl(a, v.id))
        .set("Range", "bytes=250-")
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(206);
      expect(res.headers["content-range"]).toBe(`bytes 250-255/${FILE.length}`);
      expect(Buffer.compare(res.body, FILE.subarray(250))).toBe(0);
    });

    it("answers 416 for a range past the end", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      const res = await request(app)
        .get(await playbackUrl(a, v.id))
        .set("Range", "bytes=9999-");
      expect(res.status).toBe(416);
      expect(res.headers["content-range"]).toBe(`bytes */${FILE.length}`);
    });

    it("answers HEAD with headers and no body", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      const res = await request(app).head(await playbackUrl(a, v.id));
      expect(res.status).toBe(200);
      expect(res.headers["content-length"]).toBe(String(FILE.length));
    });

    it("lets another user stream a public video with their own URL", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      const v = await upload(a, "public");
      const res = await request(app).get(await playbackUrl(b, v.id)).buffer(true).parse(binary);
      expect(res.status).toBe(200);
    });

    it("requires a token (401)", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      expect((await request(app).get(`/videos/${v.id}/stream`)).status).toBe(401);
    });

    it("rejects an access token used as a playback token (401)", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      const res = await request(app).get(`/videos/${v.id}/stream?token=${a.token}`);
      expect(res.status).toBe(401);
    });

    it("rejects a playback token used as an access token (401)", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      const token = new URL(await playbackUrl(a, v.id), "http://x").searchParams.get("token");
      const res = await request(app).get(`/videos/${v.id}`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it("rejects a token issued for a different video (401)", async () => {
      const a = await actor("a@example.com");
      const v1 = await upload(a);
      const v2 = await upload(a);
      const url = await playbackUrl(a, v1.id);
      const res = await request(app).get(url.replace(v1.id, v2.id));
      expect(res.status).toBe(401);
    });

    it("rejects an expired token (401)", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      // Same key the container derives when STREAM_TOKEN_SECRET is unset.
      const secret = createHmac("sha256", "access-secret")
        .update("playback-token-v1")
        .digest("hex");
      const stale = jwt.sign(
        {
          sub: a.id,
          vid: v.id,
          aud: "playback",
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        secret,
      );
      // Sanity check: the same claims with a future expiry are accepted.
      const fresh = jwt.sign({ sub: a.id, vid: v.id }, secret, {
        audience: "playback",
        expiresIn: "1m",
      });
      expect((await request(app).head(`/videos/${v.id}/stream?token=${fresh}`)).status).toBe(200);

      const res = await request(app).get(`/videos/${v.id}/stream?token=${stale}`);
      expect(res.status).toBe(401);
    });

    it("stops streaming once the owner makes the video private", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      const v = await upload(a, "public");
      const url = await playbackUrl(b, v.id);

      await request(app).patch(`/videos/${v.id}`).set(auth(a)).send({ visibility: "private" });

      const res = await request(app).get(url);
      expect(res.status).toBe(404);
    });

    it("returns 404 when the file is missing on disk", async () => {
      const a = await actor("a@example.com");
      const v = await upload(a);
      unlinkSync(join(uploadDir, v.filename));
      const res = await request(app).get(await playbackUrl(a, v.id));
      expect(res.status).toBe(404);
    });
  });
});
