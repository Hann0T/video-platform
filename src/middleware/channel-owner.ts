import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/http.js";
import type { Gate } from "../authorization/gate.js";

/**
 * Route guard for /studio/channels/:userId/*. Allows the request only when the
 * authenticated user owns the channel in the URL; otherwise responds 403.
 *
 * Must run AFTER `authenticate` and BEFORE any body parsing (multer), so a
 * forbidden upload never writes a file to disk.
 */
export function requireChannelOwner(gate: Gate) {
  return (req: Request<{ userId?: string }>, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }
    try {
      gate.authorizeChannel(req.user, req.params.userId ?? "");
      next();
    } catch (err) {
      next(err);
    }
  };
}
