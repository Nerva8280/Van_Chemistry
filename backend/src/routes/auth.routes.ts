import { Router, Request, Response, NextFunction } from "express";
import passport from "../config/passport";
import env from "../config/env";
import { getMe, logout, oauthFailureRedirect, testLogin } from "../controllers/auth.controller";
import asyncHandler from "../utils/asyncHandler";

const router = Router();

function oauthCallback(strategy: "google" | "microsoft") {
  return (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(strategy, (err: unknown, user: Express.User | false, info?: { message?: string }) => {
      if (err || !user) {
        const reason = !err && info?.message === "not_allowed" ? "not_allowed" : "auth_failed";
        return res.redirect(`${env.FRONTEND_URL}/login?error=${reason}`);
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.redirect(`${env.FRONTEND_URL}/dashboard`);
      });
    })(req, res, next);
  };
}

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback", oauthCallback("google"));

router.get("/microsoft", passport.authenticate("microsoft", { scope: ["user.read"] }));
router.get("/microsoft/callback", oauthCallback("microsoft"));

router.get("/failure", oauthFailureRedirect);

router.post("/test-login", asyncHandler(testLogin));
router.get("/me", getMe);
router.post("/logout", logout);

export default router;
