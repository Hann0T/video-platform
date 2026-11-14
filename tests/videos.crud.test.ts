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
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { createContainer, type Container } from "../src/container.js";
import { seedRolesAndPermissions } from "../src/db/seed.js";
import { ROLES } from "../src/authorization/permissions.js";
import { setupTestDb, type TestDb } from "./helpers/test-db.js";

describe("video update/delete ownership (end-to-end integration)", () => {
  let db: TestDb;
  let container: Container;
  let app: Express;
  let uploadDir: string;

  beforeAll(async () => {
    db = setupTestDb();
    uploadDir = mkdtempSync(join(tmpdir(), "vps-e2e-"));
    const config = {
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
    };
    container = createContainer({ config, prisma: db.prisma });
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

  async function tokenFor(email: string, roleName = ROLES.USER): Promise<string> {
    await container.usersService.create({
      email,
      password: "password123",
      roleName,
    });
    const { tokens } = await container.authService.login({
      email,
      password: "password123",
    });
    return tokens.accessToken;
  }

  async function uploadAs(token: string, title = "Clip") {
    const res = await request(app)
      .post("/videos")
      .set("Authorization", `Bearer ${token}`)
      .field("title", title)
      .attach("video", Buffer.from("bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      });
    return res.body.data;
  }

  it("owner can update their own video", async () => {
    const token = await tokenFor("a@example.com");
    const video = await uploadAs(token);

    const res = await request(app)
      .patch(`/videos/${video.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated title", description: "new desc" });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Updated title");
    expect(res.body.data.description).toBe("new desc");
  });

  it("non-owner (plain user) is blocked from updating (403)", async () => {
    const ownerToken = await tokenFor("owner@example.com");
    const video = await uploadAs(ownerToken);
    const otherToken = await tokenFor("intruder@example.com");

    const res = await request(app)
      .patch(`/videos/${video.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ title: "Hacked" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("non-owner is blocked from deleting (403), file + row remain", async () => {
    const ownerToken = await tokenFor("owner2@example.com");
    const video = await uploadAs(ownerToken);
    const otherToken = await tokenFor("intruder2@example.com");

    const res = await request(app)
      .delete(`/videos/${video.id}`)
      .set("Authorization", `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
    expect(existsSync(join(uploadDir, video.filename))).toBe(true);
    expect(await db.prisma.video.count()).toBe(1);
  });

  it("owner can delete their own video (file + row removed)", async () => {
    const token = await tokenFor("c@example.com");
    const video = await uploadAs(token);
    expect(existsSync(join(uploadDir, video.filename))).toBe(true);

    const res = await request(app)
      .delete(`/videos/${video.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ success: true });
    expect(existsSync(join(uploadDir, video.filename))).toBe(false);
    expect(await db.prisma.video.count()).toBe(0);
  });

  it("admin can delete another user's video (delete.any)", async () => {
    const ownerToken = await tokenFor("owner3@example.com");
    const video = await uploadAs(ownerToken);
    const adminToken = await tokenFor("admin@example.com", ROLES.ADMIN);

    const res = await request(app)
      .delete(`/videos/${video.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(await db.prisma.video.count()).toBe(0);
    expect(existsSync(join(uploadDir, video.filename))).toBe(false);
  });

  it("admin can update another user's video (update.any)", async () => {
    const ownerToken = await tokenFor("owner4@example.com");
    const video = await uploadAs(ownerToken);
    const adminToken = await tokenFor("admin2@example.com", ROLES.ADMIN);

    const res = await request(app)
      .patch(`/videos/${video.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Admin edit" });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Admin edit");
  });

  it("returns 404 when updating/deleting a missing video", async () => {
    const token = await tokenFor("d@example.com");
    const upd = await request(app)
      .patch("/videos/missing-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "x" });
    expect(upd.status).toBe(404);

    const del = await request(app)
      .delete("/videos/missing-id")
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(404);
  });

  it("rejects unauthenticated update/delete (401)", async () => {
    const token = await tokenFor("e@example.com");
    const video = await uploadAs(token);

    const upd = await request(app)
      .patch(`/videos/${video.id}`)
      .send({ title: "x" });
    expect(upd.status).toBe(401);

    const del = await request(app).delete(`/videos/${video.id}`);
    expect(del.status).toBe(401);
  });
});
