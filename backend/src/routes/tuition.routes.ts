import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import {
  getTuitionGrid,
  updatePayment,
  bulkMarkPaid,
  bulkEnroll,
  createPayment,
  deletePayment,
} from "../controllers/tuition.controller";

const router = Router();

router.get("/", asyncHandler(getTuitionGrid));
router.post("/payments", asyncHandler(createPayment));
router.post("/payments/bulk-paid", asyncHandler(bulkMarkPaid));
router.post("/payments/bulk-enroll", asyncHandler(bulkEnroll));
router.patch("/payments/:id", asyncHandler(updatePayment));
router.delete("/payments/:id", asyncHandler(deletePayment));

export default router;
