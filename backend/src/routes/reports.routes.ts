import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import {
  exportStudentsReport,
  exportTuitionSummaryReport,
  exportOverdueReport,
} from "../controllers/reports.controller";

const router = Router();

router.get("/students/export", asyncHandler(exportStudentsReport));
router.get("/tuition-summary/export", asyncHandler(exportTuitionSummaryReport));
router.get("/overdue/export", asyncHandler(exportOverdueReport));

export default router;
