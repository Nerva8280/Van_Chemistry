import { Request, Response, NextFunction } from "express";
import { isEmailAllowed, resolveDataOwnerId } from "../config/access";

/**
 * Protects all /api/* routes except /api/auth/*. Relies on Passport's session-based
 * req.isAuthenticated(), re-checks the allow-list (sessions can outlive a list change),
 * and sets req.ownerId: the user whose data this request reads and writes.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.isAuthenticated && req.isAuthenticated()) || !req.user) {
    return res.status(401).json({ error: "Chưa đăng nhập. Vui lòng đăng nhập để tiếp tục." });
  }
  if (!isEmailAllowed(req.user.email)) {
    return res.status(403).json({ error: "Tài khoản này không có quyền truy cập hệ thống." });
  }
  try {
    req.ownerId = await resolveDataOwnerId(req.user);
    return next();
  } catch (err) {
    return next(err);
  }
}

export default requireAuth;
