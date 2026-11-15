import cors from "cors";
import express, { type Express } from "express";
import type { Container } from "./container.js";
import { ok } from "./lib/http.js";
import { asyncHandler } from "./lib/async-handler.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error-handler.js";
import { createAuthRouter } from "./modules/auth/index.js";
import {
  createFeedRouter,
  createStudioRouter,
  createVideosRouter,
} from "./modules/videos/index.js";

/**
 * Builds the Express application from a fully-wired container.
 *
 * app.ts owns no business logic and constructs no services. It only assembles
 * middleware and mounts routers built from the container's service instances.
 * This keeps the composition root (container.ts) as the single wiring point.
 */
export function createApp(container: Container): Express {
  const app = express();

  app.use(
    cors({
      origin: container.config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check.
  app.get(
    "/health",
    asyncHandler(async (_req, res) => {
      res.status(200).json(ok({ status: "ok" }));
    }),
  );

  // Module routers (built from the container's wired service instances).
  app.use("/auth", createAuthRouter(container.authService, container.authenticate));
  app.use(
    "/videos",
    createVideosRouter(
      container.videosService,
      container.authenticate,
      container.authenticatePlayback,
    ),
  );
  app.use(
    "/feed",
    createFeedRouter(container.videosService, container.authenticate),
  );
  app.use(
    "/studio",
    createStudioRouter(
      container.videosService,
      container.authenticate,
      container.upload,
      container.gate,
    ),
  );

  // 404 + central error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
