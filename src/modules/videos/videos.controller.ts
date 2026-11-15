import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { BadRequestError, UnauthorizedError, ok } from "../../lib/http.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { parseRange } from "../../lib/range.js";
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

    playback: asyncHandler(
      async (req: Request<{ id: string }>, res: Response) => {
        if (!req.user) {
          throw new UnauthorizedError("Authentication required");
        }
        const playback = await videosService.createPlayback(
          { id: req.user.id, permissions: req.user.permissions },
          req.params.id,
        );
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json(ok(playback));
      },
    ),

    /**
     * Stream the video file with HTTP Range support. Browsers request
     * `Range: bytes=N-` to start playback and seek, and expect 206 replies.
     */
    stream: asyncHandler(
      async (req: Request<{ id: string }>, res: Response) => {
        if (!req.user) {
          throw new UnauthorizedError("Authentication required");
        }
        const source = await videosService.getStreamSource(
          { id: req.user.id, permissions: req.user.permissions },
          req.params.id,
        );

        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", source.mimeType);
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("X-Content-Type-Options", "nosniff");
        // The URL carries a token; don't let shared caches keep the response.
        res.setHeader("Cache-Control", "private, no-store");

        const range = parseRange(req.headers.range, source.size);
        if (range.type === "unsatisfiable") {
          res.setHeader("Content-Range", `bytes */${source.size}`);
          res.status(416).end();
          return;
        }

        let body: Readable | null = null;
        if (range.type === "range") {
          res.status(206);
          res.setHeader(
            "Content-Range",
            `bytes ${range.start}-${range.end}/${source.size}`,
          );
          res.setHeader("Content-Length", String(range.end - range.start + 1));
          if (req.method !== "HEAD") body = source.open(range);
        } else {
          res.status(200);
          res.setHeader("Content-Length", String(source.size));
          if (req.method !== "HEAD" && source.size > 0) body = source.open();
        }

        if (!body) {
          res.end();
          return;
        }
        try {
          await pipeline(body, res);
        } catch (err) {
          // Seeking makes the browser abort in-flight requests; that's normal.
          if ((err as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE") {
            return;
          }
          if (!res.headersSent) throw err;
          res.destroy(err as Error);
        }
      },
    ),
  };
}

export type VideosController = ReturnType<typeof createVideosController>;
