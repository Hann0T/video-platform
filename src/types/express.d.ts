import type { UserWithPermissions } from "../modules/users/index.js";

/**
 * Augment Express's Request with the authenticated user, populated by the
 * `authenticate` middleware after verifying the access token.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserWithPermissions;
    }
  }
}

export {};
