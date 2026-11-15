import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/http.js";
import type { PlaybackTokenService } from "../modules/videos/index.js";
import type { UsersService } from "../modules/users/index.js";

/**
 * Authentication for GET /videos/:id/stream. Reads the playback token from the
 * `token` query parameter (a <video> element can't send headers), checks it
 * was issued for this video, then loads the user with fresh permissions and
 * sets req.user, the same as `authenticate` does.
 */
export function createAuthenticatePlayback(
  playbackTokens: PlaybackTokenService,
  usersService: UsersService,
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.query.token;
      if (typeof token !== "string" || token.length === 0) {
        throw new UnauthorizedError("Missing playback token");
      }
      const payload = playbackTokens.verify(token, req.params.id ?? "");

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

export type AuthenticatePlayback = ReturnType<typeof createAuthenticatePlayback>;
