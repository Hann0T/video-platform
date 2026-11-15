import { PERMISSIONS } from "../permissions.js";
import type { Visibility } from "../../lib/visibility.js";

/** Minimal user shape a policy needs: identity + granted permissions. */
export type PolicyUser = {
  id: string;
  permissions: string[];
};

/** Minimal resource shape: anything owned by a user. */
export type OwnedResource = {
  ownerId: string;
};

/** A video as far as view decisions are concerned. */
export type VideoResource = OwnedResource & {
  visibility: Visibility;
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

  /**
   * - The owner can always view their own video.
   * - Moderators (update.any / delete.any) can view any video, otherwise they
   *   could not act on videos they are allowed to edit or remove.
   * - Everyone else needs `video.read` AND the video must be public.
   *   Private and unlisted videos are hidden from them.
   */
  canView(user: PolicyUser, resource: VideoResource): boolean {
    if (this.owns(user, resource)) return true;
    if (
      this.has(user, PERMISSIONS.VIDEO_UPDATE_ANY) ||
      this.has(user, PERMISSIONS.VIDEO_DELETE_ANY)
    ) {
      return true;
    }
    return resource.visibility === "public" && this.has(user, PERMISSIONS.VIDEO_READ);
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

  /**
   * A studio channel belongs to exactly one user. Only that user may open it,
   * list its videos, or upload into it. No role overrides this, so changing
   * the id in the URL (IDOR) never grants access.
   */
  canAccessChannel(user: PolicyUser, channelUserId: string): boolean {
    return user.id === channelUserId;
  }
}
