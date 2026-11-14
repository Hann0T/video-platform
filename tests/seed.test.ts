import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, type TestDb } from "./helpers/test-db.js";
import { seedRolesAndPermissions } from "../src/db/seed.js";
import {
  ROLES,
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
} from "../src/authorization/permissions.js";

describe("seed: roles & permissions", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = setupTestDb();
    await db.reset();
    await seedRolesAndPermissions(db.prisma);
  });

  afterAll(async () => {
    await db.teardown();
  });

  it("creates the full permission catalogue", async () => {
    const count = await db.prisma.permission.count();
    expect(count).toBe(ALL_PERMISSIONS.length);
  });

  it("creates the user and admin roles", async () => {
    const roles = await db.prisma.role.findMany({ select: { name: true } });
    const names = roles.map((r) => r.name).sort();
    expect(names).toEqual([ROLES.ADMIN, ROLES.USER].sort());
  });

  it("attaches the correct permission bundle to the user role", async () => {
    const role = await db.prisma.role.findUniqueOrThrow({
      where: { name: ROLES.USER },
      include: { permissions: { include: { permission: true } } },
    });
    const perms = role.permissions.map((p) => p.permission.name).sort();
    expect(perms).toEqual([...ROLE_PERMISSIONS[ROLES.USER]].sort());
  });

  it("gives admin the delete.any permission that user lacks", async () => {
    const admin = await db.prisma.role.findUniqueOrThrow({
      where: { name: ROLES.ADMIN },
      include: { permissions: { include: { permission: true } } },
    });
    const perms = admin.permissions.map((p) => p.permission.name);
    expect(perms).toContain("video.delete.any");
    expect(perms.sort()).toEqual([...ROLE_PERMISSIONS[ROLES.ADMIN]].sort());
  });

  it("is idempotent (second seed does not duplicate rows)", async () => {
    await seedRolesAndPermissions(db.prisma);
    expect(await db.prisma.permission.count()).toBe(ALL_PERMISSIONS.length);
    const userRole = await db.prisma.role.findUniqueOrThrow({
      where: { name: ROLES.USER },
      include: { permissions: true },
    });
    expect(userRole.permissions.length).toBe(
      ROLE_PERMISSIONS[ROLES.USER].length,
    );
  });
});
