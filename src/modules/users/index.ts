/**
 * Public surface of the `users` module.
 *
 * MODULE BOUNDARY CONTRACT:
 * Other modules may import ONLY from this barrel, and ONLY the service class
 * and public types below. Do not import this module's internals from other
 * modules.
 */
export { UsersService } from "./users.service.js";
export type {
  PublicUser,
  UserWithPermissions,
  CreateUserInput,
} from "./users.service.js";
