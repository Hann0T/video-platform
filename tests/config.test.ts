import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config/index.js";

const baseEnv = {
  JWT_ACCESS_SECRET: "a",
  JWT_REFRESH_SECRET: "r",
  DATABASE_URL: "file:./test.db",
};

describe("config loader", () => {
  it("loads a valid config with defaults applied", () => {
    const cfg = loadConfig(baseEnv as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(3000);
    expect(cfg.nodeEnv).toBe("development");
    expect(cfg.jwt.accessSecret).toBe("a");
    expect(cfg.jwt.accessExpiresIn).toBe("15m");
    expect(cfg.databaseUrl).toBe("file:./test.db");
    expect(cfg.maxFileSize).toBe(104857600);
  });

  it("derives DATABASE_URL from DATABASE_PATH when URL is absent", () => {
    const cfg = loadConfig({
      JWT_ACCESS_SECRET: "a",
      JWT_REFRESH_SECRET: "r",
      DATABASE_PATH: "./data.db",
    } as NodeJS.ProcessEnv);
    expect(cfg.databaseUrl).toBe("file:./data.db");
  });

  it("throws when a required secret is missing", () => {
    expect(() =>
      loadConfig({
        JWT_REFRESH_SECRET: "r",
        DATABASE_URL: "file:./test.db",
      } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid environment configuration/);
  });

  it("throws when database configuration is missing entirely", () => {
    expect(() =>
      loadConfig({
        JWT_ACCESS_SECRET: "a",
        JWT_REFRESH_SECRET: "r",
      } as NodeJS.ProcessEnv),
    ).toThrow(/Database configuration missing/);
  });
});
