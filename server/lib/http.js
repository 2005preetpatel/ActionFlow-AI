export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wraps an async route handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parses a zod schema or throws a 400 with readable issues. */
export function parseOr400(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'Invalid request', result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  return result.data;
}
