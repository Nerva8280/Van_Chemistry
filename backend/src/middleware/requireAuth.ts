import { Request, Response, NextFunction } from "express";

/**
 * Protects all /api/* routes except /api/auth/*. Relies on Passport's
 * session-based req.isAuthenticated().
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: "Chưa đăng nhập. Vui lòng đăng nhập để tiếp tục." });
}

export default requireAuth;
