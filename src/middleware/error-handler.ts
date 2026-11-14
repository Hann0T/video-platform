import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, NotFoundError, fail } from "../lib/http.js";

/** Catch-all for unmatched routes -> 404 envelope. */
export function notFoundHandler(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  next(new NotFoundError("Route not found"));
}

/**
 * Central error handler. Maps AppError, ZodError, and unknown errors to the
 * standard failure envelope. Must be registered last, after all routes.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express identifies error handlers by arity (4 args); next must be present.
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json(fail({ code: err.code, message: err.message, details: err.details }));
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json(
      fail({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: {
          issues: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
          })),
        },
      }),
    );
    return;
  }

  // Unknown/unexpected error: do not leak internals.
  const message =
    err instanceof Error ? err.message : "Internal server error";
  // eslint-disable-next-line no-console
  console.error("[unhandled error]", err);
  res.status(500).json(
    fail({
      code: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : message,
    }),
  );
}
