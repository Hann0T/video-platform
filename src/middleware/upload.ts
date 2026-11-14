import type { NextFunction, Request, Response } from "express";
import multer, { type FileFilterCallback, MulterError } from "multer";
import {
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from "../lib/http.js";
import type { StorageService } from "../modules/videos/index.js";

/** Accepted video MIME types for the MVP. */
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/mpeg",
  "video/quicktime", // .mov
  "video/webm",
  "video/x-matroska", // .mkv
  "video/x-msvideo", // .avi
]);

/**
 * Build a multer instance backed by the StorageService (disk storage, unique
 * filenames, size limit, video-only filter). Returns both the raw middleware
 * for a single "file" field and an error-translation middleware that maps
 * multer errors to the app's envelope (413 for size, 415 for type).
 */
export function createUploadMiddleware(storage: StorageService) {
  const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      storage.ensureDir();
      cb(null, storage.uploadDir);
    },
    filename: (_req, file, cb) => {
      cb(null, storage.generateFilename(file.originalname));
    },
  });

  const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    if (ALLOWED_VIDEO_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      // Signal rejection; translated to 415 in the error mapper below.
      cb(new UnsupportedMediaTypeError(`Unsupported file type: ${file.mimetype}`));
    }
  };

  const upload = multer({
    storage: diskStorage,
    limits: { fileSize: storage.maxFileSize },
    fileFilter,
  });

  /** Single-file middleware for the given form field. */
  const single = (field: string) => upload.single(field);

  /**
   * Error translation. Place AFTER the upload middleware on a route (or rely on
   * the central error handler, which also maps AppError). This specifically
   * converts MulterError size-limit into a 413.
   */
  const mapError = (
    err: unknown,
    _req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    if (err instanceof MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new PayloadTooLargeError("File exceeds the maximum allowed size"));
        return;
      }
      next(new PayloadTooLargeError(err.message));
      return;
    }
    next(err);
  };

  return { single, mapError };
}

export type UploadMiddleware = ReturnType<typeof createUploadMiddleware>;
