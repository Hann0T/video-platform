import type { NextFunction, Request, Response } from "express";

/**
 * Wraps an async route handler so thrown/rejected errors are forwarded to
 * Express's error-handling middleware instead of crashing the process.
 */
export function asyncHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
>(
  fn: (
    req: Request<P, ResBody, ReqBody>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<unknown>,
) {
  return (
    req: Request<P, ResBody, ReqBody>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => {
    fn(req, res, next).catch(next);
  };
}
