import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { getTuitionGrid, updateTuitionPayment } from "../controllers/tuition.controller";

const router = Router();

router.get("/", asyncHandler(getTuitionGrid));
router.put("/:studentId/:year/:month", asyncHandler(updateTuitionPayment));

export default router;
