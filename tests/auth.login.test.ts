import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import jwt from "jsonwebtoken";
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

const creds = { email: "login@example.com", password: "password123" };

describe("POST /auth/login (integration)", () => {
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
    await request(app).post("/auth/register").send(creds);
  });

  it("returns access + refresh tokens for valid credentials (200)", async () => {
    const res = await request(app).post("/auth/login").send(creds);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.accessToken).toBeTypeOf("string");
    expect(res.body.data.refreshToken).toBeTypeOf("string");
    expect(res.body.data.user).toMatchObject({
      email: creds.email,
      role: "user",
    });
  });

  it("access token decodes to the correct user + role", async () => {
    const res = await request(app).post("/auth/login").send(creds);
    const decoded = jwt.verify(
      res.body.data.accessToken,
      testConfig.jwt.accessSecret,
    ) as { sub: string; email: string; role: string };
    expect(decoded.email).toBe(creds.email);
    expect(decoded.role).toBe("user");
    expect(decoded.sub).toBe(res.body.data.user.id);
  });

  it("persists a hashed refresh token row on login", async () => {
    const res = await request(app).post("/auth/login").send(creds);
    const rows = await db.prisma.refreshToken.findMany();
    expect(rows.length).toBe(1);
    // Stored value is a hash, never the raw token.
    expect(rows[0].tokenHash).not.toBe(res.body.data.refreshToken);
    expect(rows[0].tokenHash).toHaveLength(64);
    expect(rows[0].revokedAt).toBeNull();
  });

  it("rejects a wrong password with 401", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: creds.email, password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an unknown email with 401", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ghost@example.com", password: "password123" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
