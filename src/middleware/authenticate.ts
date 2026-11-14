import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/http.js";
import type { TokenService } from "../modules/auth/index.js";
import type { UsersService } from "../modules/users/index.js";

/**
 * Authentication middleware factory.
 *
 * Verifies the Bearer access token, loads the user (with role + permissions),
 * and attaches it to req.user. Receives its service dependencies from the
 * composition root — consistent with the DI model.
 */
export function createAuthenticate(
  tokenService: TokenService,
  usersService: UsersService,
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        throw new UnauthorizedError("Missing or malformed Authorization header");
      }

      const token = header.slice("Bearer ".length).trim();
      const payload = tokenService.verifyAccessToken(token);

      const user = await usersService.findByIdWithPermissions(payload.sub);
      if (!user) {
        throw new UnauthorizedError("User no longer exists");
      }

      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export type Authenticate = ReturnType<typeof createAuthenticate>;
