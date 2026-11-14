import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { ValidationError } from "../lib/http.js";

export type RequestSchemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

/**
 * Validates and replaces request parts with their parsed (typed/coerced)
 * values. On failure, throws a ValidationError (422) carrying field issues.
 *
 * Parsed values are stored on res.locals.validated so downstream handlers can
 * read typed data without re-parsing. We also assign back to req.body/params
 * for ergonomic access where it's safe to do so.
 */
export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(
          req.params,
        ) as Request["params"];
      }
      if (schemas.query) {
        // req.query is a getter-only in some Express versions; validate without
        // reassigning the original object.
        schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          new ValidationError("Request validation failed", {
            issues: err.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
              code: i.code,
            })),
          }),
        );
        return;
      }
      next(err);
    }
  };
}

/** Helper to infer the output type of a Zod body schema. */
export type Infer<S extends ZodTypeAny> = z.infer<S>;
