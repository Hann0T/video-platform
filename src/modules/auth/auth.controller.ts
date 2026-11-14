import type { Request, Response } from "express";
import { ok, UnauthorizedError } from "../../lib/http.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { AuthService } from "./auth.service.js";
import type {
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from "./auth.schemas.js";

/**
 * Controller factory. Receives the AuthService instance from the composition
 * root (via the router factory) and returns bound request handlers. Controllers
 * are the HTTP boundary: they parse validated input, call the service, and
 * shape the response envelope. They contain no business logic.
 */
export function createAuthController(authService: AuthService) {
  return {
    register: asyncHandler(
      async (req: Request<unknown, unknown, RegisterInput>, res: Response) => {
        const user = await authService.register(req.body);
        res.status(201).json(ok(user));
      },
    ),

    login: asyncHandler(
      async (req: Request<unknown, unknown, LoginInput>, res: Response) => {
        const { user, tokens } = await authService.login(req.body);
        res.status(200).json(ok({ user, ...tokens }));
      },
    ),

    refresh: asyncHandler(
      async (req: Request<unknown, unknown, RefreshInput>, res: Response) => {
        const tokens = await authService.refresh(req.body.refreshToken);
        res.status(200).json(ok(tokens));
      },
    ),

    logout: asyncHandler(
      async (req: Request<unknown, unknown, LogoutInput>, res: Response) => {
        await authService.logout(req.body.refreshToken);
        res.status(200).json(ok({ success: true }));
      },
    ),

    // Protected probe: returns the authenticated user. Requires `authenticate`.
    me: asyncHandler(async (req: Request, res: Response) => {
      if (!req.user) {
        throw new UnauthorizedError("Not authenticated");
      }
      res.status(200).json(ok(req.user));
    }),
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
