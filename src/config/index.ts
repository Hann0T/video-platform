import { z } from "zod";

/**
 * Environment schema. Validates and coerces process.env into a typed config.
 * Throws a descriptive error at startup if required values are missing/invalid.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default("7d"),

  // Prisma uses DATABASE_URL. We accept it directly, or derive it from
  // DATABASE_PATH (as present in .env.example) for convenience.
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_PATH: z.string().min(1).optional(),

  UPLOAD_DIR: z.string().min(1).default("./storage/videos"),
  MAX_FILE_SIZE: z.coerce.number().int().positive().default(104857600),

  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
});

export type AppConfig = {
  port: number;
  nodeEnv: "development" | "test" | "production";
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  databaseUrl: string;
  uploadDir: string;
  maxFileSize: number;
  corsOrigin: string;
};

function resolveDatabaseUrl(
  databaseUrl: string | undefined,
  databasePath: string | undefined,
): string {
  if (databaseUrl && databaseUrl.length > 0) return databaseUrl;
  if (databasePath && databasePath.length > 0) {
    // Prisma SQLite connector expects a file: URL.
    return databasePath.startsWith("file:")
      ? databasePath
      : `file:${databasePath}`;
  }
  throw new Error(
    "Database configuration missing: set either DATABASE_URL or DATABASE_PATH",
  );
}

/**
 * Parse an arbitrary environment-like record into a validated AppConfig.
 * Exported for testability (callers can pass a synthetic env).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const e = parsed.data;
  const databaseUrl = resolveDatabaseUrl(e.DATABASE_URL, e.DATABASE_PATH);

  return {
    port: e.PORT,
    nodeEnv: e.NODE_ENV,
    jwt: {
      accessSecret: e.JWT_ACCESS_SECRET,
      refreshSecret: e.JWT_REFRESH_SECRET,
      accessExpiresIn: e.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: e.JWT_REFRESH_EXPIRES_IN,
    },
    databaseUrl,
    uploadDir: e.UPLOAD_DIR,
    maxFileSize: e.MAX_FILE_SIZE,
    corsOrigin: e.CORS_ORIGIN,
  };
}

/** Lazily-loaded singleton config built from process.env. */
let cached: AppConfig | undefined;
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
