import { Router } from "express";
import { timingSafeEqual } from "crypto";
import requireAuth from "../middleware/requireAuth";
import env from "../config/env";
import asyncHandler from "../utils/asyncHandler";
import { runReminderSweep } from "../jobs/reminder.job";

import authRoutes from "./auth.routes";
import classesRoutes from "./classes.routes";
import studentsRoutes from "./students.routes";
import tuitionRoutes from "./tuition.routes";
import dashboardRoutes from "./dashboard.routes";
import overdueRoutes from "./overdue.routes";
import reportsRoutes from "./reports.routes";
import remindersRoutes from "./reminders.routes";
import periodsRoutes from "./periods.routes";
import importRoutes from "./import.routes";

const router = Router();

// Public: /api/auth/* is never behind requireAuth.
router.use("/auth", authRoutes);

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// External scheduler entry point: free hosting sleeps, so in-process cron can't be relied on.
router.post(
  "/cron/reminders",
  asyncHandler(async (req, res) => {
    const provided = Buffer.from(String(req.header("x-cron-secret") ?? ""));
    const expected = Buffer.from(env.CRON_SECRET);
    if (!env.CRON_SECRET || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json(await runReminderSweep());
  })
);

// Everything else under /api/* requires an authenticated session.
router.use("/classes", requireAuth, classesRoutes);
router.use("/students", requireAuth, studentsRoutes);
router.use("/tuition", requireAuth, tuitionRoutes);
router.use("/dashboard", requireAuth, dashboardRoutes);
router.use("/overdue", requireAuth, overdueRoutes);
router.use("/reports", requireAuth, reportsRoutes);
router.use("/reminders", requireAuth, remindersRoutes);
router.use("/periods", requireAuth, periodsRoutes);
router.use("/import", requireAuth, importRoutes);

export default router;
