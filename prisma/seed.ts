import { createPrismaClient } from "../src/db/prisma.js";
import { seedRolesAndPermissions } from "../src/db/seed.js";

async function main() {
  const prisma = createPrismaClient();
  try {
    await seedRolesAndPermissions(prisma);
    // eslint-disable-next-line no-console
    console.log("Seed complete: roles & permissions upserted.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", err);
  process.exit(1);
});
