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
    accessSecret: "a",
    refreshSecret: "r",
    accessExpiresIn: "15m",
    refreshExpiresIn: "7d",
  },
  databaseUrl: "file:./unused.db",
  uploadDir: "./storage/videos",
  maxFileSize: 104857600,
  corsOrigin: "http://localhost:3000",
};

describe("POST /auth/register (integration)", () => {
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

  it("registers a new user and returns a sanitized envelope (201)", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "alice@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({
      email: "alice@example.com",
      role: "user",
    });
    expect(res.body.data.id).toBeTypeOf("string");
    // passwordHash must never be exposed.
    expect(res.body.data).not.toHaveProperty("passwordHash");
    expect(res.body.data).not.toHaveProperty("password");
  });

  it("persists the user with a hashed password (not plaintext)", async () => {
    await request(app)
      .post("/auth/register")
      .send({ email: "bob@example.com", password: "password123" });

    const user = await db.prisma.user.findUnique({
      where: { email: "bob@example.com" },
    });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe("password123");
    expect(user!.passwordHash.length).toBeGreaterThan(20);
  });

  it("rejects a duplicate email with 409", async () => {
    const payload = { email: "dup@example.com", password: "password123" };
    await request(app).post("/auth/register").send(payload);
    const res = await request(app).post("/auth/register").send(payload);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects invalid input with 422", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "not-an-email", password: "short" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.issues.length).toBeGreaterThan(0);
  });
});
