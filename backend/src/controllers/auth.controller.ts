import { Request, Response } from "express";
import env from "../config/env";
import { isEmailAllowed } from "../config/access";

export function getMe(req: Request, res: Response) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user && isEmailAllowed(req.user.email)) {
    const { id, email, name, avatarUrl, provider, createdAt } = req.user;
    return res.json({ user: { id, email, name, avatarUrl, provider, createdAt } });
  }
  return res.json({ user: null });
}

export function logout(req: Request, res: Response, next: (err?: any) => void) {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((destroyErr) => {
      if (destroyErr) return next(destroyErr);
      res.clearCookie("tuition.sid");
      return res.status(204).end();
    });
  });
}

export function oauthFailureRedirect(_req: Request, res: Response) {
  res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
}

export default { getMe, logout, oauthFailureRedirect };
