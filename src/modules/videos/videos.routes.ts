import { Router, type RequestHandler } from "express";
import { validate } from "../../middleware/validate.js";
import { authorize } from "../../middleware/authorize.js";
import { requireChannelOwner } from "../../middleware/channel-owner.js";
import { PERMISSIONS } from "../../authorization/permissions.js";
import type { Gate } from "../../authorization/gate.js";
import type { UploadMiddleware } from "../../middleware/upload.js";
import type { VideosService } from "./videos.service.js";
import { createVideosController } from "./videos.controller.js";
import {
  channelParamSchema,
  createVideoSchema,
  updateVideoSchema,
  videoIdParamSchema,
} from "./videos.schemas.js";

/**
 * Single-video routes, mounted at /videos.
 *
 * Visibility and ownership are enforced in the service via the Gate, because
 * they depend on the loaded record. Routes only require authentication.
 */
export function createVideosRouter(
  videosService: VideosService,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const controller = createVideosController(videosService);

  router.get(
    "/:id",
    authenticate,
    validate({ params: videoIdParamSchema }),
    controller.getById,
  );

  router.patch(
    "/:id",
    authenticate,
    validate({ params: videoIdParamSchema, body: updateVideoSchema }),
    controller.update,
  );

  router.delete(
    "/:id",
    authenticate,
    validate({ params: videoIdParamSchema }),
    controller.remove,
  );

  return router;
}

/** Feed routes, mounted at /feed. Lists every public video. */
export function createFeedRouter(
  videosService: VideosService,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const controller = createVideosController(videosService);

  router.get(
    "/",
    authenticate,
    authorize(PERMISSIONS.VIDEO_READ),
    controller.feed,
  );

  return router;
}

/**
 * Studio routes, mounted at /studio. Every route is scoped to a channel and
 * only that channel's owner may use it (403 otherwise).
 *
 * Order for upload: authenticate -> channel owner (before multer so a rejected
 * request never writes a file) -> authorize (coarse permission) -> multer ->
 * mapError -> validate (req.body is populated by multer) -> controller.
 */
export function createStudioRouter(
  videosService: VideosService,
  authenticate: RequestHandler,
  upload: UploadMiddleware,
  gate: Gate,
): Router {
  const router = Router();
  const controller = createVideosController(videosService);
  const channelOwner = requireChannelOwner(gate);

  router.get(
    "/channels/:userId/videos",
    authenticate,
    validate({ params: channelParamSchema }),
    channelOwner,
    controller.listChannel,
  );

  router.post(
    "/channels/:userId/videos",
    authenticate,
    validate({ params: channelParamSchema }),
    channelOwner,
    authorize(PERMISSIONS.VIDEO_CREATE),
    upload.single("video"),
    upload.mapError,
    validate({ body: createVideoSchema }),
    controller.create,
  );

  return router;
}
