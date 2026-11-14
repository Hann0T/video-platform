import type { PrismaClient } from "@prisma/client";
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  type RoleName,
} from "../authorization/permissions.js";

/**
 * Idempotently seed the permission catalogue, roles, and the role→permission
 * bundles. Safe to run multiple times (upserts + skipDuplicates).
 *
 * Reusable from both the CLI seed (prisma/seed.ts) and test setup.
 */
export async function seedRolesAndPermissions(
  prisma: PrismaClient,
): Promise<void> {
  // 1. Upsert all permissions.
  for (const name of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // 2. Upsert roles and attach their bundled permissions.
  for (const roleName of Object.values(ROLES) as RoleName[]) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    const permNames = ROLE_PERMISSIONS[roleName];
    const perms = await prisma.permission.findMany({
      where: { name: { in: permNames } },
    });

    // SQLite's Prisma connector does not support createMany({ skipDuplicates }).
    // Upsert each join row individually (idempotent via composite PK).
    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
}
