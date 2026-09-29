import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async Express handler so rejected promises / thrown errors are
 * forwarded to next(err) and handled by the central errorHandler middleware.
 * Express 4 does not do this automatically for async functions.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
