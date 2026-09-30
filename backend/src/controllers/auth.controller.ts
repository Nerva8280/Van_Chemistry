import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import env from "../config/env";
import prisma from "../config/db";
import { allowedEmails, isEmailAllowed, resolveDataOwnerId } from "../config/access";
import { AppError } from "../middleware/errorHandler";

// Signs in as the owner of the shared workspace, so it needs ALLOWED_EMAILS too.
export const testLoginEnabled =
  env.APP_ENV === "test" && env.TEST_LOGIN_PASSWORD.length > 0 && allowedEmails.length > 0;

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Test environment only: signs in as the data owner with a shared password (no Google needed). */
export async function testLogin(req: Request, res: Response, next: NextFunction) {
  if (!testLoginEnabled) throw new AppError("Không tìm thấy tài nguyên yêu cầu.", 404);

  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = failures.get(key);
  if (entry && now - entry.since < WINDOW_MS && entry.count >= MAX_FAILURES) {
    throw new AppError("Nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.", 429);
  }

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!sameSecret(password, env.TEST_LOGIN_PASSWORD)) {
    const fresh = !entry || now - entry.since >= WINDOW_MS;
    failures.set(key, { count: fresh ? 1 : entry!.count + 1, since: fresh ? now : entry!.since });
    throw new AppError("Mật khẩu test không đúng.", 401);
  }
  failures.delete(key);

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: await resolveDataOwnerId({ id: "" }) } });
  req.login(owner, (err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
}

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

export default { getMe, logout, oauthFailureRedirect, testLogin };
