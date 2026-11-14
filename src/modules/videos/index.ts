/**
 * Public surface of the `videos` module.
 *
 * MODULE BOUNDARY CONTRACT:
 * Other modules may import ONLY the service class(es) and public types below.
 * The router factory is consumed by app.ts (composition), not by other feature
 * modules.
 */
export { StorageService } from "./storage.service.js";
export { VideosService } from "./videos.service.js";
export { createVideosRouter } from "./videos.routes.js";
export type { StorageConfig } from "./storage.service.js";
export type {
  PublicVideo,
  CreateVideoInput,
  UpdateVideoInput,
  UploadedFile,
} from "./videos.service.js";
