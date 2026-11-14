import { describe, it, expect, vi } from "vitest";
import { AuthService } from "../src/modules/auth/auth.service.js";
import type { UsersService } from "../src/modules/users/index.js";
import type { TokenService } from "../src/modules/auth/token.service.js";

/**
 * Demonstrates DI testability: AuthService is unit-tested by passing fake
 * UsersService + TokenService to its constructor — no database, no module-path
 * mocking.
 */
function fakeTokens(): TokenService {
  return {
    issueTokenPair: vi
      .fn()
      .mockResolvedValue({ accessToken: "a.b.c", refreshToken: "r.e.f" }),
  } as unknown as TokenService;
}

describe("AuthService.register (unit)", () => {
  it("delegates to UsersService.create with email + password", async () => {
    const created = {
      id: "u1",
      email: "a@b.com",
      role: "user",
      createdAt: new Date(),
    };
    const fakeUsers = {
      create: vi.fn().mockResolvedValue(created),
    } as unknown as UsersService;

    const auth = new AuthService(fakeUsers, fakeTokens());
    const result = await auth.register({
      email: "a@b.com",
      password: "password123",
    });

    expect(fakeUsers.create).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "password123",
    });
    expect(result).toBe(created);
  });

  it("propagates errors thrown by UsersService (e.g. duplicate email)", async () => {
    const fakeUsers = {
      create: vi.fn().mockRejectedValue(new Error("conflict")),
    } as unknown as UsersService;

    const auth = new AuthService(fakeUsers, fakeTokens());
    await expect(
      auth.register({ email: "a@b.com", password: "password123" }),
    ).rejects.toThrow("conflict");
  });
});

describe("AuthService.login (unit)", () => {
  const record = {
    id: "u1",
    email: "a@b.com",
    passwordHash: "hashed",
    role: { name: "user" },
    createdAt: new Date(),
  };

  it("issues a token pair for valid credentials", async () => {
    const fakeUsers = {
      findByEmailWithSecret: vi.fn().mockResolvedValue(record),
      verifyPassword: vi.fn().mockResolvedValue(true),
    } as unknown as UsersService;
    const tokens = fakeTokens();

    const auth = new AuthService(fakeUsers, tokens);
    const result = await auth.login({ email: "a@b.com", password: "pw" });

    expect(tokens.issueTokenPair).toHaveBeenCalledWith({
      sub: "u1",
      email: "a@b.com",
      role: "user",
    });
    expect(result.tokens.accessToken).toBe("a.b.c");
    expect(result.user).toMatchObject({ id: "u1", role: "user" });
  });

  it("rejects an unknown email with Unauthorized", async () => {
    const fakeUsers = {
      findByEmailWithSecret: vi.fn().mockResolvedValue(null),
      verifyPassword: vi.fn(),
    } as unknown as UsersService;

    const auth = new AuthService(fakeUsers, fakeTokens());
    await expect(
      auth.login({ email: "nope@b.com", password: "pw" }),
    ).rejects.toThrow(/Invalid email or password/);
  });

  it("rejects a wrong password with Unauthorized", async () => {
    const fakeUsers = {
      findByEmailWithSecret: vi.fn().mockResolvedValue(record),
      verifyPassword: vi.fn().mockResolvedValue(false),
    } as unknown as UsersService;
    const tokens = fakeTokens();

    const auth = new AuthService(fakeUsers, tokens);
    await expect(
      auth.login({ email: "a@b.com", password: "bad" }),
    ).rejects.toThrow(/Invalid email or password/);
    expect(tokens.issueTokenPair).not.toHaveBeenCalled();
  });
});

describe("AuthService.refresh (unit)", () => {
  it("validates, revokes the old token, and issues a new pair", async () => {
    const fakeUsers = {
      findByIdWithPermissions: vi.fn().mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        role: "user",
        createdAt: new Date(),
        permissions: [],
      }),
    } as unknown as UsersService;
    const tokens = {
      validateStoredRefreshToken: vi
        .fn()
        .mockResolvedValue({ id: "rt1", userId: "u1" }),
      revokeRefreshTokenById: vi.fn().mockResolvedValue(undefined),
      issueTokenPair: vi
        .fn()
        .mockResolvedValue({ accessToken: "new.a", refreshToken: "new.r" }),
    } as unknown as TokenService;

    const auth = new AuthService(fakeUsers, tokens);
    const result = await auth.refresh("raw-refresh");

    expect(tokens.validateStoredRefreshToken).toHaveBeenCalledWith(
      "raw-refresh",
    );
    expect(tokens.revokeRefreshTokenById).toHaveBeenCalledWith("rt1");
    expect(tokens.issueTokenPair).toHaveBeenCalledWith({
      sub: "u1",
      email: "a@b.com",
      role: "user",
    });
    expect(result).toEqual({ accessToken: "new.a", refreshToken: "new.r" });
  });

  it("does not issue a new pair when validation fails (replay/revoked)", async () => {
    const fakeUsers = {
      findByIdWithPermissions: vi.fn(),
    } as unknown as UsersService;
    const tokens = {
      validateStoredRefreshToken: vi
        .fn()
        .mockRejectedValue(new Error("revoked")),
      revokeRefreshTokenById: vi.fn(),
      issueTokenPair: vi.fn(),
    } as unknown as TokenService;

    const auth = new AuthService(fakeUsers, tokens);
    await expect(auth.refresh("stale")).rejects.toThrow("revoked");
    expect(tokens.revokeRefreshTokenById).not.toHaveBeenCalled();
    expect(tokens.issueTokenPair).not.toHaveBeenCalled();
  });
});

describe("AuthService.logout (unit)", () => {
  it("revokes the given refresh token", async () => {
    const tokens = {
      revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    } as unknown as TokenService;
    const auth = new AuthService({} as unknown as UsersService, tokens);

    await auth.logout("raw-refresh");
    expect(tokens.revokeRefreshToken).toHaveBeenCalledWith("raw-refresh");
  });
});
