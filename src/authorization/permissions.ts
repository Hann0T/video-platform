/**
 * Permission catalogue and role → permission bundles.
 *
 * This is the single source of truth for permission names. The seed script
 * writes these into the database (Permission + RolePermission tables); the
 * authorization middleware/gate check against the permissions attached to the
 * authenticated user's role.
 */

export const PERMISSIONS = {
  VIDEO_CREATE: "video.create",
  VIDEO_READ: "video.read",
  VIDEO_UPDATE_OWN: "video.update.own",
  VIDEO_UPDATE_ANY: "video.update.any",
  VIDEO_DELETE_OWN: "video.delete.own",
  VIDEO_DELETE_ANY: "video.delete.any",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  USER: "user",
  ADMIN: "admin",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/** All known permissions (used by the seed to upsert the catalogue). */
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Role → bundled permissions mapping. */
export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  [ROLES.USER]: [
    PERMISSIONS.VIDEO_CREATE,
    PERMISSIONS.VIDEO_READ,
    PERMISSIONS.VIDEO_UPDATE_OWN,
    PERMISSIONS.VIDEO_DELETE_OWN,
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.VIDEO_CREATE,
    PERMISSIONS.VIDEO_READ,
    PERMISSIONS.VIDEO_UPDATE_OWN,
    PERMISSIONS.VIDEO_UPDATE_ANY,
    PERMISSIONS.VIDEO_DELETE_OWN,
    PERMISSIONS.VIDEO_DELETE_ANY,
  ],
};
