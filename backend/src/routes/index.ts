import { Router } from "express";
import requireAuth from "../middleware/requireAuth";

import authRoutes from "./auth.routes";
import classesRoutes from "./classes.routes";
import studentsRoutes from "./students.routes";
import tuitionRoutes from "./tuition.routes";
import dashboardRoutes from "./dashboard.routes";
import overdueRoutes from "./overdue.routes";
import reportsRoutes from "./reports.routes";
import remindersRoutes from "./reminders.routes";

const router = Router();

// Public: /api/auth/* is never behind requireAuth.
router.use("/auth", authRoutes);

// Everything else under /api/* requires an authenticated session.
router.use("/classes", requireAuth, classesRoutes);
router.use("/students", requireAuth, studentsRoutes);
router.use("/tuition", requireAuth, tuitionRoutes);
router.use("/dashboard", requireAuth, dashboardRoutes);
router.use("/overdue", requireAuth, overdueRoutes);
router.use("/reports", requireAuth, reportsRoutes);
router.use("/reminders", requireAuth, remindersRoutes);

export default router;
