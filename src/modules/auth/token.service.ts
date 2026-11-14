import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { PrismaClient } from "@prisma/client";
import { UnauthorizedError } from "../../lib/http.js";

export type AccessTokenPayload = {
  sub: string; // user id
  email: string;
  role: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type TokenServiceConfig = {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
};

/**
 * TokenService owns JWT signing/verification and refresh-token persistence.
 *
 * Access tokens are stateless JWTs (short-lived). Refresh tokens are JWTs too,
 * but we also store a SHA-256 hash of each issued refresh token in the DB so
 * they can be revoked (logout) and rotated (refresh). We store only the hash,
 * never the raw token.
 */
export class TokenService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: TokenServiceConfig,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    const opts: SignOptions = {
      expiresIn: this.config.accessExpiresIn as SignOptions["expiresIn"],
    };
    return jwt.sign(payload, this.config.accessSecret, opts);
  }

  signRefreshToken(userId: string): string {
    const opts: SignOptions = {
      expiresIn: this.config.refreshExpiresIn as SignOptions["expiresIn"],
      // Random token id so two refresh tokens issued for the same user within
      // the same second are still distinct (distinct hashes). Without this,
      // rapid rotation would collide on the unique tokenHash constraint.
      jwtid: crypto.randomUUID(),
    };
    return jwt.sign({ sub: userId }, this.config.refreshSecret, opts);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return jwt.verify(token, this.config.accessSecret) as AccessTokenPayload;
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }
  }

  verifyRefreshToken(token: string): { sub: string } {
    try {
      return jwt.verify(token, this.config.refreshSecret) as { sub: string };
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
  }

  /** Deterministic hash of a refresh token for storage/lookup. */
  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Issue an access + refresh token pair for a user and persist the refresh
   * token's hash so it can be rotated/revoked later.
   */
  async issueTokenPair(user: AccessTokenPayload): Promise<TokenPair> {
    const accessToken = this.signAccessToken(user);
    const refreshToken = this.signRefreshToken(user.sub);
    await this.persistRefreshToken(user.sub, refreshToken);
    return { accessToken, refreshToken };
  }

  /** Store the hash + expiry of a refresh token for a user. */
  async persistRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });
  }

  /**
   * Validate a raw refresh token: it must verify cryptographically AND have a
   * matching, non-revoked, non-expired row in the DB. Returns the stored row.
   */
  async validateStoredRefreshToken(rawToken: string): Promise<{
    id: string;
    userId: string;
  }> {
    // Signature/expiry check first (cheap, no DB).
    this.verifyRefreshToken(rawToken);

    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });
    if (!row) {
      throw new UnauthorizedError("Refresh token not recognized");
    }
    if (row.revokedAt) {
      throw new UnauthorizedError("Refresh token has been revoked");
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError("Refresh token has expired");
    }
    return { id: row.id, userId: row.userId };
  }

  /** Mark a stored refresh token (by id) as revoked. */
  async revokeRefreshTokenById(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoke by raw token value (used by logout). Idempotent: silently succeeds
   * if the token is unknown or already revoked.
   */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
