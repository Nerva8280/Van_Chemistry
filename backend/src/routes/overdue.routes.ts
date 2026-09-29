import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { getOverdueList } from "../controllers/overdue.controller";

const router = Router();

router.get("/", asyncHandler(getOverdueList));

export default router;
