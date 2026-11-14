/**
 * Public surface of the `auth` module.
 *
 * MODULE BOUNDARY CONTRACT:
 * Other modules may import ONLY the service class(es) and public types below.
 * The router factory is consumed by app.ts (composition), not by other feature
 * modules.
 */
export { AuthService } from "./auth.service.js";
export { TokenService } from "./token.service.js";
export { createAuthRouter } from "./auth.routes.js";
export type { RegisterInput, LoginInput, RefreshInput, LogoutInput } from "./auth.schemas.js";
export type { TokenPair, AccessTokenPayload } from "./token.service.js";
