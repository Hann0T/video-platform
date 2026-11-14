import { Router, type RequestHandler } from "express";
import { validate } from "../../middleware/validate.js";
import type { AuthService } from "./auth.service.js";
import { createAuthController } from "./auth.controller.js";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "./auth.schemas.js";

/**
 * Router factory. Wires validation middleware + controller handlers for the
 * auth module. Receives its service + the shared `authenticate` middleware
 * from the composition root (via app.ts).
 */
export function createAuthRouter(
  authService: AuthService,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const controller = createAuthController(authService);

  router.post(
    "/register",
    validate({ body: registerSchema }),
    controller.register,
  );
  router.post("/login", validate({ body: loginSchema }), controller.login);
  router.post(
    "/refresh",
    validate({ body: refreshSchema }),
    controller.refresh,
  );
  router.post("/logout", validate({ body: logoutSchema }), controller.logout);

  // Protected: requires a valid access token.
  router.get("/me", authenticate, controller.me);

  return router;
}
