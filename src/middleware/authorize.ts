import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/http.js";
import type { Permission } from "../authorization/permissions.js";

/**
 * Route-level authorization guard (coarse-grained).
 *
 * Checks that the authenticated user's role grants ALL of the required
 * permissions. Must run AFTER `authenticate` (which populates req.user).
 *
 * This handles permission gating that does not require the resource to be
 * loaded (e.g. "can this user create videos at all?"). Ownership-aware checks
 * that need the loaded record are handled by the service-layer Gate instead.
 */
export function authorize(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }

    const granted = new Set(req.user.permissions);
    const missing = required.filter((p) => !granted.has(p));

    if (missing.length > 0) {
      next(
        new ForbiddenError("Insufficient permissions", {
          required,
          missing,
        }),
      );
      return;
    }

    next();
  };
}
