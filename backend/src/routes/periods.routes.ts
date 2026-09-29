import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { updatePeriod, deletePeriod } from "../controllers/periods.controller";

const router = Router();

router.put("/:id", asyncHandler(updatePeriod));
router.delete("/:id", asyncHandler(deletePeriod));

export default router;
