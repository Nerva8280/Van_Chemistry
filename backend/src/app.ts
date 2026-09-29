import express from "express";
import cors from "cors";
import env from "./config/env";
import sessionMiddleware from "./config/session";
import passport from "./config/passport";
import apiRouter from "./routes";
import errorHandler from "./middleware/errorHandler";

const app = express();

app.set("trust proxy", 1);

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", apiRouter);

// 404 for anything under /api not matched above.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Không tìm thấy tài nguyên yêu cầu." });
});

app.use(errorHandler);

export default app;
