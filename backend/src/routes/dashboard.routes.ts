import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { getSummary, getCharts } from "../controllers/dashboard.controller";

const router = Router();

router.get("/summary", asyncHandler(getSummary));
router.get("/charts", asyncHandler(getCharts));

export default router;
