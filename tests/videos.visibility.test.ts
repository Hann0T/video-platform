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
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { createContainer, type Container } from "../src/container.js";
import { seedRolesAndPermissions } from "../src/db/seed.js";
import { ROLES } from "../src/authorization/permissions.js";
import { setupTestDb, type TestDb } from "./helpers/test-db.js";

type Visibility = "private" | "public" | "unlisted";
type Actor = { id: string; token: string };

describe("feed, studio channels and IDOR protection (integration)", () => {
  let db: TestDb;
  let container: Container;
  let app: Express;
  let uploadDir: string;

  beforeAll(() => {
    db = setupTestDb();
    uploadDir = mkdtempSync(join(tmpdir(), "vps-vis-"));
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

  async function actor(email: string, roleName = ROLES.USER): Promise<Actor> {
    const user = await container.usersService.create({
      email,
      password: "password123",
      roleName,
    });
    const { tokens } = await container.authService.login({
      email,
      password: "password123",
    });
    return { id: user.id, token: tokens.accessToken };
  }

  const auth = (a: Actor) => ({ Authorization: `Bearer ${a.token}` });

  async function upload(a: Actor, title: string, visibility?: Visibility) {
    const req = request(app)
      .post(`/studio/channels/${a.id}/videos`)
      .set(auth(a))
      .field("title", title);
    if (visibility) req.field("visibility", visibility);
    const res = await req.attach("video", Buffer.from("bytes"), {
      filename: "clip.mp4",
      contentType: "video/mp4",
    });
    return res;
  }

  describe("upload visibility", () => {
    it("defaults to private", async () => {
      const a = await actor("a@example.com");
      const res = await upload(a, "Default");
      expect(res.status).toBe(201);
      expect(res.body.data.visibility).toBe("private");
    });

    it("accepts an explicit visibility", async () => {
      const a = await actor("a@example.com");
      const res = await upload(a, "Pub", "public");
      expect(res.body.data.visibility).toBe("public");
    });

    it("rejects an unknown visibility (422)", async () => {
      const a = await actor("a@example.com");
      const res = await request(app)
        .post(`/studio/channels/${a.id}/videos`)
        .set(auth(a))
        .field("title", "x")
        .field("visibility", "secret")
        .attach("video", Buffer.from("bytes"), {
          filename: "clip.mp4",
          contentType: "video/mp4",
        });
      expect(res.status).toBe(422);
    });
  });

  describe("GET /feed", () => {
    it("lists only public videos, from every user", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      await upload(a, "A public", "public");
      await upload(a, "A private", "private");
      await upload(a, "A unlisted", "unlisted");
      await upload(b, "B public", "public");

      const res = await request(app).get("/feed").set(auth(a));
      expect(res.status).toBe(200);
      const titles = res.body.data.map((v: { title: string }) => v.title).sort();
      expect(titles).toEqual(["A public", "B public"]);
    });

    it("shows the same feed to other users", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      await upload(a, "Only public", "public");
      await upload(a, "Hidden", "private");

      const res = await request(app).get("/feed").set(auth(b));
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe("Only public");
    });

    it("requires authentication (401)", async () => {
      const res = await request(app).get("/feed");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /studio/channels/:userId/videos", () => {
    it("returns all of the owner's videos in every visibility", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      await upload(a, "A private", "private");
      await upload(a, "A public", "public");
      await upload(a, "A unlisted", "unlisted");
      await upload(b, "B public", "public");

      const res = await request(app)
        .get(`/studio/channels/${a.id}/videos`)
        .set(auth(a));
      expect(res.status).toBe(200);
      const titles = res.body.data.map((v: { title: string }) => v.title).sort();
      expect(titles).toEqual(["A private", "A public", "A unlisted"]);
    });

    it("returns 403 when another user's id is used (IDOR)", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      await upload(b, "B private", "private");

      const res = await request(app)
        .get(`/studio/channels/${b.id}/videos`)
        .set(auth(a));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(JSON.stringify(res.body)).not.toContain("B private");
    });

    it("returns 403 for an id that does not exist", async () => {
      const a = await actor("a@example.com");
      const res = await request(app)
        .get("/studio/channels/not-a-real-user/videos")
        .set(auth(a));
      expect(res.status).toBe(403);
    });

    it("returns 403 even for an admin (no role overrides channel ownership)", async () => {
      const a = await actor("a@example.com");
      const admin = await actor("admin@example.com", ROLES.ADMIN);
      const res = await request(app)
        .get(`/studio/channels/${a.id}/videos`)
        .set(auth(admin));
      expect(res.status).toBe(403);
    });

    it("requires authentication (401)", async () => {
      const a = await actor("a@example.com");
      const res = await request(app).get(`/studio/channels/${a.id}/videos`);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /studio/channels/:userId/videos", () => {
    it("returns 403 and stores no file when uploading to another user's channel", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      const before = readdirSync(uploadDir).length;

      const res = await upload({ id: b.id, token: a.token }, "Planted");
      expect(res.status).toBe(403);
      expect(readdirSync(uploadDir).length).toBe(before);
      expect(await db.prisma.video.count()).toBe(0);
    });

    it("always assigns the video to the authenticated user", async () => {
      const a = await actor("a@example.com");
      const res = await upload(a, "Mine");
      expect(res.body.data.ownerId).toBe(a.id);
    });
  });

  describe("GET /videos/:id", () => {
    it("lets the owner view their private video", async () => {
      const a = await actor("a@example.com");
      const v = (await upload(a, "Private", "private")).body.data;
      const res = await request(app).get(`/videos/${v.id}`).set(auth(a));
      expect(res.status).toBe(200);
    });

    it("returns 404 (not 403) to others for private and unlisted videos", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      for (const visibility of ["private", "unlisted"] as const) {
        const v = (await upload(a, visibility, visibility)).body.data;
        const res = await request(app).get(`/videos/${v.id}`).set(auth(b));
        expect(res.status).toBe(404);
      }
    });

    it("lets other users view a public video", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      const v = (await upload(a, "Public", "public")).body.data;
      const res = await request(app).get(`/videos/${v.id}`).set(auth(b));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(v.id);
    });

    it("stops serving a video once it is made private again", async () => {
      const a = await actor("a@example.com");
      const b = await actor("b@example.com");
      const v = (await upload(a, "Toggle", "public")).body.data;
      await request(app)
        .patch(`/videos/${v.id}`)
        .set(auth(a))
        .send({ visibility: "private" });

      expect((await request(app).get(`/videos/${v.id}`).set(auth(b))).status).toBe(404);
      const feed = await request(app).get("/feed").set(auth(b));
      expect(feed.body.data).toHaveLength(0);
    });
  });

  describe("removed routes", () => {
    it("no longer exposes a global GET /videos list", async () => {
      const a = await actor("a@example.com");
      const res = await request(app).get("/videos").set(auth(a));
      expect(res.status).toBe(404);
    });

    it("no longer accepts uploads at POST /videos", async () => {
      const a = await actor("a@example.com");
      const res = await request(app).post("/videos").set(auth(a)).field("title", "x");
      expect(res.status).toBe(404);
    });
  });
});
