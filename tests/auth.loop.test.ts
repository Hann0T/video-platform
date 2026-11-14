import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { createContainer } from "../src/container.js";
import { seedRolesAndPermissions } from "../src/db/seed.js";
import { setupTestDb, type TestDb } from "./helpers/test-db.js";

const testConfig = {
  port: 3000,
  nodeEnv: "test" as const,
  jwt: {
    accessSecret: "access-secret",
    refreshSecret: "refresh-secret",
    accessExpiresIn: "15m",
    refreshExpiresIn: "7d",
  },
  databaseUrl: "file:./unused.db",
  uploadDir: "./storage/videos",
  maxFileSize: 104857600,
  corsOrigin: "http://localhost:3000",
};

const creds = { email: "loop@example.com", password: "password123" };

async function registerAndLogin(app: Express) {
  await request(app).post("/auth/register").send(creds);
  const res = await request(app).post("/auth/login").send(creds);
  return res.body.data as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };
}

describe("auth loop: authenticate / refresh / logout (integration)", () => {
  let db: TestDb;
  let app: Express;

  beforeAll(async () => {
    db = setupTestDb();
    app = createApp(
      createContainer({ config: testConfig, prisma: db.prisma }),
    );
  });

  afterAll(async () => {
    await db.teardown();
  });

  beforeEach(async () => {
    await db.reset();
    await seedRolesAndPermissions(db.prisma);
  });

  describe("GET /auth/me (authenticate)", () => {
    it("returns the user with permissions for a valid access token", async () => {
      const { accessToken } = await registerAndLogin(app);
      const res = await request(app)
        .get("/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(creds.email);
      expect(res.body.data.role).toBe("user");
      expect(Array.isArray(res.body.data.permissions)).toBe(true);
      expect(res.body.data.permissions).toContain("video.create");
    });

    it("rejects a missing Authorization header with 401", async () => {
      const res = await request(app).get("/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects a malformed/invalid token with 401", async () => {
      const res = await request(app)
        .get("/auth/me")
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/refresh (rotation)", () => {
    it("issues a new pair and invalidates the old refresh token", async () => {
      const { refreshToken } = await registerAndLogin(app);

      const res = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTypeOf("string");
      expect(res.body.data.refreshToken).toBeTypeOf("string");
      expect(res.body.data.refreshToken).not.toBe(refreshToken);

      // Reusing the OLD (now revoked) refresh token must fail (replay defense).
      const reuse = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken });
      expect(reuse.status).toBe(401);
    });

    it("the new refresh token works for a subsequent refresh", async () => {
      const { refreshToken } = await registerAndLogin(app);
      const first = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken });
      const second = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken: first.body.data.refreshToken });
      expect(second.status).toBe(200);
    });
  });

  describe("POST /auth/logout", () => {
    it("revokes the refresh token so it can no longer be refreshed", async () => {
      const { refreshToken } = await registerAndLogin(app);

      const out = await request(app)
        .post("/auth/logout")
        .send({ refreshToken });
      expect(out.status).toBe(200);
      expect(out.body.data).toEqual({ success: true });

      const row = await db.prisma.refreshToken.findFirst();
      expect(row?.revokedAt).not.toBeNull();

      const refresh = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken });
      expect(refresh.status).toBe(401);
    });

    it("is idempotent (logging out an unknown token still 200s)", async () => {
      const res = await request(app)
        .post("/auth/logout")
        .send({ refreshToken: "unknown-token" });
      expect(res.status).toBe(200);
    });
  });
});
