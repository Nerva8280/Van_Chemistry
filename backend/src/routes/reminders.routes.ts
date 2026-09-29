import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { runNow } from "../controllers/reminders.controller";

const router = Router();

router.post("/run-now", asyncHandler(runNow));

export default router;
