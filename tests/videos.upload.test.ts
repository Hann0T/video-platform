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
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { createContainer, type Container } from "../src/container.js";
import { seedRolesAndPermissions } from "../src/db/seed.js";
import { setupTestDb, type TestDb } from "./helpers/test-db.js";

const creds = { email: "uploader@example.com", password: "password123" };

describe("videos upload + list/get (integration)", () => {
  let db: TestDb;
  let container: Container;
  let app: Express;
  let uploadDir: string;

  beforeAll(async () => {
    db = setupTestDb();
    uploadDir = mkdtempSync(join(tmpdir(), "vps-videos-"));
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
      maxFileSize: 1024 * 1024, // 1 MB
      corsOrigin: "http://localhost:3000",
    };
    container = createContainer({ config, prisma: db.prisma });
    app = createApp(container);
  });

  afterAll(async () => {
    await db.teardown();
    rmSync(uploadDir, { recursive: true, force: true });
  });

  async function accessToken(): Promise<string> {
    await request(app).post("/auth/register").send(creds);
    const res = await request(app).post("/auth/login").send(creds);
    return res.body.data.accessToken;
  }

  beforeEach(async () => {
    await db.reset();
    await seedRolesAndPermissions(db.prisma);
  });

  it("uploads a video, stores the file, and persists metadata (201)", async () => {
    const token = await accessToken();
    const res = await request(app)
      .post("/videos")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Holiday clip")
      .field("description", "Beach")
      .attach("video", Buffer.from("fake-mp4-bytes"), {
        filename: "holiday.mp4",
        contentType: "video/mp4",
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "Holiday clip",
      description: "Beach",
      mimeType: "video/mp4",
    });
    expect(res.body.data.ownerId).toBeTypeOf("string");

    // File is on disk.
    expect(existsSync(join(uploadDir, res.body.data.filename))).toBe(true);
    // Row is in DB.
    const count = await db.prisma.video.count();
    expect(count).toBe(1);
  });

  it("rejects an unauthenticated upload with 401", async () => {
    const res = await request(app)
      .post("/videos")
      .field("title", "x")
      .attach("video", Buffer.from("bytes"), {
        filename: "x.mp4",
        contentType: "video/mp4",
      });
    expect(res.status).toBe(401);
  });

  it("rejects a non-video file with 415", async () => {
    const token = await accessToken();
    const res = await request(app)
      .post("/videos")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "x")
      .attach("video", Buffer.from("text"), {
        filename: "note.txt",
        contentType: "text/plain",
      });
    expect(res.status).toBe(415);
  });

  it("rejects missing title with 422 (validation runs after multer)", async () => {
    const token = await accessToken();
    const res = await request(app)
      .post("/videos")
      .set("Authorization", `Bearer ${token}`)
      .attach("video", Buffer.from("bytes"), {
        filename: "x.mp4",
        contentType: "video/mp4",
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lists videos and gets one by id", async () => {
    const token = await accessToken();
    const created = await request(app)
      .post("/videos")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Clip A")
      .attach("video", Buffer.from("bytes"), {
        filename: "a.mp4",
        contentType: "video/mp4",
      });
    const id = created.body.data.id;

    const list = await request(app)
      .get("/videos")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);

    const one = await request(app)
      .get(`/videos/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(one.status).toBe(200);
    expect(one.body.data.id).toBe(id);
  });

  it("returns 404 for a missing video id", async () => {
    const token = await accessToken();
    const res = await request(app)
      .get("/videos/nonexistent-id")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("stores exactly one new file per successful upload (no orphans)", async () => {
    const token = await accessToken();
    const before = readdirSync(uploadDir).length;
    const res = await request(app)
      .post("/videos")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Clip")
      .attach("video", Buffer.from("bytes"), {
        filename: "c.mp4",
        contentType: "video/mp4",
      });
    const after = readdirSync(uploadDir).length;
    // One successful upload adds exactly one file (no orphan, no duplicate).
    expect(after).toBe(before + 1);
    expect(existsSync(join(uploadDir, res.body.data.filename))).toBe(true);
  });
});
