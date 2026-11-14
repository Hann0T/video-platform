import { PrismaClient } from "@prisma/client";

/**
 * Factory for a PrismaClient. Accepts an optional datasource URL so tests can
 * point at a dedicated SQLite test database without mutating process.env.
 *
 * The composition root (container.ts) owns the single production instance; the
 * client is injected into services rather than imported as a global, keeping
 * services unit-testable.
 */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient(
    databaseUrl
      ? { datasources: { db: { url: databaseUrl } } }
      : undefined,
  );
}

export type { PrismaClient } from "@prisma/client";
