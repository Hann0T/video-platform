import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../../src/db/prisma.js";

export type TestDb = {
  prisma: PrismaClient;
  url: string;
  /** Delete all rows (preserve schema). */
  reset: () => Promise<void>;
  /** Disconnect + remove the temp database directory. */
  teardown: () => Promise<void>;
};

/**
 * Provision a dedicated SQLite database in a temp directory, sync the Prisma
 * schema into it via `prisma db push`, and return a connected client plus
 * reset/teardown helpers for integration tests.
 */
export function setupTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), "vps-test-"));
  const file = join(dir, "test.db");
  const url = `file:${file}`;

  // Sync schema into the fresh DB. db push is schema-only (no migration
  // history) which is ideal and fast for test databases.
  execFileSync(
    "npx",
    ["prisma", "db", "push", "--skip-generate", "--force-reset"],
    {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "ignore",
    },
  );

  const prisma = createPrismaClient(url);

  const reset = async () => {
    // Order matters for FK constraints: children first.
    await prisma.rolePermission.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.video.deleteMany();
    await prisma.user.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.role.deleteMany();
  };

  const teardown = async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  };

  return { prisma, url, reset, teardown };
}
