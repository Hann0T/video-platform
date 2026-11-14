import { ForbiddenError } from "../lib/http.js";
import {
  VideoPolicy,
  type OwnedResource,
  type PolicyUser,
} from "./policies/video.policy.js";

export type VideoAction = "view" | "update" | "delete";

/**
 * The service-layer Gate. Services call it AFTER loading a resource so that
 * ownership-aware decisions can inspect the actual record. Throws
 * ForbiddenError (403) when a policy denies the action.
 *
 * Policies are injected via the constructor (DI), keeping the Gate and its
 * policies independently testable.
 */
export class Gate {
  constructor(private readonly videoPolicy: VideoPolicy) {}

  /** Authorize an action on a video; throws ForbiddenError if denied. */
  authorizeVideo(
    user: PolicyUser,
    action: VideoAction,
    resource: OwnedResource,
  ): void {
    const allowed = this.canVideo(user, action, resource);
    if (!allowed) {
      throw new ForbiddenError(
        `You are not allowed to ${action} this video`,
      );
    }
  }

  /** Non-throwing variant: returns the boolean decision. */
  canVideo(
    user: PolicyUser,
    action: VideoAction,
    resource: OwnedResource,
  ): boolean {
    switch (action) {
      case "view":
        return this.videoPolicy.canView(user);
      case "update":
        return this.videoPolicy.canUpdate(user, resource);
      case "delete":
        return this.videoPolicy.canDelete(user, resource);
      default: {
        // Exhaustiveness guard.
        const _never: never = action;
        return _never;
      }
    }
  }
}
