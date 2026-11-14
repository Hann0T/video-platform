import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { createContainer, type Container } from "../src/container.js";
import { seedRolesAndPermissions } from "../src/db/seed.js";
import { authorize } from "../src/middleware/authorize.js";
import { PERMISSIONS, ROLES } from "../src/authorization/permissions.js";
import { ok } from "../src/lib/http.js";
import { asyncHandler } from "../src/lib/async-handler.js";
import {
  errorHandler,
  notFoundHandler,
} from "../src/middleware/error-handler.js";
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

/**
 * Probe app exercising authenticate + authorize on guarded routes. Uses the
 * real container middleware (DI) so the test reflects production wiring.
 */
function buildProbeApp(container: Container): Express {
  const app = express();
  app.use(express.json());

  // Guarded by a permission ALL seeded roles have.
  app.get(
    "/needs-create",
    container.authenticate,
    authorize(PERMISSIONS.VIDEO_CREATE),
    asyncHandler(async (_req, res) => res.json(ok({ allowed: true }))),
  );

  // Guarded by a permission only admins have.
  app.get(
    "/needs-delete-any",
    container.authenticate,
    authorize(PERMISSIONS.VIDEO_DELETE_ANY),
    asyncHandler(async (_req, res) => res.json(ok({ allowed: true }))),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("authorize middleware (integration)", () => {
  let db: TestDb;
  let container: Container;
  let app: Express;

  beforeAll(async () => {
    db = setupTestDb();
    container = createContainer({ config: testConfig, prisma: db.prisma });
    app = buildProbeApp(container);
  });

  afterAll(async () => {
    await db.teardown();
  });

  async function tokenFor(email: string, roleName: string): Promise<string> {
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

  beforeEach(async () => {
    await db.reset();
    await seedRolesAndPermissions(db.prisma);
  });

  it("allows a user that has the required permission (200)", async () => {
    const token = await tokenFor("u@example.com", ROLES.USER);
    const res = await request(app)
      .get("/needs-create")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.allowed).toBe(true);
  });

  it("denies a user lacking the required permission (403)", async () => {
    const token = await tokenFor("u2@example.com", ROLES.USER);
    const res = await request(app)
      .get("/needs-delete-any")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.error.details.missing).toContain(
      PERMISSIONS.VIDEO_DELETE_ANY,
    );
  });

  it("allows an admin that has the elevated permission (200)", async () => {
    const token = await tokenFor("admin@example.com", ROLES.ADMIN);
    const res = await request(app)
      .get("/needs-delete-any")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/needs-create");
    expect(res.status).toBe(401);
  });
});
