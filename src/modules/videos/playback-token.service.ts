import jwt, { type SignOptions } from "jsonwebtoken";
import { UnauthorizedError } from "../../lib/http.js";

export type PlaybackTokenConfig = {
  /** Must differ from the access-token secret (see container.ts). */
  secret: string;
  expiresIn: string;
};

export type PlaybackTokenPayload = {
  sub: string; // user id
  vid: string; // video id
};

const AUDIENCE = "playback";

/**
 * Signs and verifies playback tokens.
 *
 * A `<video>` element cannot send an Authorization header, so the stream URL
 * carries a token in its query string instead. That URL may end up in browser
 * history or logs, so the token is deliberately narrow:
 *
 * - signed with its own secret and audience, so it can never be used as an
 *   access token (and an access token can't be used here);
 * - bound to one user and one video;
 * - short-lived.
 *
 * The token only proves identity. The stream endpoint still re-checks the view
 * policy on every request, so making a video private stops playback at once.
 */
export class PlaybackTokenService {
  constructor(private readonly config: PlaybackTokenConfig) {}

  sign(payload: PlaybackTokenPayload): { token: string; expiresAt: Date } {
    const opts: SignOptions = {
      expiresIn: this.config.expiresIn as SignOptions["expiresIn"],
      audience: AUDIENCE,
    };
    const token = jwt.sign(payload, this.config.secret, opts);
    const { exp } = jwt.decode(token) as { exp: number };
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /** Verify a token and that it was issued for `videoId`. */
  verify(token: string, videoId: string): PlaybackTokenPayload {
    let payload: PlaybackTokenPayload;
    try {
      payload = jwt.verify(token, this.config.secret, {
        audience: AUDIENCE,
      }) as PlaybackTokenPayload;
    } catch {
      throw new UnauthorizedError("Invalid or expired playback token");
    }
    if (payload.vid !== videoId) {
      throw new UnauthorizedError("Playback token was issued for another video");
    }
    return payload;
  }
}
