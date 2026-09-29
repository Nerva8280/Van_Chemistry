import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { listClasses, createClass, updateClass, deleteClass } from "../controllers/classes.controller";
import { listPeriods, createPeriod, generateMonthlyPeriods } from "../controllers/periods.controller";

const router = Router();

router.get("/", asyncHandler(listClasses));
router.post("/", asyncHandler(createClass));
router.put("/:id", asyncHandler(updateClass));
router.delete("/:id", asyncHandler(deleteClass));

router.get("/:id/periods", asyncHandler(listPeriods));
router.post("/:id/periods", asyncHandler(createPeriod));
router.post("/:id/periods/generate", asyncHandler(generateMonthlyPeriods));

export default router;
