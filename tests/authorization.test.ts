import { describe, it, expect } from "vitest";
import { VideoPolicy } from "../src/authorization/policies/video.policy.js";
import { Gate } from "../src/authorization/gate.js";
import { PERMISSIONS } from "../src/authorization/permissions.js";

const owner = {
  id: "owner-1",
  permissions: [
    PERMISSIONS.VIDEO_READ,
    PERMISSIONS.VIDEO_UPDATE_OWN,
    PERMISSIONS.VIDEO_DELETE_OWN,
  ],
};
const otherUser = {
  id: "user-2",
  permissions: [
    PERMISSIONS.VIDEO_READ,
    PERMISSIONS.VIDEO_UPDATE_OWN,
    PERMISSIONS.VIDEO_DELETE_OWN,
  ],
};
const admin = {
  id: "admin-1",
  permissions: [
    PERMISSIONS.VIDEO_READ,
    PERMISSIONS.VIDEO_UPDATE_OWN,
    PERMISSIONS.VIDEO_UPDATE_ANY,
    PERMISSIONS.VIDEO_DELETE_OWN,
    PERMISSIONS.VIDEO_DELETE_ANY,
  ],
};

const video = { ownerId: "owner-1", visibility: "private" as const };

describe("VideoPolicy (unit)", () => {
  const policy = new VideoPolicy();

  it("allows the owner to update/delete their own video", () => {
    expect(policy.canUpdate(owner, video)).toBe(true);
    expect(policy.canDelete(owner, video)).toBe(true);
  });

  it("denies a non-owner (with only *.own) from updating/deleting", () => {
    expect(policy.canUpdate(otherUser, video)).toBe(false);
    expect(policy.canDelete(otherUser, video)).toBe(false);
  });

  it("allows an admin (with *.any) to update/delete any video", () => {
    expect(policy.canUpdate(admin, video)).toBe(true);
    expect(policy.canDelete(admin, video)).toBe(true);
  });

  it("lets anyone with read permission view a public video", () => {
    const pub = { ownerId: "someone-else", visibility: "public" as const };
    expect(policy.canView(owner, pub)).toBe(true);
    expect(policy.canView({ id: "x", permissions: [] }, pub)).toBe(false);
  });

  it("hides private and unlisted videos from non-owners", () => {
    const reader = { id: "reader", permissions: [PERMISSIONS.VIDEO_READ] };
    for (const visibility of ["private", "unlisted"] as const) {
      expect(policy.canView(reader, { ownerId: "o", visibility })).toBe(false);
    }
  });

  it("always lets the owner view their own video", () => {
    for (const visibility of ["private", "public", "unlisted"] as const) {
      expect(
        policy.canView({ id: "o", permissions: [] }, { ownerId: "o", visibility }),
      ).toBe(true);
    }
  });

  it("lets moderators view private videos", () => {
    expect(
      policy.canView(admin, { ownerId: "o", visibility: "private" }),
    ).toBe(true);
  });

  it("restricts a channel to its owner, admins included", () => {
    expect(policy.canAccessChannel(owner, owner.id)).toBe(true);
    expect(policy.canAccessChannel(owner, "other-id")).toBe(false);
    expect(policy.canAccessChannel(admin, "other-id")).toBe(false);
  });
});

describe("Gate (unit)", () => {
  const gate = new Gate(new VideoPolicy());

  it("authorizeVideo passes silently when allowed", () => {
    expect(() => gate.authorizeVideo(owner, "update", video)).not.toThrow();
    expect(() => gate.authorizeVideo(admin, "delete", video)).not.toThrow();
  });

  it("authorizeVideo throws ForbiddenError (403) when denied", () => {
    try {
      gate.authorizeVideo(otherUser, "delete", video);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as { statusCode: number }).statusCode).toBe(403);
      expect((err as { code: string }).code).toBe("FORBIDDEN");
    }
  });

  it("canVideo returns the boolean decision without throwing", () => {
    expect(gate.canVideo(otherUser, "update", video)).toBe(false);
    expect(gate.canVideo(owner, "update", video)).toBe(true);
  });
});
