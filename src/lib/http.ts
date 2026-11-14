/**
 * HTTP response envelope + typed application errors.
 *
 * Every API response uses the shape:
 *   success: { data: <payload>, error: null }
 *   failure: { data: null, error: { code, message, details? } }
 */

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiEnvelope<T> = {
  data: T | null;
  error: ApiError | null;
};

export function ok<T>(data: T): ApiEnvelope<T> {
  return { data, error: null };
}

export function fail(error: ApiError): ApiEnvelope<never> {
  return { data: null, error };
}

/**
 * Base class for errors that map to a known HTTP status + stable error code.
 * Thrown anywhere in the stack; translated to an envelope by the error handler.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(401, "UNAUTHORIZED", message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: unknown) {
    super(403, "FORBIDDEN", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", details?: unknown) {
    super(404, "NOT_FOUND", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(422, "VALIDATION_ERROR", message, details);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Payload too large", details?: unknown) {
    super(413, "PAYLOAD_TOO_LARGE", message, details);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = "Unsupported media type", details?: unknown) {
    super(415, "UNSUPPORTED_MEDIA_TYPE", message, details);
  }
}
