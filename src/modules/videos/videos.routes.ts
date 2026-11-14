import { Router, type RequestHandler } from "express";
import { validate } from "../../middleware/validate.js";
import { authorize } from "../../middleware/authorize.js";
import { PERMISSIONS } from "../../authorization/permissions.js";
import type { UploadMiddleware } from "../../middleware/upload.js";
import type { VideosService } from "./videos.service.js";
import { createVideosController } from "./videos.controller.js";
import {
  createVideoSchema,
  updateVideoSchema,
  videoIdParamSchema,
} from "./videos.schemas.js";

/**
 * Videos router factory. Wires authentication, authorization, upload, and
 * validation middleware around the controller handlers.
 *
 * Order for upload: authenticate -> authorize (coarse permission) -> multer
 * (parses multipart: file + text fields) -> mapError (multer->envelope) ->
 * validate (now req.body is populated by multer) -> controller.
 */
export function createVideosRouter(
  videosService: VideosService,
  authenticate: RequestHandler,
  upload: UploadMiddleware,
): Router {
  const router = Router();
  const controller = createVideosController(videosService);

  router.post(
    "/",
    authenticate,
    authorize(PERMISSIONS.VIDEO_CREATE),
    upload.single("video"),
    upload.mapError,
    validate({ body: createVideoSchema }),
    controller.create,
  );

  router.get(
    "/",
    authenticate,
    authorize(PERMISSIONS.VIDEO_READ),
    controller.list,
  );

  router.get(
    "/:id",
    authenticate,
    authorize(PERMISSIONS.VIDEO_READ),
    validate({ params: videoIdParamSchema }),
    controller.getById,
  );

  // Update / delete authorization is ownership-aware and therefore enforced by
  // the service-layer Gate (which needs the loaded resource). The route only
  // requires authentication; the Gate decides owner-vs-admin access.
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
