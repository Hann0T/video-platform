import type { Request, Response } from "express";
import { BadRequestError, UnauthorizedError, ok } from "../../lib/http.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { VideosService } from "./videos.service.js";
import type { CreateVideoBody, UpdateVideoBody } from "./videos.schemas.js";

/**
 * Videos controller factory. Receives the VideosService from the composition
 * root. Controllers parse validated input + the uploaded file, call the
 * service, and shape the envelope.
 */
export function createVideosController(videosService: VideosService) {
  return {
    create: asyncHandler(
      async (req: Request<unknown, unknown, CreateVideoBody>, res: Response) => {
        if (!req.user) {
          throw new UnauthorizedError("Authentication required");
        }
        if (!req.file) {
          throw new BadRequestError("A video file is required (field 'video')");
        }

        const video = await videosService.create(req.user.id, req.body, {
          filename: req.file.filename,
          path: req.file.path,
          mimetype: req.file.mimetype,
          size: req.file.size,
        });
        res.status(201).json(ok(video));
      },
    ),

    feed: asyncHandler(async (_req: Request, res: Response) => {
      const videos = await videosService.listFeed();
      res.status(200).json(ok(videos));
    }),

    listChannel: asyncHandler(
      async (req: Request<{ userId: string }>, res: Response) => {
        if (!req.user) {
          throw new UnauthorizedError("Authentication required");
        }
        const videos = await videosService.listChannel(
          { id: req.user.id, permissions: req.user.permissions },
          req.params.userId,
        );
        res.status(200).json(ok(videos));
      },
    ),

    getById: asyncHandler(
      async (req: Request<{ id: string }>, res: Response) => {
        if (!req.user) {
          throw new UnauthorizedError("Authentication required");
        }
        const video = await videosService.getById(
          { id: req.user.id, permissions: req.user.permissions },
          req.params.id,
        );
        res.status(200).json(ok(video));
      },
    ),

    update: asyncHandler(
      async (
        req: Request<{ id: string }, unknown, UpdateVideoBody>,
        res: Response,
      ) => {
        if (!req.user) {
          throw new UnauthorizedError("Authentication required");
        }
        const video = await videosService.update(
          { id: req.user.id, permissions: req.user.permissions },
          req.params.id,
          req.body,
        );
        res.status(200).json(ok(video));
      },
    ),

    remove: asyncHandler(
      async (req: Request<{ id: string }>, res: Response) => {
        if (!req.user) {
          throw new UnauthorizedError("Authentication required");
        }
        await videosService.delete(
          { id: req.user.id, permissions: req.user.permissions },
          req.params.id,
        );
        res.status(200).json(ok({ success: true }));
      },
    ),
  };
}

export type VideosController = ReturnType<typeof createVideosController>;
