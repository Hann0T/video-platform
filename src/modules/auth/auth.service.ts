import type { PublicUser, UsersService } from "../users/index.js";
import { UnauthorizedError } from "../../lib/http.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";
import type { TokenPair, TokenService } from "./token.service.js";

/**
 * AuthService orchestrates authentication flows. It depends on UsersService
 * and TokenService (both injected via the constructor) rather than touching
 * persistence directly — demonstrating the module communication contract:
 * cross-module access happens only through another module's service.
 *
 * Refresh rotation / logout are added in Task 6.
 */
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  /** Register a new user with the default role. */
  async register(input: RegisterInput): Promise<PublicUser> {
    return this.users.create({
      email: input.email,
      password: input.password,
    });
  }

  /**
   * Verify credentials and, on success, issue + persist a token pair.
   * Uses a generic error for both unknown-email and bad-password to avoid
   * leaking which emails are registered.
   */
  async login(
    input: LoginInput,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const record = await this.users.findByEmailWithSecret(input.email);
    if (!record) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await this.users.verifyPassword(
      input.password,
      record.passwordHash,
    );
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const tokens = await this.tokens.issueTokenPair({
      sub: record.id,
      email: record.email,
      role: record.role.name,
    });

    const user: PublicUser = {
      id: record.id,
      email: record.email,
      role: record.role.name,
      createdAt: record.createdAt,
    };

    return { user, tokens };
  }

  /**
   * Rotate a refresh token: validate the stored token, revoke it, and issue a
   * brand-new pair. Reusing a revoked token (replay) fails validation, which
   * mitigates refresh-token theft.
   */
  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const stored = await this.tokens.validateStoredRefreshToken(
      rawRefreshToken,
    );

    const user = await this.users.findByIdWithPermissions(stored.userId);
    if (!user) {
      throw new UnauthorizedError("User no longer exists");
    }

    // Revoke the old token BEFORE issuing a new one (single-use rotation).
    await this.tokens.revokeRefreshTokenById(stored.id);

    return this.tokens.issueTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  /** Revoke a refresh token (logout). Idempotent. */
  async logout(rawRefreshToken: string): Promise<void> {
    await this.tokens.revokeRefreshToken(rawRefreshToken);
  }
}
