import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { createApp } from "../src/app.js";
import { createContainer } from "../src/container.js";
import { ok, AppError, ForbiddenError } from "../src/lib/http.js";
import { asyncHandler } from "../src/lib/async-handler.js";
import { validate } from "../src/middleware/validate.js";
import {
  errorHandler,
  notFoundHandler,
} from "../src/middleware/error-handler.js";

const testConfig = {
  port: 3000,
  nodeEnv: "test" as const,
  jwt: {
    accessSecret: "a",
    refreshSecret: "r",
    accessExpiresIn: "15m",
    refreshExpiresIn: "7d",
  },
  databaseUrl: "file:./test.db",
  uploadDir: "./storage/videos",
  maxFileSize: 104857600,
  corsOrigin: "http://localhost:3000",
};

describe("app skeleton (real app)", () => {
  const app = createApp(createContainer({ config: testConfig }));

  it("GET /health returns a success envelope", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: "ok" }, error: null });
  });

  it("unknown route returns a 404 failure envelope", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

/** A throwaway app exercising the error + validation middleware directly. */
function buildProbeApp() {
  const app = express();
  app.use(express.json());

  app.get(
    "/throw-app-error",
    asyncHandler(async () => {
      throw new ForbiddenError("nope");
    }),
  );

  app.get(
    "/throw-generic",
    asyncHandler(async () => {
      throw new Error("boom");
    }),
  );

  app.post(
    "/validate",
    validate({ body: z.object({ name: z.string().min(2) }) }),
    asyncHandler(async (req, res) => {
      res.json(ok(req.body));
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("error + validation middleware", () => {
  const app = buildProbeApp();

  it("maps AppError to its status + envelope", async () => {
    const res = await request(app).get("/throw-app-error");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      data: null,
      error: { code: "FORBIDDEN", message: "nope" },
    });
  });

  it("maps unknown errors to a 500 envelope", async () => {
    const res = await request(app).get("/throw-generic");
    expect(res.status).toBe(500);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("rejects invalid body with a 422 validation envelope", async () => {
    const res = await request(app).post("/validate").send({ name: "x" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.issues[0].path).toBe("name");
  });

  it("passes valid body through", async () => {
    const res = await request(app).post("/validate").send({ name: "alice" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { name: "alice" }, error: null });
  });
});

describe("AppError base", () => {
  it("carries status, code, message, details", () => {
    const e = new AppError(418, "TEAPOT", "I'm a teapot", { foo: 1 });
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe("TEAPOT");
    expect(e.message).toBe("I'm a teapot");
    expect(e.details).toEqual({ foo: 1 });
  });
});
