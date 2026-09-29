import { Request, Response } from "express";
import env from "../config/env";

export function getMe(req: Request, res: Response) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return res.json({ user: req.user });
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

export function oauthSuccessRedirect(_req: Request, res: Response) {
  res.redirect(`${env.FRONTEND_URL}/dashboard`);
}

export default { getMe, logout, oauthFailureRedirect, oauthSuccessRedirect };
