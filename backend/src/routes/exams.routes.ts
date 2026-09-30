import express, { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { listExams, getExam, createExam, updateExam, deleteExam } from "../controllers/exams.controller";

const router = Router();

// Đề có ảnh (data URL) nên cần giới hạn lớn hơn mặc định 100kb. app.ts bỏ qua bộ đọc JSON
// chung cho /api/exams để bộ đọc này có hiệu lực. Controller từ chối dữ liệu trên 12 MB.
router.use(express.json({ limit: "15mb" }));

router.get("/", asyncHandler(listExams));
router.get("/:id", asyncHandler(getExam));
router.post("/", asyncHandler(createExam));
router.put("/:id", asyncHandler(updateExam));
router.delete("/:id", asyncHandler(deleteExam));

export default router;
