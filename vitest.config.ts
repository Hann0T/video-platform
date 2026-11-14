import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: [],
    pool: "forks",
    // Integration tests share a single SQLite test DB; run serially to avoid
    // cross-test interference on the shared file.
    fileParallelism: false,
  },
});
