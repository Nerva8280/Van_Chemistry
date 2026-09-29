import { Router } from "express";
import passport from "../config/passport";
import {
  getMe,
  logout,
  oauthFailureRedirect,
  oauthSuccessRedirect,
} from "../controllers/auth.controller";

const router = Router();

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  (req, res, next) => {
    passport.authenticate("google", {
      failureRedirect: "/api/auth/failure",
      session: true,
    })(req, res, next);
  },
  oauthSuccessRedirect
);

router.get("/microsoft", passport.authenticate("microsoft", { scope: ["user.read"] }));

router.get(
  "/microsoft/callback",
  (req, res, next) => {
    passport.authenticate("microsoft", {
      failureRedirect: "/api/auth/failure",
      session: true,
    })(req, res, next);
  },
  oauthSuccessRedirect
);

router.get("/failure", oauthFailureRedirect);

router.get("/me", getMe);
router.post("/logout", logout);

export default router;
