import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { getDashboard } from "../controllers/dashboard.controller";

const router = Router();

router.get("/", asyncHandler(getDashboard));

export default router;
