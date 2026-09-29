import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import upload from "../middleware/upload";
import {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
  exportStudents,
} from "../controllers/students.controller";

const router = Router();

router.get("/export", asyncHandler(exportStudents));
router.post("/import", upload.single("file"), asyncHandler(importStudents));

router.get("/", asyncHandler(listStudents));
router.post("/", asyncHandler(createStudent));
router.put("/:id", asyncHandler(updateStudent));
router.delete("/:id", asyncHandler(deleteStudent));

export default router;
