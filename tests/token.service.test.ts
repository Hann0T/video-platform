import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TokenService } from "../src/modules/auth/token.service.js";

const config = {
  accessSecret: "access-secret",
  refreshSecret: "refresh-secret",
  accessExpiresIn: "15m",
  refreshExpiresIn: "7d",
};

// Pure sign/verify paths don't touch the DB; a null-ish prisma is fine.
const prismaStub = {} as unknown as PrismaClient;

describe("TokenService (unit)", () => {
  const svc = new TokenService(prismaStub, config);

  it("signs and verifies an access token round-trip", () => {
    const token = svc.signAccessToken({
      sub: "u1",
      email: "a@b.com",
      role: "user",
    });
    const decoded = svc.verifyAccessToken(token);
    expect(decoded.sub).toBe("u1");
    expect(decoded.email).toBe("a@b.com");
    expect(decoded.role).toBe("user");
  });

  it("rejects an access token signed with a different secret", () => {
    const other = new TokenService(prismaStub, {
      ...config,
      accessSecret: "wrong",
    });
    const token = other.signAccessToken({
      sub: "u1",
      email: "a@b.com",
      role: "user",
    });
    expect(() => svc.verifyAccessToken(token)).toThrow(
      /Invalid or expired access token/,
    );
  });

  it("signs and verifies a refresh token round-trip", () => {
    const token = svc.signRefreshToken("u1");
    expect(svc.verifyRefreshToken(token).sub).toBe("u1");
  });

  it("hashes tokens deterministically (same input -> same hash)", () => {
    const h1 = svc.hashToken("abc");
    const h2 = svc.hashToken("abc");
    const h3 = svc.hashToken("different");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64); // sha256 hex
  });
});
