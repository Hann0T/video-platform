import { PERMISSIONS } from "../permissions.js";

/** Minimal user shape a policy needs: identity + granted permissions. */
export type PolicyUser = {
  id: string;
  permissions: string[];
};

/** Minimal resource shape: anything owned by a user. */
export type OwnedResource = {
  ownerId: string;
};

/**
 * VideoPolicy encapsulates ownership-aware authorization decisions for videos.
 *
 * These are PURE functions over (user, resource) — no I/O, no framework types —
 * which makes them trivially unit-testable. The service-layer Gate invokes
 * them after loading the resource, so ownership checks that require the loaded
 * record work naturally (unlike coarse route middleware).
 */
export class VideoPolicy {
  readonly resource = "video" as const;

  private has(user: PolicyUser, permission: string): boolean {
    return user.permissions.includes(permission);
  }

  private owns(user: PolicyUser, resource: OwnedResource): boolean {
    return resource.ownerId === user.id;
  }

  /** Anyone with read permission may view. */
  canView(user: PolicyUser): boolean {
    return this.has(user, PERMISSIONS.VIDEO_READ);
  }

  /** Owner with update.own, OR anyone with update.any. */
  canUpdate(user: PolicyUser, resource: OwnedResource): boolean {
    if (this.has(user, PERMISSIONS.VIDEO_UPDATE_ANY)) return true;
    return this.owns(user, resource) && this.has(user, PERMISSIONS.VIDEO_UPDATE_OWN);
  }

  /** Owner with delete.own, OR anyone with delete.any. */
  canDelete(user: PolicyUser, resource: OwnedResource): boolean {
    if (this.has(user, PERMISSIONS.VIDEO_DELETE_ANY)) return true;
    return this.owns(user, resource) && this.has(user, PERMISSIONS.VIDEO_DELETE_OWN);
  }
}
